from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
import re


class UserCreate(BaseModel):
    username: str
    password: str
    telegram_chat_id: Optional[str] = None

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength: min 8 chars, uppercase, lowercase, digit."""
        if len(v) < 8:
            raise ValueError('Mật khẩu phải có ít nhất 8 ký tự')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 ký tự in hoa')
        if not re.search(r'[a-z]', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 ký tự thường')
        if not re.search(r'\d', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 chữ số')
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    telegram_chat_id: Optional[str]
    email: Optional[str] = None
    notification_preference: str = "telegram"  # telegram | email | both
    is_admin: bool
    has_2fa: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_user(cls, user):
        return cls(
            id=user.id,
            username=user.username,
            telegram_chat_id=user.telegram_chat_id,
            email=getattr(user, "email", None),
            notification_preference=getattr(user, "notification_preference", None) or "telegram",
            is_admin=user.is_admin,
            has_2fa=bool(user.totp_secret),
            created_at=user.created_at,
        )


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool


class ProfileUpdate(BaseModel):
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    email: Optional[str] = None
    notification_preference: Optional[str] = None  # telegram | email | both

    @field_validator('notification_preference')
    @classmethod
    def validate_notification_preference(cls, v: Optional[str]) -> Optional[str]:
        """Validate notification preference."""
        if v is not None and v not in ("telegram", "email", "both"):
            raise ValueError('Notification preference must be telegram, email, or both')
        return v

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v: Optional[str]) -> Optional[str]:
        """Validate new password if provided."""
        if v is None:
            return v
        if len(v) < 8:
            raise ValueError('Mật khẩu phải có ít nhất 8 ký tự')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 ký tự in hoa')
        if not re.search(r'[a-z]', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 ký tự thường')
        if not re.search(r'\d', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 chữ số')
        return v


class ForgotPasswordRequest(BaseModel):
    username: str
