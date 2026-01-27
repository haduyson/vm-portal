import asyncio
from typing import Dict, Optional
from proxmoxer import ProxmoxAPI
from app.config import settings


class ProxmoxService:
    """Service for interacting with Proxmox VE API."""

    def __init__(self):
        self.proxmox = ProxmoxAPI(
            settings.PROXMOX_HOST,
            port=settings.PROXMOX_PORT,
            user=settings.PROXMOX_USER,
            token_name=settings.PROXMOX_TOKEN_NAME,
            token_value=settings.PROXMOX_TOKEN_VALUE,
            verify_ssl=settings.PROXMOX_VERIFY_SSL,
        )
        self.node = settings.PROXMOX_NODE

    async def get_next_vmid(self) -> int:
        """Get the next available VMID from Proxmox."""
        def _get_next_vmid():
            return self.proxmox.cluster.nextid.get()

        return await asyncio.to_thread(_get_next_vmid)

    async def create_vm(
        self,
        vmid: int,
        name: str,
        cores: int,
        memory_mb: int,
        disk_gb: int,
        storage: str,
        iso: str,
    ) -> Dict:
        """Create a new VM in Proxmox."""
        def _create_vm():
            return self.proxmox.nodes(self.node).qemu.post(
                vmid=vmid,
                name=name,
                cores=cores,
                memory=memory_mb,
                scsihw="virtio-scsi-pci",
                scsi0=f"{storage}:{disk_gb}",
                ide2=f"{settings.PROXMOX_ISO_STORAGE}:iso/{iso},media=cdrom",
                net0="virtio,bridge=vmbr0",
                boot="order=ide2;scsi0",
                ostype="l26",  # Linux 2.6+ kernel
                agent="enabled=1",
            )

        return await asyncio.to_thread(_create_vm)

    async def start_vm(self, vmid: int) -> Dict:
        """Start a VM."""
        def _start_vm():
            return self.proxmox.nodes(self.node).qemu(vmid).status.start.post()

        return await asyncio.to_thread(_start_vm)

    async def get_vm_status(self, vmid: int) -> Dict:
        """Get VM status including IP from QEMU guest agent."""
        def _get_status():
            try:
                status = self.proxmox.nodes(self.node).qemu(vmid).status.current.get()
                result = {"status": status.get("status"), "ip_address": None}

                # Try to get IP from QEMU guest agent
                if status.get("status") == "running":
                    try:
                        interfaces = self.proxmox.nodes(self.node).qemu(vmid).agent("network-get-interfaces").get()
                        for iface in interfaces.get("result", []):
                            if iface.get("name") not in ["lo", "docker0"]:
                                for addr in iface.get("ip-addresses", []):
                                    if addr.get("ip-address-type") == "ipv4":
                                        result["ip_address"] = addr.get("ip-address")
                                        return result
                    except Exception:
                        pass  # QEMU agent not ready yet

                return result
            except Exception as e:
                return {"status": "unknown", "error": str(e)}

        return await asyncio.to_thread(_get_status)

    async def configure_cloud_init(self, vmid: int, userdata_file: str) -> Dict:
        """Configure cloud-init for a VM."""
        def _configure():
            return self.proxmox.nodes(self.node).qemu(vmid).config.put(
                cicustom=f"user={settings.PROXMOX_ISO_STORAGE}:snippets/{userdata_file}"
            )

        return await asyncio.to_thread(_configure)

    async def stop_vm(self, vmid: int) -> Dict:
        """Stop a VM."""
        def _stop_vm():
            return self.proxmox.nodes(self.node).qemu(vmid).status.stop.post()

        return await asyncio.to_thread(_stop_vm)

    async def delete_vm(self, vmid: int) -> Dict:
        """Delete a VM."""
        def _delete_vm():
            return self.proxmox.nodes(self.node).qemu(vmid).delete()

        return await asyncio.to_thread(_delete_vm)

    async def get_vm_resources(self, vmid: int) -> Dict:
        """Get VM resource usage (CPU, memory, disk)."""
        def _get_resources():
            try:
                status = self.proxmox.nodes(self.node).qemu(vmid).status.current.get()

                # Calculate percentages
                cpu_percent = round(status.get('cpu', 0) * 100, 2)

                mem_used = status.get('mem', 0)
                mem_max = status.get('maxmem', 1)
                memory_used_mb = round(mem_used / (1024 * 1024), 2)
                memory_total_mb = round(mem_max / (1024 * 1024), 2)

                disk_used = status.get('disk', 0)
                disk_max = status.get('maxdisk', 1)
                disk_used_gb = round(disk_used / (1024 * 1024 * 1024), 2)
                disk_total_gb = round(disk_max / (1024 * 1024 * 1024), 2)

                return {
                    'cpu_percent': cpu_percent,
                    'memory_used_mb': memory_used_mb,
                    'memory_total_mb': memory_total_mb,
                    'disk_used_gb': disk_used_gb,
                    'disk_total_gb': disk_total_gb,
                }
            except Exception as e:
                return {
                    'error': str(e),
                    'cpu_percent': 0,
                    'memory_used_mb': 0,
                    'memory_total_mb': 0,
                    'disk_used_gb': 0,
                    'disk_total_gb': 0,
                }

        return await asyncio.to_thread(_get_resources)
