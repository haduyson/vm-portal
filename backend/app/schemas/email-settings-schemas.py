"""Schemas for email notification settings."""
from typing import Optional
from pydantic import BaseModel, EmailStr


class EmailSettingsResponse(BaseModel):
    """Email configuration response (masks sensitive fields)."""

    provider: str  # smtp | sendgrid | resend
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password_masked: str = ""  # Only shows **** if set
    smtp_use_tls: bool = True
    api_key_masked: str = ""  # Only shows last 4 chars
    from_email: str = "noreply@example.com"
    from_name: str = "VM Portal"
    is_configured: bool = False


class EmailSettingsUpdate(BaseModel):
    """Email configuration update request."""

    provider: Optional[str] = None  # smtp | sendgrid | resend
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None  # Full password for update
    smtp_use_tls: Optional[bool] = None
    api_key: Optional[str] = None  # Full API key for update
    from_email: Optional[str] = None
    from_name: Optional[str] = None


class EmailTestRequest(BaseModel):
    """Test email request."""

    to_email: EmailStr
