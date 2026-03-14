"""Service for installing and configuring Tailscale on VMs via QEMU Guest Agent."""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.proxmox_client import create_proxmox_service_for_vm


class TailscaleInstallationService:
    """Service for installing and authenticating Tailscale on VMs."""

    @staticmethod
    async def is_tailscale_installed(vmid: int, proxmox_service) -> bool:
        """Check if Tailscale is installed on the VM."""
        try:
            result = await proxmox_service.exec_command_wait(
                vmid,
                ["/bin/sh", "-c", "which tailscale || command -v tailscale"],
                timeout=30
            )
            return result.get("exitcode") == 0 and result.get("stdout", "").strip() != ""
        except Exception:
            return False

    @staticmethod
    async def install_tailscale(vmid: int, proxmox_service) -> dict:
        """Install Tailscale on the VM using the official install script."""
        try:
            # Install Tailscale using official script
            result = await proxmox_service.exec_command_wait(
                vmid,
                ["/bin/sh", "-c", "curl -fsSL --connect-timeout 30 --max-time 120 https://tailscale.com/install.sh | sh"],
                timeout=180  # Installation can take time
            )
            if result.get("exitcode") != 0:
                return {
                    "success": False,
                    "error": f"Installation failed: {result.get('stderr', 'Unknown error')}",
                }
            return {"success": True, "output": result.get("stdout", "")}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    async def authenticate_tailscale(vmid: int, proxmox_service, auth_key: str) -> dict:
        """Authenticate Tailscale with the provided auth key."""
        try:
            # Start tailscaled if not running
            await proxmox_service.exec_command_wait(
                vmid,
                ["/bin/sh", "-c", "systemctl enable --now tailscaled || tailscaled &"],
                timeout=30
            )

            # Authenticate with auth key
            result = await proxmox_service.exec_command_wait(
                vmid,
                ["/bin/sh", "-c", f"tailscale up --authkey={auth_key} --accept-routes --ssh"],
                timeout=60
            )
            if result.get("exitcode") != 0:
                return {
                    "success": False,
                    "error": f"Authentication failed: {result.get('stderr', 'Unknown error')}",
                }
            return {"success": True, "output": result.get("stdout", "")}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    async def get_tailscale_ip(vmid: int, proxmox_service) -> Optional[str]:
        """Get the Tailscale IP address of the VM."""
        try:
            result = await proxmox_service.exec_command_wait(
                vmid,
                ["/bin/sh", "-c", "tailscale ip -4 2>/dev/null || tailscale status --json | jq -r '.Self.TailscaleIPs[0]'"],
                timeout=30
            )
            if result.get("exitcode") == 0:
                ip = result.get("stdout", "").strip().split("\n")[0]
                # Validate IP format
                if ip and ip.startswith("100."):  # Tailscale IPs start with 100.x.x.x
                    return ip
            return None
        except Exception:
            return None

    @staticmethod
    async def install_and_authenticate(
        vmid: int,
        proxmox_service,
        auth_key: str
    ) -> dict:
        """Full workflow: install Tailscale and authenticate."""
        # Check if already installed
        is_installed = await TailscaleInstallationService.is_tailscale_installed(vmid, proxmox_service)

        if not is_installed:
            # Install Tailscale
            install_result = await TailscaleInstallationService.install_tailscale(vmid, proxmox_service)
            if not install_result.get("success"):
                return install_result

        # Authenticate
        auth_result = await TailscaleInstallationService.authenticate_tailscale(vmid, proxmox_service, auth_key)
        if not auth_result.get("success"):
            return auth_result

        # Get Tailscale IP
        tailscale_ip = await TailscaleInstallationService.get_tailscale_ip(vmid, proxmox_service)

        return {
            "success": True,
            "tailscale_ip": tailscale_ip,
            "message": "Tailscale installed and authenticated successfully",
        }
