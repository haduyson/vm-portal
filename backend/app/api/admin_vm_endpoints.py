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
from app.services.proxmox_client import ProxmoxService, create_proxmox_service_for_vm
from app.api.admin_shared_helpers import log_audit
from sqlalchemy import func


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
    return [
        AdminVMResponse(
            id=vm.id, user_id=vm.user_id, vmid=vm.vmid, name=vm.name,
            cores=vm.cores, memory_mb=vm.memory_mb, disk_gb=vm.disk_gb,
            os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
            ssh_domain=vm.ssh_domain, web_domain=vm.web_domain,
            ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
            proxmox_node=vm.proxmox_node, storage=vm.storage,
            created_at=vm.created_at, updated_at=vm.updated_at, username=username,
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
    if vm.status == "running":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VM đang chạy")

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        await proxmox.start_vm(vm.vmid)
        vm.status = "running"
        await session.commit()
        await session.refresh(vm)

        await log_audit(session, _admin.id, "start_vm", "vm", vm.id, f"Started VM: {vm.name} (VMID: {vm.vmid})")

        return AdminVMResponse(
            id=vm.id, user_id=vm.user_id, vmid=vm.vmid, name=vm.name,
            cores=vm.cores, memory_mb=vm.memory_mb, disk_gb=vm.disk_gb,
            os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
            ssh_domain=vm.ssh_domain, web_domain=vm.web_domain,
            ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
            proxmox_node=vm.proxmox_node, storage=vm.storage,
            created_at=vm.created_at, updated_at=vm.updated_at, username=username,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi khởi động VM: {str(e)}")


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
    if vm.status == "stopped":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VM đã dừng")

    try:
        proxmox = await create_proxmox_service_for_vm(vm, session)
        await proxmox.stop_vm(vm.vmid)
        vm.status = "stopped"
        await session.commit()
        await session.refresh(vm)

        await log_audit(session, _admin.id, "stop_vm", "vm", vm.id, f"Stopped VM: {vm.name} (VMID: {vm.vmid})")

        return AdminVMResponse(
            id=vm.id, user_id=vm.user_id, vmid=vm.vmid, name=vm.name,
            cores=vm.cores, memory_mb=vm.memory_mb, disk_gb=vm.disk_gb,
            os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
            ssh_domain=vm.ssh_domain, web_domain=vm.web_domain,
            ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
            proxmox_node=vm.proxmox_node, storage=vm.storage,
            created_at=vm.created_at, updated_at=vm.updated_at, username=username,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi dừng VM: {str(e)}")


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
        # Stop VM first if running (wait up to 30s)
        try:
            await proxmox.stop_vm(vm.vmid)
            for _ in range(6):
                await asyncio.sleep(5)
                status = await proxmox.get_vm_status(vm.vmid)
                if status.get("status") == "stopped":
                    break
        except Exception:
            pass
        await proxmox.delete_vm(vm.vmid)
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
        cores=vm.cores, memory_mb=vm.memory_mb, disk_gb=vm.disk_gb,
        os_type=vm.os_type, status=vm.status, ip_address=vm.ip_address,
        ssh_domain=vm.ssh_domain, web_domain=vm.web_domain,
        ssh_username=vm.ssh_username, ssh_password=vm.ssh_password,
        proxmox_node=vm.proxmox_node, storage=vm.storage,
        created_at=vm.created_at, updated_at=vm.updated_at, username=new_owner.username,
    )
