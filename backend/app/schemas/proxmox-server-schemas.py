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
    password: Optional[str] = None
    excluded_storages: Optional[List[str]] = None
    cloud_init_template_vmid: Optional[int] = None
    reserve_cpu_percent: Optional[float] = Field(None, ge=0, le=50)
    reserve_ram_percent: Optional[float] = Field(None, ge=0, le=50)
    reserve_disk_percent: Optional[float] = Field(None, ge=0, le=50)


class ProxmoxServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    host: Optional[str] = Field(None, min_length=1)
    port: Optional[int] = Field(None, ge=1, le=65535)
    user: Optional[str] = None
    token_name: Optional[str] = None
    token_value: Optional[str] = None
    password: Optional[str] = None
    node: Optional[str] = None
    is_active: Optional[bool] = None
    excluded_storages: Optional[List[str]] = None
    cloud_init_template_vmid: Optional[int] = None
    reserve_cpu_percent: Optional[float] = Field(None, ge=0, le=50)
    reserve_ram_percent: Optional[float] = Field(None, ge=0, le=50)
    reserve_disk_percent: Optional[float] = Field(None, ge=0, le=50)


class ProxmoxServerResponse(BaseModel):
    id: int
    name: str
    host: str
    port: int
    user: str
    token_name: str
    token_value_masked: str
    has_password: bool
    node: str
    excluded_storages: List[str]
    cloud_init_template_vmid: Optional[int] = None
    reserve_cpu_percent: Optional[float] = None
    reserve_ram_percent: Optional[float] = None
    reserve_disk_percent: Optional[float] = None
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
    # CPU
    cpu_model: str = "Unknown"
    cpu_sockets: int = 0
    cpu_cores_per_socket: int = 0
    cpu_total_cores: int = 0
    cpu_percent: float = 0
    cpu_allocated_cores: int = 0
    # RAM
    memory_total_mb: float = 0
    memory_used_mb: float = 0
    memory_allocated_mb: float = 0
    # Disk (all storages combined)
    disk_total_gb: float = 0
    disk_used_gb: float = 0
    disk_allocated_gb: float = 0


class ProxmoxStorageItem(BaseModel):
    storage: str
    type: str
    content: str
    total_gb: float
    used_gb: float
    available_gb: float
    allocated_gb: float = 0
    active: bool
