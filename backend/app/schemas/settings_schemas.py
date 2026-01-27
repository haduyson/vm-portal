from typing import Optional
from pydantic import BaseModel


class AllSettingsResponse(BaseModel):
    feature_novnc_console: str
    feature_2fa_required: str
    refresh_token_expiry_days: str
    telegram_bot_token: Optional[str]
    telegram_bot_token_masked: str
    telegram_default_chat_id: Optional[str]
    telegram_source: str
    proxmox_host: Optional[str]
    proxmox_token_value_masked: str
    proxmox_source: str


class AllSettingsUpdate(BaseModel):
    feature_novnc_console: Optional[str] = None
    feature_2fa_required: Optional[str] = None
    refresh_token_expiry_days: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_default_chat_id: Optional[str] = None
    proxmox_host: Optional[str] = None
    proxmox_token_value: Optional[str] = None


class PublicFeaturesResponse(BaseModel):
    feature_novnc_console: bool
    feature_2fa_required: bool
