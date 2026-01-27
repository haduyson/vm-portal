from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.models.audit_log_model import AuditLog
from app.schemas.audit_log_schemas import AuditLogResponse
from app.schemas.admin_schemas import (
    AdminStatsResponse,
    AdminUserCreate,
    AdminUserResponse,
    AdminUserUpdate,
    AdminVMResponse,
    AdminPasswordResetResponse,
    TelegramSettingsResponse,
    TelegramSettingsUpdate,
)
from app.core.security import hash_password
from app.services.proxmox_client import ProxmoxService
from app.core.generate_random_password import generate_random_password
from app.services.telegram_notifier import TelegramNotifier
from app.services.system_settings_service import (
    get_telegram_config,
    set_setting,
)

router = APIRouter(prefix="/admin", tags=["admin"])


async def log_audit(
    session: AsyncSession,
    admin_id: int,
    action: str,
    target_type: str,
    target_id: int = None,
    details: str = None,
):
    """Helper function to log admin actions."""
    audit_log = AuditLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
    )
    session.add(audit_log)
    await session.commit()


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new user (admin only)."""
    # Check if username already exists
    result = await session.execute(
        select(User).where(User.username == user_data.username)
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập đã tồn tại",
        )

    # Create new user
    hashed_password = hash_password(user_data.password)
    new_user = User(
        username=user_data.username,
        hashed_password=hashed_password,
        telegram_chat_id=user_data.telegram_chat_id,
        is_admin=user_data.is_admin,
        max_disk_gb=user_data.max_disk_gb,
        max_ram_mb=user_data.max_ram_mb,
        max_vms=user_data.max_vms,
        max_cpu_cores=user_data.max_cpu_cores,
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    # Log audit
    await log_audit(
        session,
        admin.id,
        "create_user",
        "user",
        new_user.id,
        f"Created user: {new_user.username} (admin: {new_user.is_admin})",
    )

    return AdminUserResponse(
        id=new_user.id,
        username=new_user.username,
        is_admin=new_user.is_admin,
        telegram_chat_id=new_user.telegram_chat_id,
        created_at=new_user.created_at,
        vm_count=0,
        max_disk_gb=new_user.max_disk_gb,
        max_ram_mb=new_user.max_ram_mb,
        max_vms=new_user.max_vms,
        max_cpu_cores=new_user.max_cpu_cores,
    )


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
            max_disk_gb=user.max_disk_gb,
            max_ram_mb=user.max_ram_mb,
            max_vms=user.max_vms,
            max_cpu_cores=user.max_cpu_cores,
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
        old_admin_status = user.is_admin
        user.is_admin = user_update.is_admin
        # Log admin toggle
        if old_admin_status != user_update.is_admin:
            await log_audit(
                session,
                admin.id,
                "toggle_admin",
                "user",
                user.id,
                f"Changed admin status of {user.username} from {old_admin_status} to {user_update.is_admin}",
            )
    if user_update.telegram_chat_id is not None:
        user.telegram_chat_id = user_update.telegram_chat_id
    if user_update.max_disk_gb is not None:
        user.max_disk_gb = user_update.max_disk_gb
    if user_update.max_ram_mb is not None:
        user.max_ram_mb = user_update.max_ram_mb
    if user_update.max_vms is not None:
        user.max_vms = user_update.max_vms
    if user_update.max_cpu_cores is not None:
        user.max_cpu_cores = user_update.max_cpu_cores

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
        max_disk_gb=user.max_disk_gb,
        max_ram_mb=user.max_ram_mb,
        max_vms=user.max_vms,
        max_cpu_cores=user.max_cpu_cores,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng",
        )

    # Generate new random password
    new_password = generate_random_password()

    # Hash and save new password
    user.hashed_password = hash_password(new_password)
    await session.commit()

    # Try to send via Telegram if user has telegram_chat_id
    telegram_sent = False
    if user.telegram_chat_id:
        telegram = await TelegramNotifier.from_db_config(session)
        telegram_sent = await telegram.send_password_reset(
            user.telegram_chat_id, user.username, new_password
        )

    # Log audit
    await log_audit(
        session,
        admin.id,
        "reset_password",
        "user",
        user.id,
        f"Reset password for user: {user.username} (Telegram: {telegram_sent})",
    )

    return AdminPasswordResetResponse(
        new_password=new_password,
        telegram_sent=telegram_sent,
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

    # Log audit
    await log_audit(
        session,
        admin.id,
        "delete_user",
        "user",
        user.id,
        f"Deleted user: {user.username}",
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    vm, username = row

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

        # Log audit
        await log_audit(
            session,
            _admin.id,
            "start_vm",
            "vm",
            vm.id,
            f"Started VM: {vm.name} (VMID: {vm.vmid})",
        )

        return AdminVMResponse(
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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi khởi động VM: {str(e)}",
        )


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    vm, username = row

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

        # Log audit
        await log_audit(
            session,
            _admin.id,
            "stop_vm",
            "vm",
            vm.id,
            f"Stopped VM: {vm.name} (VMID: {vm.vmid})",
        )

        return AdminVMResponse(
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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi dừng VM: {str(e)}",
        )


@router.delete("/vms/{vm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_vm(
    vm_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete any VM from Proxmox and DB (admin only)."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    try:
        # Log audit
        await log_audit(
            session,
            _admin.id,
            "delete_vm",
            "vm",
            vm.id,
            f"Deleted VM: {vm.name} (VMID: {vm.vmid})",
        )

        # Delete from Proxmox first
        proxmox = ProxmoxService()
        await proxmox.delete_vm(vm.vmid)

        # Then delete from database
        await session.delete(vm)
        await session.commit()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi xóa VM: {str(e)}",
        )


@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get audit logs (admin only)."""
    result = await session.execute(
        select(AuditLog, User.username)
        .join(User, AuditLog.admin_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
    )

    rows = result.all()
    return [
        AuditLogResponse(
            id=log.id,
            admin_username=username,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            details=log.details,
            created_at=log.created_at,
        )
        for log, username in rows
    ]


@router.get("/settings/telegram", response_model=TelegramSettingsResponse)
async def get_telegram_settings(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get current Telegram bot configuration (admin only)."""
    config = await get_telegram_config(session)

    # Mask bot token for security (show only last 4 chars)
    bot_token = config["bot_token"]
    if bot_token and len(bot_token) > 4:
        masked_token = "*" * (len(bot_token) - 4) + bot_token[-4:]
    else:
        masked_token = "****" if bot_token else ""

    return TelegramSettingsResponse(
        bot_token_masked=masked_token,
        bot_token=bot_token,
        default_chat_id=config["default_chat_id"],
        source=config["source"]
    )


@router.put("/settings/telegram", response_model=TelegramSettingsResponse)
async def update_telegram_settings(
    settings_update: TelegramSettingsUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update Telegram bot configuration (admin only)."""
    if settings_update.bot_token is not None:
        await set_setting(session, "telegram_bot_token", settings_update.bot_token)

    if settings_update.default_chat_id is not None:
        await set_setting(session, "telegram_default_chat_id", settings_update.default_chat_id)

    # Log audit
    details = []
    if settings_update.bot_token is not None:
        details.append("Updated bot token")
    if settings_update.default_chat_id is not None:
        details.append(f"Updated default chat ID to {settings_update.default_chat_id}")

    await log_audit(
        session,
        admin.id,
        "update_telegram_settings",
        "system",
        None,
        ", ".join(details)
    )

    # Return updated config
    config = await get_telegram_config(session)
    bot_token = config["bot_token"]
    if bot_token and len(bot_token) > 4:
        masked_token = "*" * (len(bot_token) - 4) + bot_token[-4:]
    else:
        masked_token = "****" if bot_token else ""

    return TelegramSettingsResponse(
        bot_token_masked=masked_token,
        bot_token=bot_token,
        default_chat_id=config["default_chat_id"],
        source=config["source"]
    )


@router.post("/settings/telegram/test", status_code=status.HTTP_200_OK)
async def test_telegram_settings(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Send a test message to verify Telegram configuration (admin only)."""
    config = await get_telegram_config(session)

    if not config["bot_token"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bot token chưa được cấu hình"
        )

    if not config["default_chat_id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat ID mặc định chưa được cấu hình"
        )

    telegram = TelegramNotifier(
        bot_token=config["bot_token"],
        default_chat_id=config["default_chat_id"]
    )

    test_message = "🔔 *Thông báo kiểm tra*\n\nCấu hình Telegram Bot đã hoạt động thành công!"
    success = await telegram.send_message(config["default_chat_id"], test_message)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể gửi tin nhắn. Vui lòng kiểm tra lại bot token và chat ID"
        )

    return {"message": "Tin nhắn thử đã được gửi thành công"}
