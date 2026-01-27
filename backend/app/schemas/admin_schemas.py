from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator
import re

from app.schemas.vm_schemas import VMResponse


class AdminUserCreate(BaseModel):
    username: str
    password: str
    telegram_chat_id: Optional[str] = None
    is_admin: bool = False

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Mật khẩu phải có ít nhất 8 ký tự')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 ký tự in hoa')
        if not re.search(r'[a-z]', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 ký tự thường')
        if not re.search(r'\d', v):
            raise ValueError('Mật khẩu phải có ít nhất 1 chữ số')
        return v


class AdminUserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    telegram_chat_id: Optional[str]
    created_at: datetime
    vm_count: int

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    is_admin: Optional[bool] = None
    telegram_chat_id: Optional[str] = None


class AdminVMResponse(VMResponse):
    username: str


class AdminStatsResponse(BaseModel):
    total_users: int
    total_vms: int
    running_vms: int
    creating_vms: int
