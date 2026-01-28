import asyncio
from typing import Dict, Optional
from proxmoxer import ProxmoxAPI
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings


class ProxmoxService:
    """Service for interacting with Proxmox VE API."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        user: Optional[str] = None,
        token_name: Optional[str] = None,
        token_value: Optional[str] = None,
        node: Optional[str] = None,
        iso_storage: Optional[str] = None,
    ):
        self.proxmox = ProxmoxAPI(
            host or settings.PROXMOX_HOST,
            port=port or settings.PROXMOX_PORT,
            user=user or settings.PROXMOX_USER,
            token_name=token_name or settings.PROXMOX_TOKEN_NAME,
            token_value=token_value or settings.PROXMOX_TOKEN_VALUE,
            verify_ssl=settings.PROXMOX_VERIFY_SSL,
        )
        self.node = node or settings.PROXMOX_NODE
        self.iso_storage = iso_storage or "local"

    @classmethod
    def from_server(cls, server) -> "ProxmoxService":
        """Create ProxmoxService from a ProxmoxServer DB model."""
        return cls(
            host=server.host,
            port=server.port,
            user=server.user,
            token_name=server.token_name,
            token_value=server.token_value,
            node=server.node,
        )

    async def get_nodes(self) -> list:
        """Get list of node names from Proxmox cluster."""
        def _get():
            return self.proxmox.nodes.get()
        return await asyncio.to_thread(_get)

    async def get_storages(self, content_filter: str = None) -> list:
        """Get available storages from Proxmox node.
        Returns list of dicts: {storage, type, content, total, used, avail, active}
        content_filter: e.g. 'images' for VM disk, 'iso' for ISO files
        """
        def _get():
            storages = self.proxmox.nodes(self.node).storage.get()
            if content_filter:
                return [s for s in storages if content_filter in s.get('content', '')]
            return storages
        return await asyncio.to_thread(_get)

    async def get_node_resources(self) -> Dict:
        """Get node-level CPU/RAM/Disk usage from Proxmox."""
        def _get_resources():
            try:
                node_status = self.proxmox.nodes(self.node).status.get()

                cpu_percent = round(node_status.get("cpu", 0) * 100, 2)

                mem_used = node_status.get("memory", {}).get("used", 0)
                mem_total = node_status.get("memory", {}).get("total", 1)
                memory_used_mb = round(mem_used / (1024 * 1024), 2)
                memory_total_mb = round(mem_total / (1024 * 1024), 2)

                rootfs = node_status.get("rootfs", {})
                disk_used_gb = round(rootfs.get("used", 0) / (1024 ** 3), 2)
                disk_total_gb = round(rootfs.get("total", 1) / (1024 ** 3), 2)

                return {
                    "cpu_percent": cpu_percent,
                    "memory_used_mb": memory_used_mb,
                    "memory_total_mb": memory_total_mb,
                    "disk_used_gb": disk_used_gb,
                    "disk_total_gb": disk_total_gb,
                }
            except Exception as e:
                return {
                    "cpu_percent": 0,
                    "memory_used_mb": 0,
                    "memory_total_mb": 0,
                    "disk_used_gb": 0,
                    "disk_total_gb": 0,
                }

        return await asyncio.to_thread(_get_resources)

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
        iso_storage: str = None,
    ) -> Dict:
        """Create a new VM in Proxmox."""
        iso_storage = iso_storage or self.iso_storage

        def _create_vm():
            return self.proxmox.nodes(self.node).qemu.post(
                vmid=vmid,
                name=name,
                cores=cores,
                memory=memory_mb,
                scsihw="virtio-scsi-pci",
                scsi0=f"{storage}:{disk_gb}",
                ide2=f"{iso_storage}:iso/{iso},media=cdrom",
                net0="virtio,bridge=vmbr0",
                boot="order=ide2;scsi0",
                ostype="l26",
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
                        pass

                return result
            except Exception as e:
                return {"status": "unknown", "error": str(e)}

        return await asyncio.to_thread(_get_status)

    async def configure_cloud_init(self, vmid: int, userdata_file: str, iso_storage: str = None) -> Dict:
        """Configure cloud-init for a VM."""
        iso_storage = iso_storage or self.iso_storage

        def _configure():
            return self.proxmox.nodes(self.node).qemu(vmid).config.put(
                cicustom=f"user={iso_storage}:snippets/{userdata_file}"
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

    async def clone_vm(self, source_vmid: int, new_vmid: int, name: str) -> Dict:
        """Clone a VM in Proxmox."""
        def _clone_vm():
            return self.proxmox.nodes(self.node).qemu(source_vmid).clone.post(
                newid=new_vmid,
                name=name,
                full=1,
            )

        return await asyncio.to_thread(_clone_vm)

    async def get_vm_rrddata(self, vmid: int, timeframe: str = "hour") -> list:
        """Get VM RRD data for resource usage charts."""
        def _get_rrddata():
            return self.proxmox.nodes(self.node).qemu(vmid).rrddata.get(
                timeframe=timeframe
            )

        return await asyncio.to_thread(_get_rrddata)

    async def create_vnc_proxy(self, vmid: int) -> Dict:
        """Create a VNC proxy connection for noVNC console."""
        def _create_proxy():
            return self.proxmox.nodes(self.node).qemu(vmid).vncproxy.post(
                websocket=1
            )

        return await asyncio.to_thread(_create_proxy)

    async def get_vm_network_interfaces(self, vmid: int) -> list:
        """Get VM network interfaces via QEMU guest agent."""
        def _get_interfaces():
            try:
                result = self.proxmox.nodes(self.node).qemu(vmid).agent("network-get-interfaces").get()
                return result.get("result", [])
            except Exception:
                return []

        return await asyncio.to_thread(_get_interfaces)

    async def get_firewall_rules(self, vmid: int) -> list:
        """Get VM firewall rules."""
        def _get_rules():
            return self.proxmox.nodes(self.node).qemu(vmid).firewall.rules.get()

        return await asyncio.to_thread(_get_rules)

    async def add_firewall_rule(self, vmid: int, rule: Dict) -> Dict:
        """Add a firewall rule to a VM."""
        def _add_rule():
            return self.proxmox.nodes(self.node).qemu(vmid).firewall.rules.post(**rule)

        return await asyncio.to_thread(_add_rule)

    async def delete_firewall_rule(self, vmid: int, pos: int) -> Dict:
        """Delete a firewall rule by position."""
        def _delete_rule():
            return self.proxmox.nodes(self.node).qemu(vmid).firewall.rules(pos).delete()

        return await asyncio.to_thread(_delete_rule)

    async def get_firewall_options(self, vmid: int) -> Dict:
        """Get VM firewall options."""
        def _get_options():
            return self.proxmox.nodes(self.node).qemu(vmid).firewall.options.get()

        return await asyncio.to_thread(_get_options)

    async def set_firewall_options(self, vmid: int, options: Dict) -> Dict:
        """Set VM firewall options."""
        def _set_options():
            return self.proxmox.nodes(self.node).qemu(vmid).firewall.options.put(**options)

        return await asyncio.to_thread(_set_options)

    async def get_vm_resources(self, vmid: int) -> Dict:
        """Get VM resource usage (CPU, memory, disk)."""
        def _get_resources():
            try:
                status = self.proxmox.nodes(self.node).qemu(vmid).status.current.get()

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
                    'cpu_percent': 0,
                    'memory_used_mb': 0,
                    'memory_total_mb': 0,
                    'disk_used_gb': 0,
                    'disk_total_gb': 0,
                }

        return await asyncio.to_thread(_get_resources)


async def create_proxmox_service(session: AsyncSession) -> ProxmoxService:
    """Factory: create ProxmoxService with DB config (fallback to env)."""
    from app.services.system_settings_service import get_proxmox_config
    config = await get_proxmox_config(session)
    return ProxmoxService(host=config["host"], token_value=config["token_value"])


async def create_proxmox_service_for_server(server_id: int, session: AsyncSession) -> ProxmoxService:
    """Create ProxmoxService from a specific server in the DB. Falls back to env vars."""
    from app.models.proxmox_server_model import ProxmoxServer
    from sqlalchemy import select

    result = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if server:
        return ProxmoxService.from_server(server)

    # Fallback to env vars
    return ProxmoxService()


async def create_proxmox_service_for_vm(vm, session: AsyncSession) -> ProxmoxService:
    """Create ProxmoxService for a VM. Uses vm.proxmox_server_id if set, else falls back."""
    if vm.proxmox_server_id:
        return await create_proxmox_service_for_server(vm.proxmox_server_id, session)
    # Backward compat: VM created before multi-server
    return await create_proxmox_service(session)
