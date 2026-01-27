from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.vm_schemas import VMCreate, VMResponse, VMListResponse
from app.services.vm_provisioning_service import VMProvisioningService
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
