from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class ProxmoxServerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    host: str = Field(..., min_length=1)
    port: int = Field(default=8006, ge=1, le=65535)
    user: str = Field(default="root@pam")
    token_name: str = Field(..., min_length=1)
    token_value: str = Field(..., min_length=1)
    excluded_storages: Optional[List[str]] = None


class ProxmoxServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    host: Optional[str] = Field(None, min_length=1)
    port: Optional[int] = Field(None, ge=1, le=65535)
    user: Optional[str] = None
    token_name: Optional[str] = None
    token_value: Optional[str] = None
    node: Optional[str] = None
    is_active: Optional[bool] = None
    excluded_storages: Optional[List[str]] = None


class ProxmoxServerResponse(BaseModel):
    id: int
    name: str
    host: str
    port: int
    user: str
    token_name: str
    token_value_masked: str
    node: str
    excluded_storages: List[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProxmoxServerListItem(BaseModel):
    id: int
    name: str
    host: str
    node: str
    is_active: bool

    class Config:
        from_attributes = True


class ProxmoxServerResourceResponse(BaseModel):
    id: int
    name: str
    cpu_percent: float
    memory_used_mb: float
    memory_total_mb: float
    disk_used_gb: float
    disk_total_gb: float


class ProxmoxStorageItem(BaseModel):
    storage: str
    type: str
    content: str
    total_gb: float
    used_gb: float
    available_gb: float
    allocated_gb: float = 0
    active: bool
