from typing import List, Optional
from pydantic import BaseModel, Field


class NetworkInterfaceAddress(BaseModel):
    ip_address: str
    ip_address_type: str  # "ipv4" or "ipv6"
    prefix: Optional[int] = None


class NetworkInterfaceResponse(BaseModel):
    name: str
    hardware_address: Optional[str] = None
    ip_addresses: List[NetworkInterfaceAddress] = []


class FirewallRuleResponse(BaseModel):
    pos: int
    type: str  # "in" or "out"
    action: str  # "ACCEPT", "DROP", "REJECT"
    enabled: Optional[int] = 1
    comment: Optional[str] = None
    source: Optional[str] = None
    dest: Optional[str] = None
    sport: Optional[str] = None
    dport: Optional[str] = None
    proto: Optional[str] = None
    macro: Optional[str] = None


class FirewallRuleCreate(BaseModel):
    type: str = Field(..., pattern="^(in|out)$")
    action: str = Field(..., pattern="^(ACCEPT|DROP|REJECT)$")
    enabled: int = 1
    comment: Optional[str] = None
    source: Optional[str] = None
    dest: Optional[str] = None
    sport: Optional[str] = None
    dport: Optional[str] = None
    proto: Optional[str] = None
    macro: Optional[str] = None


class FirewallOptionsResponse(BaseModel):
    enable: Optional[bool] = False
    dhcp: Optional[bool] = False
    log_level_in: Optional[str] = "nolog"
    log_level_out: Optional[str] = "nolog"
    policy_in: Optional[str] = "DROP"
    policy_out: Optional[str] = "ACCEPT"


class FirewallOptionsUpdate(BaseModel):
    enable: Optional[bool] = None
    dhcp: Optional[bool] = None
    log_level_in: Optional[str] = None
    log_level_out: Optional[str] = None
    policy_in: Optional[str] = None
    policy_out: Optional[str] = None
