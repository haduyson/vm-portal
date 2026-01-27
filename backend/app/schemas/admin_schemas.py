from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.vm_schemas import VMResponse


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
