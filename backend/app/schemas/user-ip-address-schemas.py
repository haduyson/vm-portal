"""Schemas for user IP address pool operations."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserIpAddressResponse(BaseModel):
    """Response model for user IP address."""

    id: int
    ip_address: str
    subnet_mask: str
    gateway: Optional[str] = None
    network_bridge_id: int
    bridge_name: Optional[str] = None  # Joined from network_bridges
    vm_id: Optional[int] = None
    vm_name: Optional[str] = None  # Joined from virtual_machines
    is_retained: bool
    acquired_at: datetime

    class Config:
        from_attributes = True


class IpSelectionOption(BaseModel):
    """IP option for VM create form dropdown."""

    id: int
    ip_address: str
    gateway: Optional[str] = None
    subnet_mask: str


class UserIpPoolSummary(BaseModel):
    """Summary of user's IP pool."""

    total: int
    available: int  # Not assigned to any VM
    in_use: int  # Assigned to a VM
    retained: int  # Kept after VM deletion
