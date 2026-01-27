import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_session
from app.models.user_model import User
from app.models.refresh_token_model import RefreshToken

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token scheme
security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a plain password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_partial_token(username: str) -> str:
    """Create a short-lived partial JWT for 2FA flow (5 min)."""
    expire = datetime.utcnow() + timedelta(minutes=5)
    data = {"sub": username, "type": "partial_2fa", "exp": expire}
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_partial_token(token: str) -> Optional[str]:
    """Verify partial 2FA token. Returns username or None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "partial_2fa":
            return None
        return payload.get("sub")
    except JWTError:
        return None


async def create_refresh_token(session: AsyncSession, user_id: int, expiry_days: int = 7) -> str:
    """Create a refresh token stored in DB."""
    token = secrets.token_urlsafe(64)
    expires_at = datetime.utcnow() + timedelta(days=expiry_days)

    refresh_token = RefreshToken(
        user_id=user_id,
        token=token,
        expires_at=expires_at,
    )
    session.add(refresh_token)
    await session.commit()
    return token


async def verify_refresh_token(session: AsyncSession, token: str) -> Optional[RefreshToken]:
    """Verify refresh token. Returns RefreshToken or None."""
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token == token,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.utcnow(),
        )
    )
    return result.scalar_one_or_none()


async def revoke_refresh_tokens(session: AsyncSession, user_id: int) -> None:
    """Revoke all refresh tokens for a user."""
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)
        .values(revoked=True)
    )
    await session.commit()


async def revoke_single_refresh_token(session: AsyncSession, token: str) -> None:
    """Revoke a single refresh token."""
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.token == token)
        .values(revoked=True)
    )
    await session.commit()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Get the current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác thực thông tin đăng nhập",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if username is None or token_type == "partial_2fa":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Get user from database
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require authenticated user with admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền quản trị",
        )
    return current_user
