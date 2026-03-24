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
            timeout=300,
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

    async def get_storage_allocated_bytes(self, storage_name: str) -> int:
        """Get total allocated (provisioned) bytes for a storage by summing all volume sizes."""
        def _get():
            try:
                contents = self.proxmox.nodes(self.node).storage(storage_name).content.get()
                return sum(item.get('size', 0) for item in contents)
            except Exception:
                return 0
        return await asyncio.to_thread(_get)

    async def get_node_resources(self) -> Dict:
        """Get node-level CPU/RAM/Disk usage with CPU info and VM allocations."""
        def _get_resources():
            try:
                node_status = self.proxmox.nodes(self.node).status.get()

                # CPU info
                cpuinfo = node_status.get("cpuinfo", {})
                cpu_model = cpuinfo.get("model", "Unknown")
                cpu_sockets = cpuinfo.get("sockets", 1)
                cpu_cores_per_socket = cpuinfo.get("cores", 1)
                cpu_total_cores = cpuinfo.get("cpus", cpu_sockets * cpu_cores_per_socket)
                cpu_percent = round(node_status.get("cpu", 0) * 100, 2)

                # RAM
                mem_used = node_status.get("memory", {}).get("used", 0)
                mem_total = node_status.get("memory", {}).get("total", 1)
                memory_used_mb = round(mem_used / (1024 * 1024), 2)
                memory_total_mb = round(mem_total / (1024 * 1024), 2)

                # VM allocations (cores + RAM)
                allocated_cores = 0
                allocated_ram_mb = 0
                try:
                    vms = self.proxmox.nodes(self.node).qemu.get()
                    for vm in vms:
                        allocated_cores += vm.get("cpus", 0)
                        allocated_ram_mb += round(vm.get("maxmem", 0) / (1024 * 1024), 2)
                except Exception:
                    pass

                # Disk: sum ALL storages (not just rootfs)
                disk_total_gb = 0.0
                disk_used_gb = 0.0
                disk_allocated_gb = 0.0
                try:
                    storages = self.proxmox.nodes(self.node).storage.get()
                    for s in storages:
                        if s.get("active", 0) == 1:
                            disk_total_gb += s.get("total", 0) / (1024 ** 3)
                            disk_used_gb += s.get("used", 0) / (1024 ** 3)
                    disk_total_gb = round(disk_total_gb, 2)
                    disk_used_gb = round(disk_used_gb, 2)
                except Exception:
                    pass

                # Disk allocated: sum provisioned disk from all VMs
                try:
                    for vm in vms:
                        disk_allocated_gb += vm.get("maxdisk", 0) / (1024 ** 3)
                    disk_allocated_gb = round(disk_allocated_gb, 2)
                except Exception:
                    pass

                return {
                    "cpu_model": cpu_model,
                    "cpu_sockets": cpu_sockets,
                    "cpu_cores_per_socket": cpu_cores_per_socket,
                    "cpu_total_cores": cpu_total_cores,
                    "cpu_percent": cpu_percent,
                    "cpu_allocated_cores": allocated_cores,
                    "memory_used_mb": memory_used_mb,
                    "memory_total_mb": memory_total_mb,
                    "memory_allocated_mb": round(allocated_ram_mb, 2),
                    "disk_used_gb": disk_used_gb,
                    "disk_total_gb": disk_total_gb,
                    "disk_allocated_gb": disk_allocated_gb,
                }
            except Exception:
                return {
                    "cpu_model": "Unknown",
                    "cpu_sockets": 0,
                    "cpu_cores_per_socket": 0,
                    "cpu_total_cores": 0,
                    "cpu_percent": 0,
                    "cpu_allocated_cores": 0,
                    "memory_used_mb": 0,
                    "memory_total_mb": 0,
                    "memory_allocated_mb": 0,
                    "disk_used_gb": 0,
                    "disk_total_gb": 0,
                    "disk_allocated_gb": 0,
                }

        return await asyncio.to_thread(_get_resources)

    async def get_next_vmid(self) -> int:
        """Get the next available VMID from Proxmox."""
        def _get_next_vmid():
            return int(self.proxmox.cluster.nextid.get())

        return await asyncio.to_thread(_get_next_vmid)

    async def create_vm(
        self,
        vmid: int,
        name: str,
        cores: int,
        memory_gb: int,
        disk_gb: int,
        storage: str,
        iso: str,
        iso_storage: str = None,
    ) -> Dict:
        """Create a new VM in Proxmox."""
        iso_storage = iso_storage or self.iso_storage
        memory_mb = memory_gb * 1024  # Convert GB to MB for Proxmox API

        def _create_vm():
            return self.proxmox.nodes(self.node).qemu.post(
                vmid=vmid,
                name=name,
                cores=cores,
                memory=memory_mb,
                cpu="host",  # Pass through host CPU features (AVX, AVX2, etc.)
                scsihw="virtio-scsi-pci",
                scsi0=f"{storage}:{disk_gb}",
                ide2=f"{iso_storage}:iso/{iso},media=cdrom",
                net0="virtio,bridge=vmbr0",
                boot="order=ide2;scsi0",
                ostype="l26",
                agent="enabled=1",
            )

        return await asyncio.to_thread(_create_vm)

    async def get_all_vm_statuses(self) -> Dict[int, str]:
        """Get status of all VMs on this node in a single API call.
        Returns dict mapping vmid -> proxmox status (running/stopped/paused/etc)."""
        def _get_all():
            try:
                vms = self.proxmox.nodes(self.node).qemu.get()
                return {int(vm["vmid"]): vm.get("status", "unknown") for vm in vms}
            except Exception:
                return {}

        return await asyncio.to_thread(_get_all)

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

    async def clone_template(
        self, template_vmid: int, new_vmid: int, name: str, storage: str
    ) -> str:
        """Clone a template VM to a new VM on the specified storage. Returns task UPID."""
        def _clone():
            return self.proxmox.nodes(self.node).qemu(template_vmid).clone.post(
                newid=new_vmid,
                name=name,
                full=1,
                storage=storage,
            )
        return await asyncio.to_thread(_clone)

    async def wait_for_task(self, upid: str, timeout: int = 300, poll_interval: int = 3):
        """Wait for a Proxmox task to complete. Raises on failure."""
        import time
        start = time.time()
        while time.time() - start < timeout:
            status = await self._get_task_status(upid)
            if status.get("status") == "stopped":
                if status.get("exitstatus") == "OK":
                    return
                raise Exception(f"Task failed: {status.get('exitstatus', 'unknown error')}")
            await asyncio.sleep(poll_interval)
        raise Exception(f"Task timed out after {timeout}s")

    async def _get_task_status(self, upid: str) -> Dict:
        """Get status of a Proxmox task."""
        def _get():
            return self.proxmox.nodes(self.node).tasks(upid).status.get()
        return await asyncio.to_thread(_get)

    async def resize_disk(self, vmid: int, disk: str, size_gb: int):
        """Resize a VM disk to the specified size in GB."""
        def _resize():
            return self.proxmox.nodes(self.node).qemu(vmid).resize.put(
                disk=disk,
                size=f"{size_gb}G",
            )
        return await asyncio.to_thread(_resize)

    async def set_vm_config(self, vmid: int, **kwargs) -> Dict:
        """Set VM configuration parameters."""
        def _set():
            return self.proxmox.nodes(self.node).qemu(vmid).config.put(**kwargs)
        return await asyncio.to_thread(_set)

    async def configure_cloud_init_user(
        self, vmid: int, username: str, password: str, userdata_file: str = None
    ):
        """Configure cloud-init user credentials, network, and optionally custom user-data."""
        if userdata_file:
            # Use custom user-data file (includes packages like qemu-guest-agent)
            # Delete ciuser/cipassword to avoid conflict with cicustom (template may have ciuser preset)
            return await self.set_vm_config(
                vmid,
                cicustom=f"user=local:snippets/{userdata_file}",
                ipconfig0="ip=dhcp",
                delete="ciuser,cipassword",
            )
        else:
            # Fallback to basic ciuser/cipassword (no custom packages)
            return await self.set_vm_config(
                vmid,
                ciuser=username,
                cipassword=password,
                ipconfig0="ip=dhcp",
            )

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
        """Get VM resource usage (CPU, memory in GB, disk in GB)."""
        def _get_resources():
            try:
                status = self.proxmox.nodes(self.node).qemu(vmid).status.current.get()

                cpu_percent = round(status.get('cpu', 0) * 100, 2)

                mem_used = status.get('mem', 0)
                mem_max = status.get('maxmem', 1)
                memory_used_gb = round(mem_used / (1024 * 1024 * 1024), 2)
                memory_total_gb = round(mem_max / (1024 * 1024 * 1024), 2)

                disk_used = status.get('disk', 0)
                disk_max = status.get('maxdisk', 1)
                disk_used_gb = round(disk_used / (1024 * 1024 * 1024), 2)
                disk_total_gb = round(disk_max / (1024 * 1024 * 1024), 2)

                return {
                    'cpu_percent': cpu_percent,
                    'memory_used_gb': memory_used_gb,
                    'memory_total_gb': memory_total_gb,
                    'disk_used_gb': disk_used_gb,
                    'disk_total_gb': disk_total_gb,
                }
            except Exception as e:
                return {
                    'cpu_percent': 0,
                    'memory_used_gb': 0,
                    'memory_total_gb': 0,
                    'disk_used_gb': 0,
                    'disk_total_gb': 0,
                }

        return await asyncio.to_thread(_get_resources)

    async def is_guest_agent_running(self, vmid: int) -> bool:
        """Check if QEMU Guest Agent is running in the VM."""
        def _ping_agent():
            try:
                self.proxmox.nodes(self.node).qemu(vmid).agent.ping.post()
                return True
            except Exception:
                return False

        return await asyncio.to_thread(_ping_agent)

    async def set_vm_password(self, vmid: int, username: str, password: str) -> Dict:
        """Set VM user password via QEMU Guest Agent."""
        def _set_password():
            return self.proxmox.nodes(self.node).qemu(vmid).agent("set-user-password").post(
                username=username,
                password=password,
            )

        return await asyncio.to_thread(_set_password)

    async def get_vm_templates(self) -> list:
        """Get list of VM templates from Proxmox node."""
        def _get_templates():
            try:
                vms = self.proxmox.nodes(self.node).qemu.get()
                templates = [
                    {
                        "vmid": vm.get("vmid"),
                        "name": vm.get("name"),
                        "status": vm.get("status"),
                        "cores": vm.get("maxcpu", 0),
                        "memory_gb": round(vm.get("maxmem", 0) / (1024 * 1024 * 1024), 2),
                        "disk_gb": round(vm.get("maxdisk", 0) / (1024 ** 3), 2),
                        "type": "template",
                    }
                    for vm in vms
                    if vm.get("template") == 1
                ]
                return templates
            except Exception:
                return []

        return await asyncio.to_thread(_get_templates)

    async def get_iso_images(self, storage: str = "local") -> list:
        """Get list of ISO images from Proxmox storage."""
        def _get_isos():
            try:
                content = self.proxmox.nodes(self.node).storage(storage).content.get()
                isos = [
                    {
                        "volid": item.get("volid"),
                        "name": item.get("volid", "").split("/")[-1],
                        "size_gb": round(item.get("size", 0) / (1024 ** 3), 2),
                        "type": "iso",
                    }
                    for item in content
                    if item.get("content") == "iso"
                ]
                return isos
            except Exception:
                return []

        return await asyncio.to_thread(_get_isos)

    async def get_network_bridges(self) -> list[dict]:
        """Fetch network bridges from Proxmox node.
        Returns list of bridge interfaces with VLAN-aware status.
        """
        def _get():
            try:
                interfaces = self.proxmox.nodes(self.node).network.get()
                bridges = [
                    {
                        "iface": iface.get("iface"),
                        "type": iface.get("type"),
                        "address": iface.get("address"),
                        "netmask": iface.get("netmask"),
                        "gateway": iface.get("gateway"),
                        "bridge_ports": iface.get("bridge_ports"),
                        "bridge_vlan_aware": iface.get("bridge_vlan_aware", False),
                        "autostart": iface.get("autostart", 0),
                        "active": iface.get("active", 0),
                    }
                    for iface in interfaces
                    if iface.get("type") == "bridge"
                ]
                return bridges
            except Exception as e:
                print(f"Error fetching bridges: {e}")
                return []
        return await asyncio.to_thread(_get)

    async def exec_command_in_guest(self, vmid: int, command: list[str]) -> Dict:
        """Execute command via QEMU guest agent. Returns {"pid": int}."""
        import shlex
        def _exec():
            # Handle command array properly
            if isinstance(command, list):
                # Check if it's a shell command (e.g., ["/bin/sh", "-c", "complex command"])
                if len(command) >= 3 and command[1] in ["-c", "--command"]:
                    # Shell with -c: properly quote the command string
                    shell = command[0]
                    shell_cmd = command[2]
                    # Escape single quotes in the command and wrap in single quotes
                    escaped_cmd = shell_cmd.replace("'", "'\\''")
                    cmd_str = f"{shell} -c '{escaped_cmd}'"
                else:
                    # Regular command: quote each argument properly
                    cmd_str = " ".join(shlex.quote(arg) for arg in command)
            else:
                cmd_str = command
            result = self.proxmox.nodes(self.node).qemu(vmid).agent("exec").post(
                command=cmd_str
            )
            return result
        return await asyncio.to_thread(_exec)

    async def get_exec_status(self, vmid: int, pid: int) -> Dict:
        """Get exec status. Returns {"exited": bool, "exitcode": int, "out-data": str}."""
        import base64
        def _get_status():
            result = self.proxmox.nodes(self.node).qemu(vmid).agent("exec-status").get(pid=pid)
            # Proxmox may return data as base64 or plain text depending on version
            # Only decode if it looks like base64 (no newlines in raw data, valid base64 chars)
            for key in ["out-data", "err-data"]:
                if result.get(key) and isinstance(result[key], str):
                    data = result[key]
                    # Check if it looks like base64 (no spaces, only base64 chars)
                    if data and not any(c in data for c in ['\n', ' ', '\t']) and len(data) > 20:
                        try:
                            decoded = base64.b64decode(data).decode("utf-8", errors="replace")
                            result[key] = decoded
                        except Exception:
                            pass  # Keep original if decode fails
            return result
        return await asyncio.to_thread(_get_status)

    async def exec_command_wait(self, vmid: int, command: list[str], timeout: int = 300) -> Dict:
        """Execute command and wait for completion. Returns decoded stdout/stderr."""
        import time
        # Start command execution
        exec_result = await self.exec_command_in_guest(vmid, command)
        pid = exec_result.get("pid")
        if not pid:
            raise Exception("Failed to start command execution")

        # Poll for completion
        start = time.time()
        while time.time() - start < timeout:
            status = await self.get_exec_status(vmid, pid)
            if status.get("exited"):
                return {
                    "exitcode": status.get("exitcode", -1),
                    "stdout": status.get("out-data", ""),
                    "stderr": status.get("err-data", ""),
                }
            await asyncio.sleep(2)

        raise Exception(f"Command execution timed out after {timeout}s")


async def upload_cloud_init_to_proxmox(
    host: str,
    password: str,
    vmid: int,
    content: str,
    ssh_user: str = "root",
    snippets_path: str = "/var/lib/vz/snippets",
) -> str:
    """Upload cloud-init user-data to Proxmox server via SSH.
    Returns the snippet reference for cicustom (e.g., local:snippets/123-cloud-init.yml)
    """
    import paramiko

    def _upload():
        filename = f"{vmid}-cloud-init.yml"
        remote_path = f"{snippets_path}/{filename}"

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            ssh.connect(host, username=ssh_user, password=password, timeout=30)
            # Ensure snippets directory exists
            ssh.exec_command(f"mkdir -p {snippets_path}")
            # Write file via SFTP
            sftp = ssh.open_sftp()
            with sftp.file(remote_path, "w") as f:
                f.write(content)
            sftp.close()
            return f"local:snippets/{filename}"
        finally:
            ssh.close()

    return await asyncio.to_thread(_upload)


async def create_proxmox_service(session: AsyncSession) -> ProxmoxService:
    """Factory: create ProxmoxService with DB config (fallback to env)."""
    from app.services.system_settings_service import get_proxmox_config
    config = await get_proxmox_config(session)
    return ProxmoxService(
        host=config["host"],
        token_name=config["token_name"],
        token_value=config["token_value"],
        node=config["node"],
    )


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
