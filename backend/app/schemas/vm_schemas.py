import re
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class VMCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def validate_dns_name(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9\-]*$', v):
            raise ValueError(
                "Tên VM chỉ được chứa chữ cái, số và dấu gạch ngang, bắt đầu bằng chữ cái (VD: my-vm-01)"
            )
        return v
    cores: int = Field(..., ge=1, le=16)
    memory_mb: int = Field(..., ge=512, le=32768)
    disk_gb: int = Field(..., ge=10, le=500)
    os_type: str = "ubuntu-24.04"
    server_id: Optional[int] = None
    storage: Optional[str] = None
    ssh_subdomain: Optional[str] = None
    domain_id: Optional[int] = None


class VMResponse(BaseModel):
    id: int
    user_id: int
    proxmox_server_id: Optional[int] = None
    vmid: int
    name: str
    cores: int
    memory_mb: int
    disk_gb: int
    os_type: str
    status: str
    ip_address: Optional[str]
    ssh_domain: Optional[str]
    web_domain: Optional[str]
    ssh_username: Optional[str]
    ssh_password: Optional[str]
    proxmox_node: str
    storage: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VMListResponse(BaseModel):
    total: int
    vms: List[VMResponse]


class VMResourceResponse(BaseModel):
    cpu_percent: float
    memory_used_mb: float
    memory_total_mb: float
    disk_used_gb: float
    disk_total_gb: float


class VMResize(BaseModel):
    cores: Optional[int] = Field(None, ge=1, le=16)
    memory_mb: Optional[int] = Field(None, ge=512, le=65536)
    disk_gb: Optional[int] = Field(None, ge=10, le=1000)


class VMCloneRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class VMMetricsDataPoint(BaseModel):
    time: float
    cpu: Optional[float] = None
    mem: Optional[float] = None
    maxmem: Optional[float] = None
    netin: Optional[float] = None
    netout: Optional[float] = None
    disk: Optional[float] = None
    maxdisk: Optional[float] = None


class VMMetricsResponse(BaseModel):
    timeframe: str
    data: List[VMMetricsDataPoint]


class VMConsoleResponse(BaseModel):
    ticket: str
    port: int
    node: str
    vmid: int


class VMResetPassword(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)
