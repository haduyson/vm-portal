from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.database import get_session
from app.models.user_model import User
from app.schemas.user_schemas import UserCreate, UserLogin, UserResponse, Token, ProfileUpdate

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    session: AsyncSession = Depends(get_session),
):
    """Register a new user."""
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
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return new_user


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
