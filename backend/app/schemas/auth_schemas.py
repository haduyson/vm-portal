from pydantic import BaseModel
from typing import Optional


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool


class LoginPartialResponse(BaseModel):
    requires_2fa: bool = True
    partial_token: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class Login2FARequest(BaseModel):
    partial_token: str
    totp_code: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    qr_code_base64: str


class TwoFactorEnableRequest(BaseModel):
    secret: str
    totp_code: str


class TwoFactorDisableRequest(BaseModel):
    totp_code: str
