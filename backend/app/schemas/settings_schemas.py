from typing import Optional
from pydantic import BaseModel


class AllSettingsResponse(BaseModel):
    feature_novnc_console: str
    feature_2fa_required: str
    refresh_token_expiry_days: str
    temp_password_expiry_minutes: str
    auto_assign_ip_subdomain: str
    tailscale_auto_install_enabled: str
    tailscale_auth_key: Optional[str]
    telegram_bot_token: Optional[str]
    telegram_bot_token_masked: str
    telegram_default_chat_id: Optional[str]
    telegram_portal_url: Optional[str]
    telegram_source: str


class AllSettingsUpdate(BaseModel):
    feature_novnc_console: Optional[str] = None
    feature_2fa_required: Optional[str] = None
    refresh_token_expiry_days: Optional[str] = None
    temp_password_expiry_minutes: Optional[str] = None
    auto_assign_ip_subdomain: Optional[str] = None
    tailscale_auto_install_enabled: Optional[str] = None
    tailscale_auth_key: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_default_chat_id: Optional[str] = None
    telegram_portal_url: Optional[str] = None


class PublicFeaturesResponse(BaseModel):
    feature_novnc_console: bool
    feature_2fa_required: bool
