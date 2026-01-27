from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.admin_schemas import (
    AdminStatsResponse,
    AdminUserResponse,
    AdminUserUpdate,
    AdminVMResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[AdminUserResponse])
async def list_all_users(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all users with their VM counts."""
    # Subquery for VM count per user
    vm_count_sq = (
        select(
            VirtualMachine.user_id,
            func.count(VirtualMachine.id).label("vm_count"),
        )
        .group_by(VirtualMachine.user_id)
        .subquery()
    )

    result = await session.execute(
        select(
            User,
            func.coalesce(vm_count_sq.c.vm_count, 0).label("vm_count"),
        )
        .outerjoin(vm_count_sq, User.id == vm_count_sq.c.user_id)
        .order_by(User.created_at.desc())
    )

    rows = result.all()
    return [
        AdminUserResponse(
            id=user.id,
            username=user.username,
            is_admin=user.is_admin,
            telegram_chat_id=user.telegram_chat_id,
            created_at=user.created_at,
            vm_count=vm_count,
        )
        for user, vm_count in rows
    ]


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: int,
    user_update: AdminUserUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update user admin status or telegram chat ID."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng",
        )

    # Prevent admin from removing their own admin rights
    if user.id == admin.id and user_update.is_admin is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự bỏ quyền quản trị của chính mình",
        )

    if user_update.is_admin is not None:
        user.is_admin = user_update.is_admin
    if user_update.telegram_chat_id is not None:
        user.telegram_chat_id = user_update.telegram_chat_id

    await session.commit()
    await session.refresh(user)

    # Get VM count
    vm_result = await session.execute(
        select(func.count(VirtualMachine.id)).where(
            VirtualMachine.user_id == user.id
        )
    )
    vm_count = vm_result.scalar() or 0

    return AdminUserResponse(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        telegram_chat_id=user.telegram_chat_id,
        created_at=user.created_at,
        vm_count=vm_count,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a user and all their VMs."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng",
        )

    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa chính mình",
        )

    # Delete user's VMs first
    await session.execute(
        delete(VirtualMachine).where(VirtualMachine.user_id == user_id)
    )
    await session.delete(user)
    await session.commit()


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
            id=vm.id,
            user_id=vm.user_id,
            vmid=vm.vmid,
            name=vm.name,
            cores=vm.cores,
            memory_mb=vm.memory_mb,
            disk_gb=vm.disk_gb,
            os_type=vm.os_type,
            status=vm.status,
            ip_address=vm.ip_address,
            ssh_domain=vm.ssh_domain,
            ssh_username=vm.ssh_username,
            ssh_password=vm.ssh_password,
            proxmox_node=vm.proxmox_node,
            storage=vm.storage,
            created_at=vm.created_at,
            updated_at=vm.updated_at,
            username=username,
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
    total_vms = (
        await session.execute(select(func.count(VirtualMachine.id)))
    ).scalar() or 0
    running_vms = (
        await session.execute(
            select(func.count(VirtualMachine.id)).where(
                VirtualMachine.status == "running"
            )
        )
    ).scalar() or 0
    creating_vms = (
        await session.execute(
            select(func.count(VirtualMachine.id)).where(
                VirtualMachine.status == "creating"
            )
        )
    ).scalar() or 0

    return AdminStatsResponse(
        total_users=total_users,
        total_vms=total_vms,
        running_vms=running_vms,
        creating_vms=creating_vms,
    )
