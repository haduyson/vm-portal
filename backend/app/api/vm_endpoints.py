from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.models.proxmox_server_model import ProxmoxServer
from app.schemas.vm_schemas import (
    VMCreate, VMResponse, VMListResponse, VMResourceResponse,
    VMCloneRequest, VMMetricsDataPoint, VMMetricsResponse, VMConsoleResponse,
    VMResize, VMResetPassword,
)
from app.services.system_settings_service import get_setting
from app.services.vm_provisioning_service import VMProvisioningService
from app.services.proxmox_client import (
    ProxmoxService, create_proxmox_service_for_vm,
    create_proxmox_service_for_server,
)
from app.config import settings
from app.models.os_template_model import OsTemplate
import asyncio
import importlib
import re

_ps_schemas = importlib.import_module("app.schemas.proxmox-server-schemas")
_os_schemas = importlib.import_module("app.schemas.os-template-schemas")
_cf_tunnel_mod = importlib.import_module("app.services.cloudflare-tunnel-service")
CloudflareTunnelService = _cf_tunnel_mod.CloudflareTunnelService
_cf_domain_schemas = importlib.import_module("app.schemas.cloudflare-domain-schemas")
CloudflareDomainPublicResponse = _cf_domain_schemas.CloudflareDomainPublicResponse

_network_bridge_service = importlib.import_module("app.services.network-bridge-service")
NetworkBridgeService = _network_bridge_service.NetworkBridgeService

_network_config_generator = importlib.import_module("app.services.network-config-generator")
generate_net0_config = _network_config_generator.generate_net0_config

_network_bridge_schemas = importlib.import_module("app.schemas.network-bridge-schemas")

router = APIRouter(prefix="/vms", tags=["virtual-machines"])
proxmox_servers_public_router = APIRouter(tags=["proxmox-servers-public"])
os_templates_public_router = APIRouter(tags=["os-templates-public"])


@router.post("", response_model=VMResponse, status_code=status.HTTP_201_CREATED)
async def create_vm(
    vm_data: VMCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new virtual machine."""
    try:
        # Check user quotas
        result = await session.execute(
            select(VirtualMachine).where(VirtualMachine.user_id == current_user.id)
        )
        user_vms = result.scalars().all()

        current_vm_count = len(user_vms)
        current_disk_gb = sum(vm.disk_gb for vm in user_vms)
        current_ram_mb = sum(vm.memory_mb for vm in user_vms)
        current_cpu_cores = sum(vm.cores for vm in user_vms)

        if current_user.max_vms is not None:
            if current_vm_count >= current_user.max_vms:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Đã vượt giới hạn số VM tối đa ({current_vm_count}/{current_user.max_vms})",
                )

        if current_user.max_disk_gb is not None:
            if current_disk_gb + vm_data.disk_gb > current_user.max_disk_gb:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Đã vượt giới hạn dung lượng ổ cứng ({current_disk_gb + vm_data.disk_gb}/{current_user.max_disk_gb} GB)",
                )

        if current_user.max_ram_gb is not None:
            max_ram_mb = current_user.max_ram_gb * 1024  # Convert GB to MB for comparison
            if current_ram_mb + vm_data.memory_mb > max_ram_mb:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Đã vượt giới hạn RAM ({(current_ram_mb + vm_data.memory_mb) // 1024}/{current_user.max_ram_gb} GB)",
                )

        if current_user.max_cpu_cores is not None:
            if current_cpu_cores + vm_data.cores > current_user.max_cpu_cores:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Đã vượt giới hạn số CPU cores ({current_cpu_cores + vm_data.cores}/{current_user.max_cpu_cores})",
                )

        # Check feature flags for cloudflare_tunnel and public_ip
        global_flags = await FeatureFlagService.get_global_flags(session)
        user_flags = current_user.feature_flags or {}

        # Validate SSH and HTTP subdomains if auto-assign is enabled
        vm_base_subdomain = None
        cf_domain = None
        ssh_full_domain = None
        web_full_domain = None

        # Check if auto-assign is enabled
        auto_assign_enabled = await get_setting(session, "auto_assign_ip_subdomain")
        should_auto_assign = (auto_assign_enabled or "false").lower() == "true" and not vm_data.ssh_subdomain

        # Check cloudflare_tunnel_enabled feature flag
        can_use_tunnel = FeatureFlagService.resolve_flag(
            "cloudflare_tunnel_enabled", global_flags, user_flags, None
        )

        if (vm_data.ssh_subdomain or should_auto_assign) and not can_use_tunnel:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tính năng Cloudflare Tunnel đã bị tắt cho tài khoản của bạn",
            )

        if vm_data.ssh_subdomain or should_auto_assign:
            if should_auto_assign:
                # Auto-generate subdomain from VM name
                vm_base_subdomain = vm_data.name.strip().lower()
            else:
                vm_base_subdomain = vm_data.ssh_subdomain.strip().lower()
            valid, error_msg = CloudflareTunnelService.validate_subdomain(vm_base_subdomain)
            if not valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=error_msg,
                )

            # Resolve Cloudflare domain
            _cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
            CloudflareDomain = _cf_domain_model.CloudflareDomain

            if vm_data.domain_id:
                # Use specified domain
                domain_result = await session.execute(
                    select(CloudflareDomain).where(
                        CloudflareDomain.id == vm_data.domain_id,
                        CloudflareDomain.is_active == True,
                    )
                )
                cf_domain = domain_result.scalar_one_or_none()
                if not cf_domain:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Domain không tồn tại hoặc không khả dụng",
                    )
            else:
                # Use first active domain as default
                domain_result = await session.execute(
                    select(CloudflareDomain)
                    .where(CloudflareDomain.is_active == True)
                    .order_by(CloudflareDomain.domain)
                    .limit(1)
                )
                cf_domain = domain_result.scalar_one_or_none()
                if not cf_domain:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Không có domain nào khả dụng. Vui lòng liên hệ quản trị viên.",
                    )

            # SSH subdomain: {vm-name}.ssh.{domain} (e.g., myvm.ssh.hasonmedia.com)
            # HTTP subdomain: {vm-name}.{domain} (e.g., myvm.hasonmedia.com)
            ssh_full_domain = f"{vm_base_subdomain}.ssh.{cf_domain.domain}"
            web_full_domain = f"{vm_base_subdomain}.{cf_domain.domain}"

            # Check DB uniqueness for both domains
            existing_ssh = await session.execute(
                select(VirtualMachine).where(VirtualMachine.ssh_domain == ssh_full_domain)
            )
            if existing_ssh.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"SSH subdomain '{ssh_full_domain}' đã được sử dụng",
                )

            existing_web = await session.execute(
                select(VirtualMachine).where(VirtualMachine.web_domain == web_full_domain)
            )
            if existing_web.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Web subdomain '{web_full_domain}' đã được sử dụng",
                )

            # Check Cloudflare DNS availability for both subdomains
            try:
                cf_service = CloudflareTunnelService(
                    api_token=cf_domain.cf_api_token,
                    zone_id=cf_domain.cf_zone_id,
                    tunnel_id=cf_domain.cf_tunnel_id,
                    tunnel_name=cf_domain.cf_tunnel_name,
                    base_domain=cf_domain.domain,
                    config_path=cf_domain.cloudflared_config_path,
                )
                # Check SSH subdomain
                ssh_available = await cf_service.is_subdomain_available(f"{vm_base_subdomain}.ssh")
                if not ssh_available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"SSH subdomain '{ssh_full_domain}' đã tồn tại trên Cloudflare",
                    )
                # Check HTTP subdomain
                web_available = await cf_service.is_subdomain_available(vm_base_subdomain)
                if not web_available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Web subdomain '{web_full_domain}' đã tồn tại trên Cloudflare",
                    )
            except HTTPException:
                raise
            except Exception as e:
                print(f"Warning: Could not check CF subdomain availability: {e}")

        # Resolve Proxmox server
        server = None
        if vm_data.server_id:
            srv_result = await session.execute(
                select(ProxmoxServer).where(
                    ProxmoxServer.id == vm_data.server_id,
                    ProxmoxServer.is_active == True,
                )
            )
            server = srv_result.scalar_one_or_none()
            if not server:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Server Proxmox không tồn tại hoặc không khả dụng",
                )
        else:
            # Use first active server as default
            srv_result = await session.execute(
                select(ProxmoxServer)
                .where(ProxmoxServer.is_active == True)
                .order_by(ProxmoxServer.id)
                .limit(1)
            )
            server = srv_result.scalar_one_or_none()

        # Build ProxmoxService and provisioning service
        if server:
            proxmox_svc = ProxmoxService.from_server(server)
            node_name = server.node
            server_id = server.id

            # Parse excluded storages for this server
            excluded = set()
            if server.excluded_storages:
                excluded = {s.strip() for s in server.excluded_storages.split(",") if s.strip()}

            # Determine storage
            if vm_data.storage:
                # Block non-admin users from using excluded storages
                if not current_user.is_admin and vm_data.storage in excluded:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Storage '{vm_data.storage}' không được phép sử dụng để tạo VM",
                    )
                storage_name = vm_data.storage
            else:
                # Auto-detect: get first allowed storage with "images" content
                storages = await proxmox_svc.get_storages(content_filter="images")
                allowed = [s for s in storages if s['storage'] not in excluded] if not current_user.is_admin else storages
                storage_name = allowed[0]['storage'] if allowed else "local-lvm"

            # Auto-detect ISO storage
            iso_storages = await proxmox_svc.get_storages(content_filter="iso")
            iso_storage_name = iso_storages[0]['storage'] if iso_storages else "local"

            provisioning_service = VMProvisioningService(proxmox=proxmox_svc, iso_storage=iso_storage_name)
        else:
            provisioning_service = await VMProvisioningService.create(session)
            node_name = settings.PROXMOX_NODE
            storage_name = vm_data.storage or settings.PROXMOX_VM_STORAGE
            server_id = None

        # Check cloud-init template availability
        is_cloudinit = vm_data.os_type.endswith("-cloudinit")
        template_vmid = None
        if is_cloudinit:
            if server and server.cloud_init_template_vmid:
                template_vmid = server.cloud_init_template_vmid
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Server này chưa cấu hình template Cloud-Init",
                )

        vmid = await provisioning_service.proxmox.get_next_vmid()

        # Resolve network bridge
        bridge = None
        net0_config = "virtio,bridge=vmbr0"  # Default
        if vm_data.network_bridge_id:
            bridge = await NetworkBridgeService.get_bridge_by_id(session, vm_data.network_bridge_id)
            if not bridge or not bridge.is_enabled:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Network bridge không hợp lệ hoặc đã bị vô hiệu",
                )
            # Validate bridge belongs to selected server
            if bridge.proxmox_server_id != server_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Network bridge không thuộc server đã chọn",
                )
            # Validate VLAN tags within bridge restrictions
            if vm_data.vlan_tags and bridge.vlan_min is not None and bridge.vlan_max is not None:
                for tag in vm_data.vlan_tags:
                    if not bridge.vlan_min <= tag <= bridge.vlan_max:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"VLAN {tag} ngoài phạm vi cho phép ({bridge.vlan_min}-{bridge.vlan_max})",
                        )
            net0_config = generate_net0_config(bridge.bridge_name, vm_data.vlan_tags)
        elif server_id:
            # Try to get default bridge for server
            bridge = await NetworkBridgeService.get_default_bridge_for_server(session, server_id)
            if bridge:
                net0_config = generate_net0_config(bridge.bridge_name, vm_data.vlan_tags)

        # Handle static IP from user's pool
        static_ip_config = None
        selected_ip_record = None

        # Check public_ip_enabled feature flag for public network bridges
        if bridge and bridge.is_public_network:
            can_use_public_ip = FeatureFlagService.resolve_flag(
                "public_ip_enabled", global_flags, user_flags, None
            )
            if not can_use_public_ip:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tính năng IP Public đã bị tắt cho tài khoản của bạn",
                )

        if vm_data.ip_pool_id:
            _ip_service = importlib.import_module("app.services.user-ip-address-service")
            UserIpAddressService = _ip_service.UserIpAddressService

            selected_ip_record = await UserIpAddressService.get_ip_by_id(
                session, vm_data.ip_pool_id, current_user.id
            )
            if not selected_ip_record:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="IP không tồn tại hoặc không thuộc về bạn",
                )
            if selected_ip_record.vm_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="IP đã được sử dụng bởi VM khác",
                )
            # Validate IP belongs to selected bridge
            if bridge and selected_ip_record.network_bridge_id != bridge.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="IP không thuộc bridge đã chọn",
                )
            # Generate static IP config for cloud-init
            _ipconfig_gen = importlib.import_module("app.services.network-config-generator")
            static_ip_config = _ipconfig_gen.generate_ipconfig0(
                ip_address=selected_ip_record.ip_address,
                subnet_mask=selected_ip_record.subnet_mask,
                gateway=selected_ip_record.gateway,
            )

        # Create VM record in database
        new_vm = VirtualMachine(
            user_id=current_user.id,
            proxmox_server_id=server_id,
            network_bridge_id=bridge.id if bridge else None,
            vmid=vmid,
            name=vm_data.name,
            cores=vm_data.cores,
            memory_mb=vm_data.memory_mb,
            disk_gb=vm_data.disk_gb,
            os_type=vm_data.os_type,
            status="creating",
            proxmox_node=node_name,
            storage=storage_name,
            vlan_tags=vm_data.vlan_tags,
            ssh_domain=ssh_full_domain if vm_base_subdomain else None,
            web_domain=web_full_domain if vm_base_subdomain else None,
        )

        session.add(new_vm)
        await session.commit()
        await session.refresh(new_vm)

        # Assign static IP to new VM if selected
        if selected_ip_record:
            _ip_service = importlib.import_module("app.services.user-ip-address-service")
            UserIpAddressService = _ip_service.UserIpAddressService
            await UserIpAddressService.assign_ip_to_vm(session, selected_ip_record.id, new_vm.id)
            await session.commit()

        # Start provisioning in background
        ipconfig0 = static_ip_config or "ip=dhcp"
        if is_cloudinit and template_vmid:
            asyncio.create_task(
                provisioning_service.provision_vm_cloudinit(
                    new_vm.id,
                    template_vmid=template_vmid,
                    user_id=current_user.id,
                    net0=net0_config,
                    ipconfig0=ipconfig0,
                )
            )
        else:
            asyncio.create_task(
                provisioning_service.provision_vm(
                    new_vm.id,
                    user_id=current_user.id,
                )
            )

        return new_vm

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi tạo VM: {str(e)}",
        )


@router.get("", response_model=VMListResponse)
async def list_vms(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get list of VMs for the current user."""
    result = await session.execute(
        select(VirtualMachine)
        .where(VirtualMachine.user_id == current_user.id)
        .order_by(VirtualMachine.created_at.desc())
    )
    vms = result.scalars().all()

    return VMListResponse(
        total=len(vms),
        vms=list(vms),
    )


@router.get("/{vm_id}", response_model=VMResponse)
async def get_vm(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get details of a specific VM."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    return vm


@router.post("/{vm_id}/start", response_model=VMResponse)
async def start_vm(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Start a VM (owner or admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền điều khiển VM này",
        )

    if vm.status == "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM đang chạy",
        )

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        await proxmox.start_vm(vm.vmid)
        vm.status = "running"
        await session.commit()
        await session.refresh(vm)
        return vm
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi khởi động VM: {str(e)}",
        )


@router.post("/{vm_id}/stop", response_model=VMResponse)
async def stop_vm(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Stop a VM (owner or admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền điều khiển VM này",
        )

    if vm.status == "stopped":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM đã dừng",
        )

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        await proxmox.stop_vm(vm.vmid)
        vm.status = "stopped"
        await session.commit()
        await session.refresh(vm)
        return vm
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi dừng VM: {str(e)}",
        )


@router.post("/{vm_id}/restart", response_model=VMResponse)
async def restart_vm(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Restart a VM (stop then start, owner or admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền điều khiển VM này",
        )

    if vm.status != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM phải đang chạy để khởi động lại",
        )

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        await proxmox.stop_vm(vm.vmid)
        await asyncio.sleep(2)
        await proxmox.start_vm(vm.vmid)
        vm.status = "running"
        await session.commit()
        await session.refresh(vm)
        return vm
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi khởi động lại VM: {str(e)}",
        )


@router.get("/{vm_id}/resources", response_model=VMResourceResponse)
async def get_vm_resources(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get VM resource usage (owner or admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    if vm.status != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM phải đang chạy để xem tài nguyên",
        )

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        resources = await proxmox.get_vm_resources(vm.vmid)
        return VMResourceResponse(**resources)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy thông tin tài nguyên: {str(e)}",
        )


@router.delete("/{vm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vm(
    vm_id: int,
    retain_ip: bool = Query(False, description="Giữ lại IP trong pool của bạn"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a VM (owner only). Optionally retain public IP in user's pool."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    if vm.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xóa VM này",
        )

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        # Get actual status from Proxmox (not from DB which may be stale)
        try:
            vm_status = await proxmox.get_vm_status(vm.vmid)
            if vm_status.get("status") == "running":
                upid = await proxmox.stop_vm(vm.vmid)
                await proxmox.wait_for_task(upid, timeout=120)
        except Exception:
            pass  # VM may not exist in Proxmox, continue with DB cleanup

        try:
            await proxmox.delete_vm(vm.vmid)
        except Exception as del_err:
            if "does not exist" not in str(del_err).lower():
                raise  # Re-raise if not "VM doesn't exist" error

        # Cleanup cloud-init snippet file
        try:
            from app.services.cloud_init_generator import CloudInitGenerator
            CloudInitGenerator.delete_from_snippets(vm.vmid)
        except Exception:
            pass  # Non-critical cleanup

        # Cleanup Cloudflare tunnel for SSH and HTTP subdomains
        if vm.ssh_domain or vm.web_domain:
            try:
                # Find matching CloudflareDomain
                _cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
                CloudflareDomain = _cf_domain_model.CloudflareDomain

                domains_result = await session.execute(
                    select(CloudflareDomain).where(CloudflareDomain.is_active == True)
                )
                domains = domains_result.scalars().all()

                for d in domains:
                    cf_service = CloudflareTunnelService(
                        api_token=d.cf_api_token,
                        zone_id=d.cf_zone_id,
                        tunnel_id=d.cf_tunnel_id,
                        tunnel_name=d.cf_tunnel_name,
                        base_domain=d.domain,
                        config_path=d.cloudflared_config_path,
                    )

                    # Cleanup SSH subdomain
                    if vm.ssh_domain and vm.ssh_domain.endswith(f".{d.domain}"):
                        ssh_subdomain = vm.ssh_domain.replace(f".{d.domain}", "")
                        await cf_service.remove_ssh_ingress(ssh_subdomain)
                        print(f"Cleaned up SSH tunnel for {vm.ssh_domain}")

                    # Cleanup HTTP subdomain
                    if vm.web_domain and vm.web_domain.endswith(f".{d.domain}"):
                        web_subdomain = vm.web_domain.replace(f".{d.domain}", "")
                        await cf_service.remove_ssh_ingress(web_subdomain)  # Same cleanup method
                        print(f"Cleaned up HTTP tunnel for {vm.web_domain}")

            except Exception as cf_err:
                print(f"Warning: Failed to cleanup CF tunnel: {cf_err}")

        # Release IP with retain option
        try:
            _ip_service = importlib.import_module("app.services.user-ip-address-service")
            UserIpAddressService = _ip_service.UserIpAddressService
            await UserIpAddressService.release_ip(session, vm.id, retain=retain_ip)
            if retain_ip:
                print(f"IP retained in user pool for VM {vm.id}")
        except Exception as ip_err:
            print(f"Warning: Failed to release IP: {ip_err}")

        await session.delete(vm)
        await session.commit()
    except Exception as e:
        import traceback
        print(f"Delete VM error: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi xóa VM: {str(e)}",
        )


@router.put("/{vm_id}/resize", response_model=VMResponse)
async def resize_vm(
    vm_id: int,
    resize_data: VMResize,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Resize VM resources (cores, RAM, disk). VM must be stopped."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền thay đổi VM này")

    if vm.status != "stopped":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM phải ở trạng thái đã dừng để thay đổi cấu hình",
        )

    if not resize_data.cores and not resize_data.memory_mb and not resize_data.disk_gb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phải chỉ định ít nhất một thông số để thay đổi",
        )

    # Validate disk can only increase
    if resize_data.disk_gb is not None and resize_data.disk_gb < vm.disk_gb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể giảm dung lượng ổ cứng (hiện tại: {vm.disk_gb} GB)",
        )

    # Validate against user quotas
    user_vms_result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.user_id == current_user.id)
    )
    user_vms = user_vms_result.scalars().all()

    current_disk_gb = sum(v.disk_gb for v in user_vms)
    current_ram_mb = sum(v.memory_mb for v in user_vms)
    current_cpu_cores = sum(v.cores for v in user_vms)

    new_cores = resize_data.cores or vm.cores
    new_memory_mb = resize_data.memory_mb or vm.memory_mb
    new_disk_gb = resize_data.disk_gb or vm.disk_gb

    # Delta = new - old for this VM
    delta_cores = new_cores - vm.cores
    delta_ram = new_memory_mb - vm.memory_mb
    delta_disk = new_disk_gb - vm.disk_gb

    if current_user.max_cpu_cores is not None and current_cpu_cores + delta_cores > current_user.max_cpu_cores:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vượt giới hạn CPU cores ({current_cpu_cores + delta_cores}/{current_user.max_cpu_cores})",
        )
    if current_user.max_ram_gb is not None:
        max_ram_mb = current_user.max_ram_gb * 1024  # Convert GB to MB for comparison
        if current_ram_mb + delta_ram > max_ram_mb:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Vượt giới hạn RAM ({(current_ram_mb + delta_ram) // 1024}/{current_user.max_ram_gb} GB)",
            )
    if current_user.max_disk_gb is not None and current_disk_gb + delta_disk > current_user.max_disk_gb:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vượt giới hạn dung lượng ổ cứng ({current_disk_gb + delta_disk}/{current_user.max_disk_gb} GB)",
        )

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)

        # Apply CPU/RAM changes
        if resize_data.cores or resize_data.memory_mb:
            config_kwargs = {}
            if resize_data.cores:
                config_kwargs["cores"] = new_cores
            if resize_data.memory_mb:
                config_kwargs["memory"] = new_memory_mb
            await proxmox.set_vm_config(vm.vmid, **config_kwargs)

        # Resize disk if requested
        if resize_data.disk_gb and resize_data.disk_gb > vm.disk_gb:
            await proxmox.resize_disk(vm.vmid, "scsi0", new_disk_gb)

        # Update DB record
        vm.cores = new_cores
        vm.memory_mb = new_memory_mb
        vm.disk_gb = new_disk_gb
        await session.commit()
        await session.refresh(vm)
        return vm

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi thay đổi cấu hình VM: {str(e)}",
        )


@router.post("/{vm_id}/clone", response_model=VMResponse, status_code=status.HTTP_201_CREATED)
async def clone_vm(
    vm_id: int,
    clone_data: VMCloneRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Clone a VM (owner or admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền nhân bản VM này")

    # Check user quotas
    user_vms_result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.user_id == current_user.id)
    )
    user_vms = user_vms_result.scalars().all()
    current_vm_count = len(user_vms)
    current_disk_gb = sum(v.disk_gb for v in user_vms)
    current_ram_mb = sum(v.memory_mb for v in user_vms)
    current_cpu_cores = sum(v.cores for v in user_vms)

    if current_user.max_vms is not None and current_vm_count >= current_user.max_vms:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Đã vượt giới hạn số VM ({current_vm_count}/{current_user.max_vms})")
    if current_user.max_disk_gb is not None and current_disk_gb + vm.disk_gb > current_user.max_disk_gb:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đã vượt giới hạn dung lượng ổ cứng")
    if current_user.max_ram_gb is not None:
        max_ram_mb = current_user.max_ram_gb * 1024  # Convert GB to MB for comparison
        if current_ram_mb + vm.memory_mb > max_ram_mb:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đã vượt giới hạn RAM")
    if current_user.max_cpu_cores is not None and current_cpu_cores + vm.cores > current_user.max_cpu_cores:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đã vượt giới hạn CPU cores")

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        new_vmid = await proxmox.get_next_vmid()
        await proxmox.clone_vm(vm.vmid, new_vmid, clone_data.name)

        new_vm = VirtualMachine(
            user_id=current_user.id,
            proxmox_server_id=vm.proxmox_server_id,
            vmid=new_vmid,
            name=clone_data.name,
            cores=vm.cores,
            memory_mb=vm.memory_mb,
            disk_gb=vm.disk_gb,
            os_type=vm.os_type,
            status="creating",
            proxmox_node=vm.proxmox_node,
            storage=vm.storage,
        )
        session.add(new_vm)
        await session.commit()
        await session.refresh(new_vm)
        return new_vm

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi nhân bản VM: {str(e)}",
        )


@router.get("/{vm_id}/metrics", response_model=VMMetricsResponse)
async def get_vm_metrics(
    vm_id: int,
    timeframe: str = "hour",
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get VM resource usage metrics over time."""
    if timeframe not in ("hour", "day", "week", "month", "year"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timeframe không hợp lệ")

    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập VM này")

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        rrd_data = await proxmox.get_vm_rrddata(vm.vmid, timeframe)

        data_points = []
        for point in rrd_data:
            data_points.append(VMMetricsDataPoint(
                time=point.get("time", 0),
                cpu=point.get("cpu"),
                mem=point.get("mem"),
                maxmem=point.get("maxmem"),
                netin=point.get("netin"),
                netout=point.get("netout"),
                disk=point.get("disk"),
                maxdisk=point.get("maxdisk"),
            ))

        return VMMetricsResponse(timeframe=timeframe, data=data_points)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy metrics: {str(e)}",
        )


@router.get("/{vm_id}/console", response_model=VMConsoleResponse)
async def get_vm_console(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get VNC console proxy info for noVNC connection."""
    feature_enabled = await get_setting(session, "feature_novnc_console")
    if (feature_enabled or "false").lower() != "true":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chức năng console chưa được bật")

    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập VM này")
    if vm.status != "running":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VM phải đang chạy để mở console")

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        proxy_data = await proxmox.create_vnc_proxy(vm.vmid)

        return VMConsoleResponse(
            ticket=proxy_data.get("ticket", ""),
            port=proxy_data.get("port", 0),
            node=vm.proxmox_node,
            vmid=vm.vmid,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi tạo console: {str(e)}",
        )


@router.post("/{vm_id}/reset-password", response_model=VMResponse)
async def reset_vm_password(
    vm_id: int,
    password_data: VMResetPassword,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Reset root password of a VM (owner or admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thay đổi mật khẩu VM này",
        )

    if vm.status != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM phải đang chạy để đổi mật khẩu",
        )

    proxmox = await create_proxmox_service_for_vm(vm, session)

    # Check if guest agent is running
    agent_running = await proxmox.is_guest_agent_running(vm.vmid)
    if not agent_running:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QEMU Guest Agent chưa sẵn sàng. Vui lòng đợi 2-3 phút sau khi VM khởi động để cloud-init cài đặt xong. Hoặc SSH vào VM và chạy: apt install qemu-guest-agent && systemctl start qemu-guest-agent",
        )

    try:
        await proxmox.set_vm_password(vm.vmid, "root", password_data.new_password)

        # Update password in database
        vm.ssh_password = password_data.new_password
        await session.commit()
        await session.refresh(vm)

        return vm
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi đổi mật khẩu: {str(e)}",
        )


# --- User-facing endpoint: available Proxmox servers ---

@proxmox_servers_public_router.get("/proxmox-servers/available", response_model=List[_ps_schemas.ProxmoxServerResourceResponse])
async def list_available_proxmox_servers(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List active Proxmox servers with live resource usage for VM creation."""
    result = await session.execute(
        select(ProxmoxServer)
        .where(ProxmoxServer.is_active == True)
        .order_by(ProxmoxServer.id)
    )
    servers = result.scalars().all()

    responses = []
    for server in servers:
        try:
            proxmox = ProxmoxService.from_server(server)
            resources = await proxmox.get_node_resources()
        except Exception:
            resources = {
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

        responses.append(_ps_schemas.ProxmoxServerResourceResponse(
            id=server.id,
            name=server.name,
            **resources,
        ))

    return responses


@proxmox_servers_public_router.get("/proxmox-servers/{server_id}/storages", response_model=List[_ps_schemas.ProxmoxStorageItem])
async def get_server_storages_for_vm_creation(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get available storages for VM creation (images content only)."""
    result = await session.execute(
        select(ProxmoxServer).where(
            ProxmoxServer.id == server_id,
            ProxmoxServer.is_active == True,
        )
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server không tồn tại hoặc không khả dụng",
        )

    try:
        proxmox = ProxmoxService.from_server(server)
        storages = await proxmox.get_storages(content_filter="images")

        # Filter out excluded storages for non-admin users
        excluded = set()
        if server.excluded_storages:
            excluded = {s.strip() for s in server.excluded_storages.split(",") if s.strip()}

        # Filter first, then fetch allocated in parallel
        allowed = [s for s in storages if s.get('storage', '') not in excluded]
        alloc_tasks = [proxmox.get_storage_allocated_bytes(s.get('storage', '')) for s in allowed]
        alloc_results = await asyncio.gather(*alloc_tasks, return_exceptions=True)

        result_list = []
        for i, s in enumerate(allowed):
            total = s.get('total', 0)
            used = s.get('used', 0)
            avail = s.get('avail', 0)
            alloc = alloc_results[i] if not isinstance(alloc_results[i], Exception) else 0

            result_list.append(_ps_schemas.ProxmoxStorageItem(
                storage=s.get('storage', ''),
                type=s.get('type', ''),
                content=s.get('content', ''),
                total_gb=round(total / (1024 ** 3), 2) if total else 0,
                used_gb=round(used / (1024 ** 3), 2) if used else 0,
                available_gb=round(avail / (1024 ** 3), 2) if avail else 0,
                allocated_gb=round(alloc / (1024 ** 3), 2) if alloc else 0,
                active=s.get('active', 0) == 1,
            ))

        return result_list
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy storage: {str(e)}",
        )


# --- User-facing endpoint: available OS templates ---

@os_templates_public_router.get(
    "/os-templates/available",
    response_model=List[_os_schemas.OsTemplateResponse],
)
async def list_available_os_templates(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List enabled OS templates ordered by sort_order."""
    result = await session.execute(
        select(OsTemplate)
        .where(OsTemplate.is_enabled == True)
        .order_by(OsTemplate.sort_order, OsTemplate.id)
    )
    return result.scalars().all()


@proxmox_servers_public_router.get("/proxmox-servers/{server_id}/network-options")
async def get_network_options(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get available network bridges for VM creation."""
    result = await session.execute(
        select(ProxmoxServer).where(
            ProxmoxServer.id == server_id,
            ProxmoxServer.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server không tồn tại hoặc không khả dụng",
        )

    bridges = await NetworkBridgeService.get_enabled_bridges_for_server(session, server_id)

    # For each public bridge, get user's available IPs
    _ip_service = importlib.import_module("app.services.user-ip-address-service")
    UserIpAddressService = _ip_service.UserIpAddressService

    bridge_list = []
    for b in bridges:
        bridge_data = {
            "id": b.id,
            "name": b.bridge_name,
            "display_name": b.display_name or b.bridge_name,
            "vlan_min": b.vlan_min,
            "vlan_max": b.vlan_max,
            "is_public_network": b.is_public_network,
            "available_ips": [],
        }
        if b.is_public_network:
            available_ips = await UserIpAddressService.get_user_available_ips(
                session, current_user.id, b.id
            )
            bridge_data["available_ips"] = [
                {
                    "id": ip.id,
                    "ip_address": ip.ip_address,
                    "gateway": ip.gateway,
                    "subnet_mask": ip.subnet_mask,
                }
                for ip in available_ips
            ]
        bridge_list.append(bridge_data)

    return {"bridges": bridge_list}


@proxmox_servers_public_router.get("/cloudflare-domains/available", response_model=List[CloudflareDomainPublicResponse])
async def list_available_cloudflare_domains(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List active Cloudflare domains for VM creation."""
    _cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
    CloudflareDomain = _cf_domain_model.CloudflareDomain

    result = await session.execute(
        select(CloudflareDomain)
        .where(CloudflareDomain.is_active == True)
        .order_by(CloudflareDomain.domain)
    )
    domains = result.scalars().all()

    return [
        CloudflareDomainPublicResponse(
            id=d.id,
            domain=d.domain,
            is_active=d.is_active,
        )
        for d in domains
    ]


# --- SSH Subdomain availability check ---

@router.get("/check-subdomain/{subdomain}")
async def check_subdomain_availability(
    subdomain: str,
    domain_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Check if an SSH subdomain is available on a specific domain."""
    subdomain = subdomain.strip().lower()
    valid, error_msg = CloudflareTunnelService.validate_subdomain(subdomain)
    if not valid:
        return {"available": False, "reason": error_msg}

    # Get Cloudflare domain
    _cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
    CloudflareDomain = _cf_domain_model.CloudflareDomain

    if domain_id:
        domain_result = await session.execute(
            select(CloudflareDomain).where(
                CloudflareDomain.id == domain_id,
                CloudflareDomain.is_active == True,
            )
        )
        cf_domain = domain_result.scalar_one_or_none()
        if not cf_domain:
            return {"available": False, "reason": "Domain không tồn tại"}
    else:
        # Use first active domain
        domain_result = await session.execute(
            select(CloudflareDomain)
            .where(CloudflareDomain.is_active == True)
            .order_by(CloudflareDomain.domain)
            .limit(1)
        )
        cf_domain = domain_result.scalar_one_or_none()
        if not cf_domain:
            return {"available": False, "reason": "Không có domain nào khả dụng"}

    # Check DB
    full_domain = f"{subdomain}.{cf_domain.domain}"
    existing = await session.execute(
        select(VirtualMachine).where(VirtualMachine.ssh_domain == full_domain)
    )
    if existing.scalar_one_or_none():
        return {"available": False, "reason": "Subdomain đã được sử dụng"}

    # Check Cloudflare DNS
    try:
        cf_service = CloudflareTunnelService(
            api_token=cf_domain.cf_api_token,
            zone_id=cf_domain.cf_zone_id,
            tunnel_id=cf_domain.cf_tunnel_id,
            tunnel_name=cf_domain.cf_tunnel_name,
            base_domain=cf_domain.domain,
            config_path=cf_domain.cloudflared_config_path,
        )
        cf_available = await cf_service.is_subdomain_available(subdomain)
        if not cf_available:
            return {"available": False, "reason": "Subdomain đã tồn tại trên DNS"}
    except Exception:
        pass  # If CF check fails, still allow (will validate on create)

    return {"available": True, "domain": full_domain}


# --- VM Feature Flags Endpoints ---

_ff_service = importlib.import_module("app.services.feature-flag-resolution-service")
FeatureFlagService = _ff_service.FeatureFlagService
FEATURE_DEFAULTS = _ff_service.FEATURE_DEFAULTS

_ff_schemas = importlib.import_module("app.schemas.feature-flag-schemas")
FeatureFlagsUpdate = _ff_schemas.FeatureFlagsUpdate
FeatureFlagsResponse = _ff_schemas.FeatureFlagsResponse


@router.get("/{vm_id}/feature-flags", response_model=FeatureFlagsResponse)
async def get_vm_feature_flags(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get resolved feature flags for a VM."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM not found")

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    global_flags = await FeatureFlagService.get_global_flags(session)
    user_flags = current_user.feature_flags or {}
    vm_flags = vm.feature_flags or {}

    resolved = FeatureFlagService.resolve_all_flags(global_flags, user_flags, vm_flags)
    sources = FeatureFlagService.get_all_sources(global_flags, user_flags, vm_flags)

    return FeatureFlagsResponse(flags=resolved, sources=sources)


@router.put("/{vm_id}/feature-flags", response_model=FeatureFlagsResponse)
async def update_vm_feature_flags(
    vm_id: int,
    data: FeatureFlagsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update VM-level feature flags."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM not found")

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    current = vm.feature_flags or {}
    for key, value in data.model_dump(exclude_none=True).items():
        current[key] = value

    vm.feature_flags = current
    await session.commit()

    global_flags = await FeatureFlagService.get_global_flags(session)
    user_flags = current_user.feature_flags or {}

    resolved = FeatureFlagService.resolve_all_flags(global_flags, user_flags, current)
    sources = FeatureFlagService.get_all_sources(global_flags, user_flags, current)

    return FeatureFlagsResponse(flags=resolved, sources=sources)


@router.delete("/{vm_id}/feature-flags/{feature}")
async def reset_vm_feature_flag(
    vm_id: int,
    feature: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove VM-level override for a feature, inheriting from user/global."""
    if feature not in FEATURE_DEFAULTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown feature: {feature}"
        )

    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM not found")

    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    current = vm.feature_flags or {}
    if feature in current:
        del current[feature]
        vm.feature_flags = current
        await session.commit()

    return {"message": f"{feature} reset to inherit from user/global"}
