from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.user_schemas import UserCreate, UserLogin, UserResponse, Token, ProfileUpdate, ForgotPasswordRequest
from pydantic import BaseModel
from typing import Optional
from app.core.generate_random_password import generate_random_password
from app.services.telegram_notifier import TelegramNotifier

router = APIRouter(prefix="/auth", tags=["authentication"])


# Public registration disabled - use admin endpoint to create users
# @router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
# async def register(
#     user_data: UserCreate,
#     session: AsyncSession = Depends(get_session),
# ):
#     """Register a new user."""
#     # Check if username already exists
#     result = await session.execute(
#         select(User).where(User.username == user_data.username)
#     )
#     existing_user = result.scalar_one_or_none()
#
#     if existing_user:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="Tên đăng nhập đã tồn tại",
#         )
#
#     # Create new user
#     hashed_password = hash_password(user_data.password)
#     new_user = User(
#         username=user_data.username,
#         hashed_password=hashed_password,
#         telegram_chat_id=user_data.telegram_chat_id,
#     )
#
#     session.add(new_user)
#     await session.commit()
#     await session.refresh(new_user)
#
#     return new_user


@router.post("/login", response_model=Token)
async def login(
    credentials: UserLogin,
    session: AsyncSession = Depends(get_session),
):
    """Authenticate user and return JWT token."""
    # Get user from database
    result = await session.execute(
        select(User).where(User.username == credentials.username)
    )
    user = result.scalar_one_or_none()

    # Verify credentials
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không đúng",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token
    access_token = create_access_token(data={"sub": user.username})

    return Token(
        access_token=access_token,
        username=user.username,
        is_admin=user.is_admin,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return current_user


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    profile_update: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update own password and/or telegram_chat_id."""
    # If changing password, verify current password
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

    # Update telegram_chat_id if provided
    if profile_update.telegram_chat_id is not None:
        current_user.telegram_chat_id = profile_update.telegram_chat_id

    await session.commit()
    await session.refresh(current_user)
    return current_user


class QuotaResponse(BaseModel):
    max_vms: Optional[int]
    used_vms: int
    max_disk_gb: Optional[int]
    used_disk_gb: int
    max_ram_mb: Optional[int]
    used_ram_mb: int
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
    used_ram_mb = sum(vm.memory_mb for vm in user_vms)
    used_cpu_cores = sum(vm.cores for vm in user_vms)

    return QuotaResponse(
        max_vms=current_user.max_vms,
        used_vms=used_vms,
        max_disk_gb=current_user.max_disk_gb,
        used_disk_gb=used_disk_gb,
        max_ram_mb=current_user.max_ram_mb,
        used_ram_mb=used_ram_mb,
        max_cpu_cores=current_user.max_cpu_cores,
        used_cpu_cores=used_cpu_cores,
    )


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    """Reset password and send new password via Telegram (public endpoint)."""
    # Look up user by username
    result = await session.execute(
        select(User).where(User.username == request.username)
    )
    user = result.scalar_one_or_none()

    # Generic success response to prevent username enumeration
    if not user:
        return {"message": "Nếu tài khoản tồn tại và có liên kết Telegram, mật khẩu mới sẽ được gửi."}

    # Check if user has telegram_chat_id
    if not user.telegram_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản chưa liên kết Telegram. Vui lòng liên hệ quản trị viên.",
        )

    # Generate new random password
    new_password = generate_random_password()

    # Hash and save new password
    user.hashed_password = hash_password(new_password)
    await session.commit()

    # Send via Telegram
    telegram = TelegramNotifier()
    await telegram.send_password_reset(user.telegram_chat_id, user.username, new_password)

    return {"message": "Mật khẩu mới đã được gửi qua Telegram."}
