from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.vm_schemas import VMCreate, VMResponse, VMListResponse, VMResourceResponse
from app.services.vm_provisioning_service import VMProvisioningService
from app.services.proxmox_client import ProxmoxService
from app.config import settings
import asyncio

router = APIRouter(prefix="/vms", tags=["virtual-machines"])


@router.post("", response_model=VMResponse, status_code=status.HTTP_201_CREATED)
async def create_vm(
    vm_data: VMCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new virtual machine."""
    try:
        # Get next available VMID from Proxmox
        provisioning_service = VMProvisioningService()
        vmid = await provisioning_service.proxmox.get_next_vmid()

        # Create VM record in database
        new_vm = VirtualMachine(
            user_id=current_user.id,
            vmid=vmid,
            name=vm_data.name,
            cores=vm_data.cores,
            memory_mb=vm_data.memory_mb,
            disk_gb=vm_data.disk_gb,
            os_type=vm_data.os_type,
            status="creating",
            proxmox_node=settings.PROXMOX_NODE,
            storage=settings.PROXMOX_VM_STORAGE,
        )

        session.add(new_vm)
        await session.commit()
        await session.refresh(new_vm)

        # Start provisioning in background
        asyncio.create_task(
            provisioning_service.provision_vm(
                session,
                new_vm.id,
                current_user.telegram_chat_id,
            )
        )

        return new_vm

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
    # Get all VMs for the user
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
    # Get VM from database
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    # Check if user owns this VM
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
        proxmox = ProxmoxService()
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
        proxmox = ProxmoxService()
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
        proxmox = ProxmoxService()
        await proxmox.stop_vm(vm.vmid)
        # Wait a bit before starting
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
        proxmox = ProxmoxService()
        resources = await proxmox.get_vm_resources(vm.vmid)
        return VMResourceResponse(**resources)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy thông tin tài nguyên: {str(e)}",
        )
