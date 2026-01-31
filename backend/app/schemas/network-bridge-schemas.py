"""Pydantic schemas for network bridge operations."""
from datetime import datetime
from pydantic import BaseModel, Field


class NetworkBridgeBase(BaseModel):
    """Base schema for network bridge."""
    bridge_name: str
    display_name: str | None = None
    vlan_min: int | None = Field(None, ge=1, le=4094)
    vlan_max: int | None = Field(None, ge=1, le=4094)
    is_public_network: bool = False
    is_enabled: bool = True


class NetworkBridgeResponse(NetworkBridgeBase):
    """Response schema for network bridge."""
    id: int
    proxmox_server_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class NetworkBridgeUpdate(BaseModel):
    """Update schema for network bridge settings."""
    display_name: str | None = None
    vlan_min: int | None = Field(None, ge=1, le=4094)
    vlan_max: int | None = Field(None, ge=1, le=4094)
    is_public_network: bool | None = None
    is_enabled: bool | None = None


class ProxmoxBridgeDiscovery(BaseModel):
    """Bridge info discovered from Proxmox API."""
    iface: str
    address: str | None = None
    netmask: str | None = None
    gateway: str | None = None
    bridge_ports: str | None = None
    bridge_vlan_aware: bool = False
    autostart: int = 0
    active: int = 0


class BridgeSyncResult(BaseModel):
    """Result of bridge sync operation."""
    added: int
    updated: int
    total: int
