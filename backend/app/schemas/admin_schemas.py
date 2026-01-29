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
    max_disk_gb: Optional[int] = None
    max_ram_gb: Optional[int] = None
    max_vms: Optional[int] = None
    max_cpu_cores: Optional[int] = None

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
    is_suspended: bool
    telegram_chat_id: Optional[str]
    created_at: datetime
    vm_count: int
    max_disk_gb: Optional[int]
    max_ram_gb: Optional[int]
    max_vms: Optional[int]
    max_cpu_cores: Optional[int]

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    username: Optional[str] = None
    is_admin: Optional[bool] = None
    is_suspended: Optional[bool] = None
    telegram_chat_id: Optional[str] = None
    max_disk_gb: Optional[int] = None
    max_ram_gb: Optional[int] = None
    max_vms: Optional[int] = None
    max_cpu_cores: Optional[int] = None


class AdminVMResponse(VMResponse):
    username: str


class AdminStatsResponse(BaseModel):
    total_users: int
    total_vms: int
    running_vms: int
    creating_vms: int


class AdminPasswordResetResponse(BaseModel):
    new_password: str
    telegram_sent: bool


class TelegramSettingsResponse(BaseModel):
    bot_token_masked: str
    bot_token: Optional[str] = None
    default_chat_id: Optional[str]
    source: str  # "database" or "environment"


class TelegramSettingsUpdate(BaseModel):
    bot_token: Optional[str] = None
    default_chat_id: Optional[str] = None


class UserResourceUsageResponse(BaseModel):
    vms_used: int
    vms_max: Optional[int]
    disk_used_gb: float
    disk_max_gb: Optional[int]
    ram_used_gb: float
    ram_max_gb: Optional[int]
    cpu_used_cores: int
    cpu_max_cores: Optional[int]
