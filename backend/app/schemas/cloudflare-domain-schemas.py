from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CloudflareDomainCreate(BaseModel):
    domain: str = Field(..., min_length=3, max_length=100)
    cf_api_token: str = Field(..., min_length=1)
    cf_zone_id: str = Field(..., min_length=1)
    cf_tunnel_id: str = Field(..., min_length=1)
    cf_tunnel_name: str = Field(default="vpscloud")
    cloudflared_config_path: str = Field(default="/etc/cloudflared/config.yml")
    setup_notes: Optional[str] = None


class CloudflareDomainUpdate(BaseModel):
    domain: Optional[str] = Field(None, min_length=3, max_length=100)
    cf_api_token: Optional[str] = None
    cf_zone_id: Optional[str] = None
    cf_tunnel_id: Optional[str] = None
    cf_tunnel_name: Optional[str] = None
    cloudflared_config_path: Optional[str] = None
    setup_notes: Optional[str] = None
    is_active: Optional[bool] = None


class CloudflareDomainResponse(BaseModel):
    id: int
    domain: str
    cf_zone_id: str
    cf_tunnel_id: str
    cf_tunnel_name: str
    cloudflared_config_path: str
    setup_notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CloudflareDomainPublicResponse(BaseModel):
    """Public-facing domain info (no secrets)."""
    id: int
    domain: str
    is_active: bool

    class Config:
        from_attributes = True
