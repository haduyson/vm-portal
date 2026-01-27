import asyncio
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings
from app.models.virtual_machine_model import VirtualMachine
from app.services.proxmox_client import ProxmoxService
from app.services.cloud_init_generator import CloudInitGenerator
from app.services.telegram_notifier import TelegramNotifier


class VMProvisioningService:
    """Orchestrate VM provisioning with Proxmox, cloud-init, and notifications."""

    def __init__(self):
        self.proxmox = ProxmoxService()
        self.cloud_init = CloudInitGenerator()
        self.telegram = TelegramNotifier()

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
            )

            # Configure cloud-init
            # await self.proxmox.configure_cloud_init(vm.vmid, cloud_init_file)

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
            await self.telegram.send_vm_error(
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
                            vm.ssh_domain = f"{vm.name}.{settings.CF_TUNNEL_DOMAIN}"
                            await session.commit()

                            # Send Telegram notification
                            await self.telegram.send_vm_ready(
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
