import asyncio
import importlib
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.admin_schemas import AdminVMResponse, AdminStatsResponse
from app.schemas.vm_schemas import TailscaleInstallRequest, TailscaleInstallResponse
from app.services.proxmox_client import ProxmoxService, create_proxmox_service_for_vm, create_proxmox_service_for_server
from app.api.vm_endpoints import _get_proxmox_status_map
from app.api.admin_shared_helpers import log_audit
from sqlalchemy import func

_tailscale_service = importlib.import_module("app.services.tailscale-installation-service")
TailscaleInstallationService = _tailscale_service.TailscaleInstallationService


class VMTransferRequest(BaseModel):
    new_user_id: int

router = APIRouter(prefix="/admin", tags=["admin-vms"])


@router.get("/vms", response_model=List[AdminVMResponse])
async def list_all_vms(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all VMs across all users."""
    result = await session.execute(
        select(VirtualMachine, User.username)
        .join(User, VirtualMachine.user_id == User.id)
        .order_by(VirtualMachine.created_at.desc())
    )
    rows = result.all()

    # Batch-fetch realtime Proxmox status
    all_vms = [vm for vm, _ in rows]
    proxmox_status_map = await _get_proxmox_status_map(all_vms, session)

    return [
        AdminVMResponse(
            id=vm.id, user_id=vm.user_id, vmid=vm.vmid, name=vm.name,
            cores=vm.cores, memory_gb=vm.memory_gb, disk_gb=vm.disk_gb,
            os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
            tailscale_ip=vm.tailscale_ip, web_domain=vm.web_domain,
            ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
            proxmox_node=vm.proxmox_node, storage=vm.storage,
            created_at=vm.created_at, updated_at=vm.updated_at, username=username,
            proxmox_status=proxmox_status_map.get(vm.vmid),
        )
        for vm, username in rows
    ]


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get system-wide statistics."""
    total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0
    total_vms = (await session.execute(select(func.count(VirtualMachine.id)))).scalar() or 0
    running_vms = (await session.execute(
        select(func.count(VirtualMachine.id)).where(VirtualMachine.status == "running")
    )).scalar() or 0
    creating_vms = (await session.execute(
        select(func.count(VirtualMachine.id)).where(VirtualMachine.status == "creating")
    )).scalar() or 0

    return AdminStatsResponse(
        total_users=total_users, total_vms=total_vms,
        running_vms=running_vms, creating_vms=creating_vms,
    )


@router.post("/vms/{vm_id}/start", response_model=AdminVMResponse)
async def admin_start_vm(
    vm_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Start any VM (admin only)."""
    result = await session.execute(
        select(VirtualMachine, User.username)
        .join(User, VirtualMachine.user_id == User.id)
        .where(VirtualMachine.id == vm_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")

    vm, username = row
    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        real_status = (await proxmox.get_vm_status(vm.vmid)).get("status", vm.status)
        if vm.status != real_status:
            vm.status = real_status
            await session.commit()
        if real_status == "running":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VM đang chạy")

        await proxmox.start_vm(vm.vmid)
        vm.status = "running"
        await session.commit()
        await session.refresh(vm)

        await log_audit(session, _admin.id, "start_vm", "vm", vm.id, f"Started VM: {vm.name} (VMID: {vm.vmid})")

        return AdminVMResponse(
            id=vm.id, user_id=vm.user_id, vmid=vm.vmid, name=vm.name,
            cores=vm.cores, memory_gb=vm.memory_gb, disk_gb=vm.disk_gb,
            os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
            tailscale_ip=vm.tailscale_ip, web_domain=vm.web_domain,
            ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
            proxmox_node=vm.proxmox_node, storage=vm.storage,
            created_at=vm.created_at, updated_at=vm.updated_at, username=username,
            proxmox_status="running",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error starting VM {vm.vmid}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Lỗi khi khởi động VM. Vui lòng thử lại sau.")


@router.post("/vms/{vm_id}/stop", response_model=AdminVMResponse)
async def admin_stop_vm(
    vm_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Stop any VM (admin only)."""
    result = await session.execute(
        select(VirtualMachine, User.username)
        .join(User, VirtualMachine.user_id == User.id)
        .where(VirtualMachine.id == vm_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")

    vm, username = row
    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        real_status = (await proxmox.get_vm_status(vm.vmid)).get("status", vm.status)
        if vm.status != real_status:
            vm.status = real_status
            await session.commit()
        if real_status == "stopped":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VM đã dừng")

        await proxmox.stop_vm(vm.vmid)
        vm.status = "stopped"
        await session.commit()
        await session.refresh(vm)

        await log_audit(session, _admin.id, "stop_vm", "vm", vm.id, f"Stopped VM: {vm.name} (VMID: {vm.vmid})")

        return AdminVMResponse(
            id=vm.id, user_id=vm.user_id, vmid=vm.vmid, name=vm.name,
            cores=vm.cores, memory_gb=vm.memory_gb, disk_gb=vm.disk_gb,
            os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
            tailscale_ip=vm.tailscale_ip, web_domain=vm.web_domain,
            ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
            proxmox_node=vm.proxmox_node, storage=vm.storage,
            created_at=vm.created_at, updated_at=vm.updated_at, username=username,
            proxmox_status="stopped",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error stopping VM {vm.vmid}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Lỗi khi dừng VM. Vui lòng thử lại sau.")


@router.delete("/vms/{vm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_vm(
    vm_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete any VM from Proxmox and DB (admin only)."""
    result = await session.execute(select(VirtualMachine).where(VirtualMachine.id == vm_id))
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        # Stop VM first if running (wait up to 60s)
        try:
            vm_status = await proxmox.get_vm_status(vm.vmid)
            if vm_status.get("status") == "running":
                await proxmox.stop_vm(vm.vmid)
                for _ in range(12):  # 60s timeout
                    await asyncio.sleep(5)
                    vm_status = await proxmox.get_vm_status(vm.vmid)
                    if vm_status.get("status") == "stopped":
                        break
        except Exception:
            pass
        await proxmox.delete_vm(vm.vmid)

        # Cleanup Cloudflare tunnels (HTTP + SSH)
        try:
            _cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
            CloudflareDomain = _cf_domain_model.CloudflareDomain
            _cf_service = importlib.import_module("app.services.cloudflare-tunnel-service")
            CloudflareTunnelService = _cf_service.CloudflareTunnelService
            domains_result = await session.execute(select(CloudflareDomain).where(CloudflareDomain.is_active == True))
            for d in domains_result.scalars().all():
                cf_service = CloudflareTunnelService(
                    api_token=d.cf_api_token, zone_id=d.cf_zone_id, tunnel_id=d.cf_tunnel_id,
                    tunnel_name=d.cf_tunnel_name, base_domain=d.domain, config_path=d.cloudflared_config_path,
                )
                await cf_service.cleanup_vm_tunnels(vm.name, vm.web_domain)
        except Exception as cf_err:
            print(f"Warning: CF cleanup failed: {cf_err}")

        await log_audit(session, _admin.id, "delete_vm", "vm", vm.id, f"Deleted VM: {vm.name} (VMID: {vm.vmid})")
        await session.delete(vm)
        await session.commit()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi xóa VM: {str(e)}")


@router.post("/vms/{vm_id}/transfer", response_model=AdminVMResponse)
async def admin_transfer_vm(
    vm_id: int,
    request: VMTransferRequest,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Transfer VM ownership to another user (admin only)."""
    # Get VM
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")

    # Get old owner
    old_owner = await session.execute(select(User).where(User.id == vm.user_id))
    old_owner = old_owner.scalar_one_or_none()

    # Get new owner
    new_owner = await session.execute(select(User).where(User.id == request.new_user_id))
    new_owner = new_owner.scalar_one_or_none()
    if not new_owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng mới")

    if vm.user_id == request.new_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VM đã thuộc về người dùng này")

    # Transfer ownership
    old_username = old_owner.username if old_owner else "unknown"
    vm.user_id = request.new_user_id
    await session.commit()
    await session.refresh(vm)

    await log_audit(
        session, _admin.id, "transfer_vm", "vm", vm.id,
        f"Transferred VM {vm.name} from {old_username} to {new_owner.username}"
    )

    return AdminVMResponse(
        id=vm.id, user_id=vm.user_id, vmid=vm.vmid, name=vm.name,
        cores=vm.cores, memory_gb=vm.memory_gb, disk_gb=vm.disk_gb,
        os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
        tailscale_ip=vm.tailscale_ip, web_domain=vm.web_domain,
        ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
        proxmox_node=vm.proxmox_node, storage=vm.storage,
        created_at=vm.created_at, updated_at=vm.updated_at, username=new_owner.username,
    )


@router.post("/vms/{vm_id}/install-tailscale", response_model=TailscaleInstallResponse)
async def admin_install_tailscale(
    vm_id: int,
    request: TailscaleInstallRequest,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Install and authenticate Tailscale on a VM (admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()
    if not vm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy VM")

    if vm.status != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM phải đang chạy để cài đặt Tailscale"
        )

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)

        # Check if guest agent is running
        agent_running = await proxmox.is_guest_agent_running(vm.vmid)
        if not agent_running:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="QEMU Guest Agent chưa sẵn sàng. Vui lòng đợi VM khởi động xong."
            )

        # Install and authenticate Tailscale
        install_result = await TailscaleInstallationService.install_and_authenticate(
            vm.vmid, proxmox, request.auth_key
        )

        if install_result.get("success"):
            # Update VM record with Tailscale IP
            if install_result.get("tailscale_ip"):
                vm.tailscale_ip = install_result["tailscale_ip"]
                await session.commit()
                await session.refresh(vm)

            await log_audit(
                session, _admin.id, "install_tailscale", "vm", vm.id,
                f"Installed Tailscale on VM: {vm.name} (VMID: {vm.vmid}), IP: {install_result.get('tailscale_ip')}"
            )

            return TailscaleInstallResponse(
                success=True,
                tailscale_ip=install_result.get("tailscale_ip"),
                message=install_result.get("message"),
            )
        else:
            return TailscaleInstallResponse(
                success=False,
                error=install_result.get("error"),
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi cài đặt Tailscale: {str(e)}"
        )



