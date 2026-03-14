from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import (
    hash_password, verify_password, create_access_token, get_current_user,
    create_refresh_token, verify_refresh_token, revoke_refresh_tokens,
    revoke_single_refresh_token, create_partial_token, verify_partial_token,
)
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.user_schemas import UserLogin, UserResponse, ProfileUpdate, ForgotPasswordRequest
from app.schemas.auth_schemas import (
    TokenPairResponse, RefreshTokenRequest,
    LoginPartialResponse, Login2FARequest,
    TwoFactorSetupResponse, TwoFactorEnableRequest, TwoFactorDisableRequest,
)
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.core.generate_random_password import generate_random_password
import importlib
from app.services.system_settings_service import get_setting

router = APIRouter(prefix="/auth", tags=["authentication"])


async def _get_refresh_expiry_days(session: AsyncSession) -> int:
    """Get refresh token expiry from settings, default 7 days."""
    val = await get_setting(session, "refresh_token_expiry_days")
    try:
        return int(val) if val else 7
    except (ValueError, TypeError):
        return 7


@router.post("/login")
async def login(
    credentials: UserLogin,
    session: AsyncSession = Depends(get_session),
):
    """Authenticate user and return JWT token pair."""
    result = await session.execute(
        select(User).where(User.username == credentials.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không đúng",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if temp password has expired
    if user.temp_password_expires_at and datetime.now(timezone.utc) > user.temp_password_expires_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mật khẩu tạm thời đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu mới.",
        )

    # Check if 2FA is enabled for this user
    if user.totp_secret:
        partial_token = create_partial_token(user.username)
        return LoginPartialResponse(
            requires_2fa=True,
            partial_token=partial_token,
        )

    # No 2FA - issue full token pair
    access_token = create_access_token(data={"sub": user.username})
    expiry_days = await _get_refresh_expiry_days(session)
    refresh_token = await create_refresh_token(session, user.id, expiry_days)

    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        username=user.username,
        is_admin=user.is_admin,
    )


@router.post("/login/2fa", response_model=TokenPairResponse)
async def login_2fa(
    request: Login2FARequest,
    session: AsyncSession = Depends(get_session),
):
    """Complete 2FA login with TOTP code."""
    username = verify_partial_token(request.partial_token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn",
        )

    result = await session.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if not user or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Người dùng không hợp lệ",
        )

    # Verify TOTP code - import here to avoid issues if pyotp not installed yet
    try:
        from app.services.totp_service import verify_totp_code
        if not verify_totp_code(user.totp_secret, request.totp_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mã xác thực không đúng",
            )
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chức năng 2FA chưa được cài đặt",
        )

    access_token = create_access_token(data={"sub": user.username})
    expiry_days = await _get_refresh_expiry_days(session)
    refresh_token = await create_refresh_token(session, user.id, expiry_days)

    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        username=user.username,
        is_admin=user.is_admin,
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_session),
):
    """Refresh access token using refresh token (rotation)."""
    token_record = await verify_refresh_token(session, request.refresh_token)
    if not token_record:
        # SEC-016: Revoke token on verification failure to prevent replay attacks
        await revoke_single_refresh_token(session, request.refresh_token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token không hợp lệ hoặc đã hết hạn",
        )

    # Get user
    result = await session.execute(
        select(User).where(User.id == token_record.user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Người dùng không tồn tại",
        )

    # Revoke old token (rotation)
    await revoke_single_refresh_token(session, request.refresh_token)

    # Issue new pair
    access_token = create_access_token(data={"sub": user.username})
    expiry_days = await _get_refresh_expiry_days(session)
    new_refresh_token = await create_refresh_token(session, user.id, expiry_days)

    return TokenPairResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        username=user.username,
        is_admin=user.is_admin,
    )


@router.post("/logout")
async def logout(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_session),
):
    """Revoke refresh token on logout."""
    await revoke_single_refresh_token(session, request.refresh_token)
    return {"message": "Đăng xuất thành công"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return UserResponse.from_user(current_user)


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    profile_update: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update own password, telegram_chat_id, email, and notification_preference."""
    if profile_update.new_password:
        if not profile_update.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cần nhập mật khẩu hiện tại để đổi mật khẩu",
            )
        if not verify_password(profile_update.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mật khẩu hiện tại không đúng",
            )
        current_user.hashed_password = hash_password(profile_update.new_password)
        current_user.temp_password_expires_at = None  # Clear temp password expiry

    if profile_update.telegram_chat_id is not None:
        current_user.telegram_chat_id = profile_update.telegram_chat_id

    if profile_update.email is not None:
        current_user.email = profile_update.email

    if profile_update.notification_preference is not None:
        current_user.notification_preference = profile_update.notification_preference

    if profile_update.tailscale_email is not None:
        current_user.tailscale_email = profile_update.tailscale_email

    await session.commit()
    await session.refresh(current_user)
    return UserResponse.from_user(current_user)


class QuotaResponse(BaseModel):
    max_vms: Optional[int]
    used_vms: int
    max_disk_gb: Optional[int]
    used_disk_gb: int
    max_ram_gb: Optional[int]
    used_ram_gb: int
    max_cpu_cores: Optional[int]
    used_cpu_cores: int


@router.get("/quota", response_model=QuotaResponse)
async def get_quota(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get user quota limits and current usage."""
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.user_id == current_user.id)
    )
    user_vms = result.scalars().all()

    used_vms = len(user_vms)
    used_disk_gb = sum(vm.disk_gb for vm in user_vms)
    used_ram_gb = sum(vm.memory_gb for vm in user_vms)  # Already in GB
    used_cpu_cores = sum(vm.cores for vm in user_vms)

    return QuotaResponse(
        max_vms=current_user.max_vms,
        used_vms=used_vms,
        max_disk_gb=current_user.max_disk_gb,
        used_disk_gb=used_disk_gb,
        max_ram_gb=current_user.max_ram_gb,
        used_ram_gb=used_ram_gb,
        max_cpu_cores=current_user.max_cpu_cores,
        used_cpu_cores=used_cpu_cores,
    )


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    """Reset password and send via user's notification preference (Telegram/Email)."""
    result = await session.execute(
        select(User).where(User.username == request.username)
    )
    user = result.scalar_one_or_none()

    if not user:
        return {"message": "Nếu tài khoản tồn tại và có phương thức liên lạc, mật khẩu mới sẽ được gửi."}

    # Check if user has any notification method configured
    pref = getattr(user, "notification_preference", None) or "telegram"
    has_telegram = bool(user.telegram_chat_id)
    has_email = bool(getattr(user, "email", None))

    can_notify = False
    if pref == "telegram" and has_telegram:
        can_notify = True
    elif pref == "email" and has_email:
        can_notify = True
    elif pref == "both" and (has_telegram or has_email):
        can_notify = True

    if not can_notify:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản chưa cấu hình phương thức thông báo. Vui lòng liên hệ quản trị viên.",
        )

    new_password = generate_random_password()
    user.hashed_password = hash_password(new_password)

    # Set temp password expiry
    expiry_val = await get_setting(session, "temp_password_expiry_minutes")
    expiry_minutes = int(expiry_val) if expiry_val else 60
    user.temp_password_expires_at = datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes)

    await session.commit()

    # Send via NotificationService (respects user preference)
    _notif = importlib.import_module("app.services.unified-notification-service")
    NotificationService = _notif.NotificationService
    notifier = await NotificationService.from_db_config(session)
    await notifier.notify_password_reset(user, new_password, expiry_minutes)

    return {"message": "Mật khẩu mới đã được gửi qua phương thức thông báo của bạn."}


# --- 2FA Setup/Enable/Disable endpoints ---

@router.get("/2fa/setup", response_model=TwoFactorSetupResponse)
async def setup_2fa(
    current_user: User = Depends(get_current_user),
):
    """Generate TOTP secret and QR code for 2FA setup."""
    if current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA đã được bật cho tài khoản này",
        )

    try:
        from app.services.totp_service import generate_totp_secret, get_totp_uri, generate_qr_base64
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chức năng 2FA chưa được cài đặt",
        )

    secret = generate_totp_secret()
    uri = get_totp_uri(secret, current_user.username)
    qr_base64 = generate_qr_base64(uri)

    return TwoFactorSetupResponse(secret=secret, qr_code_base64=qr_base64)


@router.post("/2fa/enable")
async def enable_2fa(
    request: TwoFactorEnableRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Enable 2FA by verifying TOTP code against the secret from /2fa/setup."""
    if current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA đã được bật",
        )

    try:
        from app.services.totp_service import verify_totp_code
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chức năng 2FA chưa được cài đặt",
        )

    if not verify_totp_code(request.secret, request.totp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã xác thực không đúng",
        )

    current_user.totp_secret = request.secret
    await session.commit()
    return {"message": "Đã bật xác thực hai yếu tố"}


@router.post("/2fa/disable")
async def disable_2fa(
    request: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Disable 2FA by verifying current TOTP code."""
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA chưa được bật",
        )

    try:
        from app.services.totp_service import verify_totp_code
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chức năng 2FA chưa được cài đặt",
        )

    if not verify_totp_code(current_user.totp_secret, request.totp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã xác thực không đúng",
        )

    current_user.totp_secret = None
    await session.commit()
    return {"message": "Đã tắt xác thực hai yếu tố"}
