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
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool


class ProfileUpdate(BaseModel):
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    telegram_chat_id: Optional[str] = None

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
