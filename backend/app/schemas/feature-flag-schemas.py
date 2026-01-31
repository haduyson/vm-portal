"""Schemas for hierarchical feature flag management."""
from typing import Optional
from pydantic import BaseModel


class FeatureFlagsUpdate(BaseModel):
    """Update feature flags at any level (global, user, VM)."""

    cloudflare_tunnel_enabled: Optional[bool] = None
    public_ip_enabled: Optional[bool] = None
    email_notifications_enabled: Optional[bool] = None
    telegram_notifications_enabled: Optional[bool] = None


class FeatureFlagsResponse(BaseModel):
    """Response with resolved flags and their sources."""

    flags: dict  # Feature -> bool
    sources: dict  # Feature -> "default" | "global" | "user" | "vm"


class GlobalFlagsResponse(BaseModel):
    """Global feature flags response."""

    flags: dict  # All features with their global values
