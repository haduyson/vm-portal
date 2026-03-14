"""Service for installing and configuring Tailscale on VMs via QEMU Guest Agent."""

import aiohttp
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.proxmox_client import create_proxmox_service_for_vm

logger = logging.getLogger(__name__)


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

    @staticmethod
    async def get_device_id_by_ip(tailnet: str, api_token: str, tailscale_ip: str) -> Optional[str]:
        """Get Tailscale device ID by its IP address."""
        url = f"https://api.tailscale.com/api/v2/tailnet/{tailnet}/devices"
        headers = {"Authorization": f"Bearer {api_token}"}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        logger.warning(f"Tailscale API error {resp.status}: {error_text[:200]}")
                        return None
                    data = await resp.json()
                    for device in data.get("devices", []):
                        if tailscale_ip in device.get("addresses", []):
                            return device.get("id")
                    return None
        except aiohttp.ClientError as e:
            logger.error(f"Tailscale API network error: {e}")
            return None
        except Exception as e:
            logger.error(f"Tailscale get_device_id unexpected error: {e}")
            return None

    @staticmethod
    async def share_device_with_user(
        tailnet: str,
        api_token: str,
        device_id: str,
        user_email: str,
    ) -> dict:
        """Share a Tailscale device with an external user via email.

        The user will receive a notification in their Tailscale app to accept the share.
        """
        url = f"https://api.tailscale.com/api/v2/tailnet/{tailnet}/devices/{device_id}/shares"
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
        payload = {"shareId": user_email}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status in (200, 201):
                        logger.info(f"Tailscale share request sent to {user_email} for device {device_id}")
                        return {
                            "success": True,
                            "message": f"Share request sent to {user_email}",
                        }
                    else:
                        error_text = await resp.text()
                        logger.warning(f"Tailscale share API error {resp.status}: {error_text[:200]}")
                        try:
                            error_data = await resp.json()
                            error_msg = error_data.get("message", f"HTTP {resp.status}")
                        except Exception:
                            error_msg = f"HTTP {resp.status}"
                        return {"success": False, "error": error_msg}
        except aiohttp.ClientError as e:
            logger.error(f"Tailscale share API network error: {e}")
            return {"success": False, "error": f"Network error: {e}"}
        except Exception as e:
            logger.error(f"Tailscale share unexpected error: {e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    async def auto_share_vm_to_user(
        tailnet: str,
        api_token: str,
        tailscale_ip: str,
        user_email: str,
    ) -> dict:
        """Auto-share VM to user by IP. Combines device lookup + share."""
        if not tailnet or not api_token:
            return {"success": False, "error": "Tailscale API not configured"}

        if not user_email:
            return {"success": False, "error": "User has no Tailscale email configured"}

        # Get device ID
        device_id = await TailscaleInstallationService.get_device_id_by_ip(
            tailnet, api_token, tailscale_ip
        )
        if not device_id:
            return {"success": False, "error": f"Device not found for IP {tailscale_ip}"}

        # Share device
        return await TailscaleInstallationService.share_device_with_user(
            tailnet, api_token, device_id, user_email
        )

    @staticmethod
    async def delete_device(tailnet: str, api_token: str, device_id: str) -> dict:
        """Delete a device from Tailscale network."""
        url = f"https://api.tailscale.com/api/v2/device/{device_id}"
        headers = {"Authorization": f"Bearer {api_token}"}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.delete(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status in (200, 204):
                        logger.info(f"Tailscale device {device_id} deleted")
                        return {"success": True}
                    else:
                        error_text = await resp.text()
                        logger.warning(f"Tailscale delete device error {resp.status}: {error_text[:200]}")
                        return {"success": False, "error": f"HTTP {resp.status}"}
        except aiohttp.ClientError as e:
            logger.error(f"Tailscale delete device network error: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Tailscale delete device unexpected error: {e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    async def delete_device_by_ip(tailnet: str, api_token: str, tailscale_ip: str) -> dict:
        """Delete Tailscale device by its IP address."""
        if not tailnet or not api_token or not tailscale_ip:
            return {"success": False, "error": "Missing required parameters"}

        device_id = await TailscaleInstallationService.get_device_id_by_ip(
            tailnet, api_token, tailscale_ip
        )
        if not device_id:
            return {"success": False, "error": f"Device not found for IP {tailscale_ip}"}

        return await TailscaleInstallationService.delete_device(tailnet, api_token, device_id)
