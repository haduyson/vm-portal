from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user, hash_password
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.admin_schemas import (
    AdminUserCreate,
    AdminUserResponse,
    AdminUserUpdate,
    AdminPasswordResetResponse,
    UserResourceUsageResponse,
)
from datetime import datetime, timedelta, timezone
from app.core.generate_random_password import generate_random_password
from app.services.telegram_notifier import TelegramNotifier
from app.services.system_settings_service import get_setting
from app.api.admin_shared_helpers import log_audit

router = APIRouter(prefix="/admin", tags=["admin-users"])


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new user (admin only)."""
    result = await session.execute(
        select(User).where(User.username == user_data.username)
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập đã tồn tại",
        )

    hashed_password = hash_password(user_data.password)
    new_user = User(
        username=user_data.username,
        hashed_password=hashed_password,
        telegram_chat_id=user_data.telegram_chat_id,
        is_admin=user_data.is_admin,
        max_disk_gb=user_data.max_disk_gb,
        max_ram_gb=user_data.max_ram_gb,
        max_vms=user_data.max_vms,
        max_cpu_cores=user_data.max_cpu_cores,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    await log_audit(
        session, admin.id, "create_user", "user", new_user.id,
        f"Created user: {new_user.username} (admin: {new_user.is_admin})",
    )

    # Send Telegram notification
    try:
        telegram = await TelegramNotifier.from_db_config(session)
        if telegram:
            msg = (
                f"🆕 *Tài khoản mới được tạo*\n\n"
                f"👤 Username: `{new_user.username}`\n"
                f"🔐 Password: `{user_data.password}`\n"
                f"👑 Admin: {'Có' if new_user.is_admin else 'Không'}\n"
                f"🔗 Đăng nhập: {telegram.portal_url}\n\n"
                f"Vui lòng đổi mật khẩu sau khi đăng nhập."
            )
            # Send to user if they have telegram_chat_id
            if new_user.telegram_chat_id:
                await telegram.send_message(new_user.telegram_chat_id, msg)
            # Send to admin default chat
            if telegram.default_chat_id:
                await telegram.send_message(telegram.default_chat_id, f"[Admin] {msg}")
    except Exception as e:
        print(f"Failed to send Telegram notification: {e}")

    return AdminUserResponse(
        id=new_user.id, username=new_user.username, is_admin=new_user.is_admin,
        is_suspended=new_user.is_suspended, telegram_chat_id=new_user.telegram_chat_id,
        created_at=new_user.created_at, vm_count=0,
        max_disk_gb=new_user.max_disk_gb, max_ram_gb=new_user.max_ram_gb,
        max_vms=new_user.max_vms, max_cpu_cores=new_user.max_cpu_cores,
    )


@router.get("/users", response_model=List[AdminUserResponse])
async def list_all_users(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all users with their VM counts."""
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
            User, func.coalesce(vm_count_sq.c.vm_count, 0).label("vm_count"),
        )
        .outerjoin(vm_count_sq, User.id == vm_count_sq.c.user_id)
        .order_by(User.created_at.desc())
    )

    rows = result.all()
    return [
        AdminUserResponse(
            id=user.id, username=user.username, is_admin=user.is_admin,
            is_suspended=user.is_suspended, telegram_chat_id=user.telegram_chat_id,
            created_at=user.created_at, vm_count=vm_count,
            max_disk_gb=user.max_disk_gb, max_ram_gb=user.max_ram_gb,
            max_vms=user.max_vms, max_cpu_cores=user.max_cpu_cores,
            feature_flags=user.feature_flags,
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
    """Update user properties including username, admin status, suspend status, telegram, and quotas."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")

    if user.id == admin.id and user_update.is_admin is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự bỏ quyền quản trị của chính mình")

    if user.id == admin.id and user_update.is_suspended is True:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự khóa tài khoản của chính mình")

    # Check username uniqueness if username is being changed
    if user_update.username is not None and user_update.username != user.username:
        existing = await session.execute(
            select(User).where(User.username == user_update.username)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tên đăng nhập đã tồn tại"
            )
        user.username = user_update.username
        await log_audit(
            session, admin.id, "update_username", "user", user.id,
            f"Changed username to {user_update.username}",
        )

    if user_update.is_admin is not None:
        old_admin_status = user.is_admin
        user.is_admin = user_update.is_admin
        if old_admin_status != user_update.is_admin:
            await log_audit(
                session, admin.id, "toggle_admin", "user", user.id,
                f"Changed admin status of {user.username} from {old_admin_status} to {user_update.is_admin}",
            )

    if user_update.is_suspended is not None:
        old_suspended_status = user.is_suspended
        user.is_suspended = user_update.is_suspended
        if old_suspended_status != user_update.is_suspended:
            await log_audit(
                session, admin.id, "toggle_suspended", "user", user.id,
                f"Changed suspended status of {user.username} from {old_suspended_status} to {user_update.is_suspended}",
            )

    if user_update.telegram_chat_id is not None:
        user.telegram_chat_id = user_update.telegram_chat_id
    if user_update.max_disk_gb is not None:
        user.max_disk_gb = user_update.max_disk_gb
    if user_update.max_ram_gb is not None:
        user.max_ram_gb = user_update.max_ram_gb
    if user_update.max_vms is not None:
        user.max_vms = user_update.max_vms
    if user_update.max_cpu_cores is not None:
        user.max_cpu_cores = user_update.max_cpu_cores
    if user_update.feature_flags is not None:
        user.feature_flags = user_update.feature_flags

    await session.commit()
    await session.refresh(user)

    vm_result = await session.execute(
        select(func.count(VirtualMachine.id)).where(VirtualMachine.user_id == user.id)
    )
    vm_count = vm_result.scalar() or 0

    return AdminUserResponse(
        id=user.id, username=user.username, is_admin=user.is_admin,
        is_suspended=user.is_suspended, telegram_chat_id=user.telegram_chat_id,
        created_at=user.created_at, vm_count=vm_count,
        max_disk_gb=user.max_disk_gb, max_ram_gb=user.max_ram_gb,
        max_vms=user.max_vms, max_cpu_cores=user.max_cpu_cores,
        feature_flags=user.feature_flags,
    )


@router.post("/users/{user_id}/reset-password", response_model=AdminPasswordResetResponse)
async def reset_user_password(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Reset user password (admin only)."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")

    new_password = generate_random_password()
    user.hashed_password = hash_password(new_password)

    # Set temp password expiry
    expiry_val = await get_setting(session, "temp_password_expiry_minutes")
    expiry_minutes = int(expiry_val) if expiry_val else 60
    user.temp_password_expires_at = datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes)

    await session.commit()

    telegram_sent = False
    if user.telegram_chat_id:
        telegram = await TelegramNotifier.from_db_config(session)
        telegram_sent = await telegram.send_password_reset(
            user.telegram_chat_id, user.username, new_password,
            expiry_minutes=expiry_minutes,
        )

    await log_audit(
        session, admin.id, "reset_password", "user", user.id,
        f"Reset password for user: {user.username} (Telegram: {telegram_sent})",
    )

    return AdminPasswordResetResponse(new_password=new_password, telegram_sent=telegram_sent)


@router.get("/users/{user_id}/resource-usage", response_model=UserResourceUsageResponse)
async def get_user_resource_usage(
    user_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get user resource usage summary (VMs, Disk, RAM, CPU)."""
    # Get user to check quotas
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")

    # Get all VMs for this user
    vms_result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.user_id == user_id)
    )
    vms = vms_result.scalars().all()

    vms_used = len(vms)
    disk_used_gb = sum(vm.disk_gb for vm in vms)
    ram_used_mb = sum(vm.memory_mb for vm in vms)
    ram_used_gb = ram_used_mb / 1024.0  # Convert to GB for response
    cpu_used_cores = sum(vm.cores for vm in vms)

    return UserResourceUsageResponse(
        vms_used=vms_used,
        vms_max=user.max_vms,
        disk_used_gb=float(disk_used_gb),
        disk_max_gb=user.max_disk_gb,
        ram_used_gb=float(ram_used_gb),
        ram_max_gb=user.max_ram_gb,
        cpu_used_cores=cpu_used_cores,
        cpu_max_cores=user.max_cpu_cores,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")

    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể xóa chính mình")

    await log_audit(
        session, admin.id, "delete_user", "user", user.id,
        f"Deleted user: {user.username}",
    )

    await session.execute(delete(VirtualMachine).where(VirtualMachine.user_id == user_id))
    await session.delete(user)
    await session.commit()
