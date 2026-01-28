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
        vm_id: int,
        template_vmid: int,
        user_telegram_chat_id: Optional[str] = None,
    ):
        """
        Background task to provision a VM by cloning a cloud-init template.
        Creates its own DB session to avoid sharing with the request lifecycle.
        Clone template → resize disk → set hardware → configure cloud-init → start.
        """
        from app.database import AsyncSessionLocal

        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(VirtualMachine).where(VirtualMachine.id == vm_id)
                )
                vm = result.scalar_one_or_none()
                if not vm:
                    print(f"VM {vm_id} not found in database")
                    return

                # Generate SSH credentials
                ssh_username, ssh_password = self.cloud_init.generate_credentials()

                # Generate and save custom cloud-init user-data (includes qemu-guest-agent)
                user_data = self.cloud_init.generate_user_data(vm.name, ssh_username, ssh_password)
                userdata_file = self.cloud_init.save_to_snippets(vm.vmid, user_data)
                print(f"Cloud-init saved to snippets: {userdata_file}")

                # Step 1: Clone template
                upid = await self.proxmox.clone_template(
                    template_vmid=template_vmid,
                    new_vmid=vm.vmid,
                    name=vm.name,
                    storage=vm.storage,
                )

                # Step 2: Wait for clone to complete
                await self.proxmox.wait_for_task(upid, timeout=600)

                # Wait for Proxmox lock file to be released after clone
                await self._wait_for_lock_release(vm.vmid, timeout=120)

                # Step 3: Set hardware (cores, memory, network, cloud-init drive, VGA)
                await self.proxmox.set_vm_config(
                    vm.vmid,
                    cores=vm.cores,
                    memory=vm.memory_mb,
                    net0="virtio,bridge=vmbr0",  # Enable network adapter
                    ide2=f"{vm.storage}:cloudinit",  # Cloud-init drive
                    vga="std",  # Override serial console from template
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

                # Step 5: Configure cloud-init with custom user-data (includes qemu-guest-agent)
                await self.proxmox.configure_cloud_init_user(
                    vm.vmid, ssh_username, ssh_password, userdata_file=userdata_file
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
            async with AsyncSessionLocal() as session:
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
        vm_id: int,
        user_telegram_chat_id: Optional[str] = None,
    ):
        """
        Background task to provision a VM.
        Creates its own DB session to avoid sharing with the request lifecycle.
        """
        from app.database import AsyncSessionLocal

        try:
            async with AsyncSessionLocal() as session:
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

                # Save to snippets
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
            async with AsyncSessionLocal() as session:
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

    @staticmethod
    async def _wait_for_lock_release(vmid: int, timeout: int = 120):
        """Wait until Proxmox lock file for VM is released."""
        import os
        lock_path = f"/var/lock/qemu-server/lock-{vmid}.conf"
        elapsed = 0
        while os.path.exists(lock_path) and elapsed < timeout:
            await asyncio.sleep(5)
            elapsed += 5
        if os.path.exists(lock_path):
            print(f"Warning: lock {lock_path} still exists after {timeout}s, proceeding anyway")

    async def _poll_vm_readiness(
        self,
        vm_id: int,
        vmid: int,
        user_telegram_chat_id: Optional[str] = None,
        max_attempts: int = 40,
    ):
        """
        Poll VM status until running, then poll for IP address.
        Phase 1: Wait for VM to be running (update status immediately)
        Phase 2: Wait for IP address (for notification and CF tunnel)
        """
        from app.database import AsyncSessionLocal

        attempts = 0
        vm_is_running = False

        # Phase 1: Wait for VM to be running
        while attempts < max_attempts and not vm_is_running:
            await asyncio.sleep(15)  # Poll every 15 seconds for running status
            attempts += 1

            try:
                status = await self.proxmox.get_vm_status(vmid)
                print(f"Poll {vmid} attempt {attempts}: status={status.get('status')}, ip={status.get('ip_address')}")

                if status.get("status") == "running":
                    vm_is_running = True
                    # Update status to running immediately (don't wait for IP)
                    async with AsyncSessionLocal() as session:
                        result = await session.execute(
                            select(VirtualMachine).where(VirtualMachine.id == vm_id)
                        )
                        vm = result.scalar_one_or_none()
                        if vm and vm.status != "running":
                            vm.status = "running"
                            await session.commit()
                            print(f"VM {vmid} status updated to running")

                    # If IP is already available, skip to phase 2 completion
                    if status.get("ip_address"):
                        await self._complete_vm_setup(
                            vm_id, vmid, status["ip_address"], user_telegram_chat_id
                        )
                        return

            except Exception as e:
                print(f"Error polling VM {vmid} running status (attempt {attempts}): {e}")

        if not vm_is_running:
            # VM never started running
            await self._mark_vm_error(vm_id, vmid, user_telegram_chat_id, "VM không thể khởi động")
            return

        # Phase 2: Wait for IP address (additional 20 attempts)
        ip_attempts = 0
        max_ip_attempts = 20

        while ip_attempts < max_ip_attempts:
            await asyncio.sleep(15)  # Poll every 15 seconds for IP
            ip_attempts += 1

            try:
                status = await self.proxmox.get_vm_status(vmid)
                ip_address = status.get("ip_address")
                print(f"Poll {vmid} IP attempt {ip_attempts}: ip={ip_address}")

                if ip_address:
                    await self._complete_vm_setup(
                        vm_id, vmid, ip_address, user_telegram_chat_id
                    )
                    return

            except Exception as e:
                print(f"Error polling VM {vmid} IP (attempt {ip_attempts}): {e}")

        # IP not found but VM is running - still okay, just log warning
        print(f"Warning: VM {vmid} running but no IP after {max_ip_attempts} attempts")
        # Don't mark as error - VM is working, just no guest agent IP

    async def _complete_vm_setup(
        self,
        vm_id: int,
        vmid: int,
        ip_address: str,
        user_telegram_chat_id: Optional[str] = None,
    ):
        """Complete VM setup with IP: update DB, setup CF tunnel, send notification."""
        from app.database import AsyncSessionLocal

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

    async def _mark_vm_error(
        self,
        vm_id: int,
        vmid: int,
        user_telegram_chat_id: Optional[str] = None,
        error_message: str = "VM không thể khởi động sau nhiều lần thử",
    ):
        """Mark VM as error and send notification."""
        from app.database import AsyncSessionLocal

        print(f"VM {vmid} failed: {error_message}")
        async with AsyncSessionLocal() as session:
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
                vm.name if vm else f"VM {vmid}",
                error_message,
            )
