import asyncio
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings
from app.models.virtual_machine_model import VirtualMachine
from app.services.proxmox_client import ProxmoxService, create_proxmox_service
from app.services.cloud_init_generator import CloudInitGenerator
from app.services.telegram_notifier import TelegramNotifier


class VMProvisioningService:
    """Orchestrate VM provisioning with Proxmox, cloud-init, and notifications."""

    def __init__(self, proxmox: Optional[ProxmoxService] = None, iso_storage: Optional[str] = None):
        self.proxmox = proxmox or ProxmoxService()
        self.cloud_init = CloudInitGenerator()
        self.iso_storage = iso_storage

    @classmethod
    async def create(cls, session: AsyncSession) -> "VMProvisioningService":
        """Factory: create with DB-configured ProxmoxService."""
        proxmox = await create_proxmox_service(session)
        return cls(proxmox=proxmox)

    async def provision_vm_cloudinit(
        self,
        session: AsyncSession,
        vm_id: int,
        template_vmid: int,
        user_telegram_chat_id: Optional[str] = None,
    ):
        """
        Background task to provision a VM by cloning a cloud-init template.
        Clone template → resize disk → set hardware → configure cloud-init → start.
        """
        try:
            result = await session.execute(
                select(VirtualMachine).where(VirtualMachine.id == vm_id)
            )
            vm = result.scalar_one_or_none()
            if not vm:
                print(f"VM {vm_id} not found in database")
                return

            # Generate SSH credentials
            ssh_username, ssh_password = self.cloud_init.generate_credentials()

            # Step 1: Clone template
            upid = await self.proxmox.clone_template(
                template_vmid=template_vmid,
                new_vmid=vm.vmid,
                name=vm.name,
                storage=vm.storage,
            )

            # Step 2: Wait for clone to complete
            await self.proxmox.wait_for_task(upid, timeout=600)

            # Brief delay to ensure clone lock is fully released
            await asyncio.sleep(5)

            # Step 3: Set hardware (cores, memory)
            await self.proxmox.set_vm_config(
                vm.vmid,
                cores=vm.cores,
                memory=vm.memory_mb,
            )

            # Step 4: Resize disk to requested size (retry on lock/timeout)
            for attempt in range(3):
                try:
                    await self.proxmox.resize_disk(vm.vmid, "scsi0", vm.disk_gb)
                    break
                except Exception as resize_err:
                    if attempt < 2 and ("lock" in str(resize_err).lower() or "timeout" in str(resize_err).lower()):
                        print(f"Resize attempt {attempt + 1} failed, retrying: {resize_err}")
                        await asyncio.sleep(10)
                    else:
                        raise

            # Step 5: Configure cloud-init user credentials and network
            await self.proxmox.configure_cloud_init_user(
                vm.vmid, ssh_username, ssh_password
            )

            # Step 6: Start VM
            await self.proxmox.start_vm(vm.vmid)

            # Update VM status
            vm.status = "installing"
            vm.ssh_username = ssh_username
            vm.ssh_password = ssh_password
            await session.commit()

            # Start polling for VM readiness in background
            asyncio.create_task(
                self._poll_vm_readiness(vm.id, vm.vmid, user_telegram_chat_id)
            )

        except Exception as e:
            print(f"Error provisioning cloud-init VM {vm_id}: {e}")
            result = await session.execute(
                select(VirtualMachine).where(VirtualMachine.id == vm_id)
            )
            vm = result.scalar_one_or_none()
            if vm:
                vm.status = "error"
                await session.commit()

            telegram = await TelegramNotifier.from_db_config(session)
            await telegram.send_vm_error(
                user_telegram_chat_id,
                vm.name if vm else "Unknown",
                str(e),
            )

    async def provision_vm(
        self,
        session: AsyncSession,
        vm_id: int,
        user_telegram_chat_id: Optional[str] = None,
    ):
        """
        Background task to provision a VM.
        Updates VM status in database and sends notifications.
        """
        try:
            # Get VM from database
            result = await session.execute(
                select(VirtualMachine).where(VirtualMachine.id == vm_id)
            )
            vm = result.scalar_one_or_none()

            if not vm:
                print(f"VM {vm_id} not found in database")
                return

            # Generate SSH credentials
            ssh_username, ssh_password = self.cloud_init.generate_credentials()

            # Generate cloud-init configuration
            user_data = self.cloud_init.generate_user_data(
                vm.name, ssh_username, ssh_password
            )

            # Save to snippets (TODO: implement actual file writing)
            cloud_init_file = self.cloud_init.save_to_snippets(vm.vmid, user_data)

            # Create VM in Proxmox
            await self.proxmox.create_vm(
                vmid=vm.vmid,
                name=vm.name,
                cores=vm.cores,
                memory_mb=vm.memory_mb,
                disk_gb=vm.disk_gb,
                storage=vm.storage,
                iso=settings.PROXMOX_ISO_IMAGE,
                iso_storage=self.iso_storage,
            )

            # Configure cloud-init
            # await self.proxmox.configure_cloud_init(vm.vmid, cloud_init_file, iso_storage=self.iso_storage)

            # Start VM
            await self.proxmox.start_vm(vm.vmid)

            # Update VM status
            vm.status = "installing"
            vm.ssh_username = ssh_username
            vm.ssh_password = ssh_password
            await session.commit()

            # Start polling for VM readiness in background
            asyncio.create_task(
                self._poll_vm_readiness(vm.id, vm.vmid, user_telegram_chat_id)
            )

        except Exception as e:
            print(f"Error provisioning VM {vm_id}: {e}")
            # Update VM status to error
            result = await session.execute(
                select(VirtualMachine).where(VirtualMachine.id == vm_id)
            )
            vm = result.scalar_one_or_none()
            if vm:
                vm.status = "error"
                await session.commit()

            # Send error notification
            telegram = await TelegramNotifier.from_db_config(session)
            await telegram.send_vm_error(
                user_telegram_chat_id,
                vm.name if vm else "Unknown",
                str(e),
            )

    async def _poll_vm_readiness(
        self,
        vm_id: int,
        vmid: int,
        user_telegram_chat_id: Optional[str] = None,
        max_attempts: int = 40,
    ):
        """
        Poll VM status until it has an IP address and is ready.
        Runs as a background task.
        """
        from app.database import AsyncSessionLocal

        attempts = 0

        while attempts < max_attempts:
            await asyncio.sleep(30)  # Poll every 30 seconds
            attempts += 1

            try:
                # Get VM status from Proxmox
                status = await self.proxmox.get_vm_status(vmid)

                if status.get("status") == "running" and status.get("ip_address"):
                    ip_address = status["ip_address"]

                    # Update VM in database
                    async with AsyncSessionLocal() as session:
                        result = await session.execute(
                            select(VirtualMachine).where(VirtualMachine.id == vm_id)
                        )
                        vm = result.scalar_one_or_none()

                        if vm:
                            vm.status = "running"
                            vm.ip_address = ip_address

                            # Setup Cloudflare tunnel SSH if subdomain was pre-set
                            if vm.ssh_domain:
                                try:
                                    import importlib
                                    # Find matching CloudflareDomain
                                    _cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
                                    CloudflareDomain = _cf_domain_model.CloudflareDomain

                                    domains_result = await session.execute(
                                        select(CloudflareDomain).where(CloudflareDomain.is_active == True)
                                    )
                                    domains = domains_result.scalars().all()

                                    for d in domains:
                                        if vm.ssh_domain.endswith(f".{d.domain}"):
                                            subdomain = vm.ssh_domain.replace(f".{d.domain}", "")
                                            _cf_mod = importlib.import_module("app.services.cloudflare-tunnel-service")
                                            cf_service = _cf_mod.CloudflareTunnelService(
                                                api_token=d.cf_api_token,
                                                zone_id=d.cf_zone_id,
                                                tunnel_id=d.cf_tunnel_id,
                                                tunnel_name=d.cf_tunnel_name,
                                                base_domain=d.domain,
                                                config_path=d.cloudflared_config_path,
                                            )
                                            await cf_service.add_ssh_ingress(subdomain, ip_address)
                                            print(f"Cloudflare tunnel configured: {vm.ssh_domain} → {ip_address}")
                                            break
                                except Exception as cf_err:
                                    print(f"Warning: Failed to setup CF tunnel for {vm.ssh_domain}: {cf_err}")
                            elif not vm.ssh_domain:
                                # Fallback: use legacy domain format
                                vm.ssh_domain = f"{vm.name}.{settings.CF_TUNNEL_DOMAIN}"

                            await session.commit()

                            # Send Telegram notification
                            telegram = await TelegramNotifier.from_db_config(session)
                            await telegram.send_vm_ready(
                                user_telegram_chat_id,
                                vm.name,
                                ip_address,
                                vm.ssh_username or "unknown",
                                vm.ssh_password or "unknown",
                                vm.ssh_domain,
                            )

                            print(f"VM {vmid} is ready with IP {ip_address}")
                            return

            except Exception as e:
                print(f"Error polling VM {vmid} status (attempt {attempts}): {e}")

        # Max attempts reached - mark as error
        print(f"VM {vmid} failed to become ready after {max_attempts} attempts")
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(VirtualMachine).where(VirtualMachine.id == vm_id)
            )
            vm = result.scalar_one_or_none()
            if vm:
                vm.status = "error"
                await session.commit()

            await self.telegram.send_vm_error(
                user_telegram_chat_id,
                vm.name if vm else f"VM {vmid}",
                "VM không thể khởi động sau nhiều lần thử",
            )
