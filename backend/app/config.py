import secrets as _secrets
from typing import List
from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    # Database - No default, must be set via environment
    DATABASE_URL: str = "postgresql+asyncpg://vmadmin:password@db:5432/vmportal"

    # Security - SECRET_KEY must be set and strong in production
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # SEC-014: RS256 (asymmetric) preferred over HS256 (symmetric)
    # Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY to enable RS256
    ALGORITHM: str = "RS256"
    JWT_PRIVATE_KEY: str = ""  # PEM format, for signing tokens
    JWT_PUBLIC_KEY: str = ""   # PEM format, for verifying tokens

    # CORS - Allowed origins (comma-separated in env, e.g., "https://portal.example.com,http://localhost:3000")
    ALLOWED_ORIGINS: str = "https://portal.hasontech.vn"

    # Bcrypt rounds for password hashing (12-14 recommended)
    BCRYPT_ROUNDS: int = 12

    # Default Admin
    DEFAULT_ADMIN_USERNAME: str = "Admin"
    DEFAULT_ADMIN_PASSWORD: str = "Admin@123"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Validate SECRET_KEY is not default in production."""
        if v == "change-me-in-production":
            import os
            if os.getenv("ENVIRONMENT", "development") == "production":
                raise ValueError(
                    "SECRET_KEY must be changed in production! "
                    "Generate with: python -c 'import secrets; print(secrets.token_urlsafe(64))'"
                )
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return v

    def get_allowed_origins(self) -> List[str]:
        """Parse ALLOWED_ORIGINS into list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    # Proxmox
    PROXMOX_HOST: str = "localhost"
    PROXMOX_PORT: int = 8006
    PROXMOX_USER: str = "root@pam"
    PROXMOX_TOKEN_NAME: str = "automation"
    PROXMOX_TOKEN_VALUE: str = ""
    PROXMOX_PASSWORD: str = ""
    PROXMOX_NODE: str = "pve"
    PROXMOX_VERIFY_SSL: bool = False
    PROXMOX_ISO_STORAGE: str = "local"
    PROXMOX_ISO_IMAGE: str = "ubuntu-24.04-live-server-amd64.iso"
    PROXMOX_VM_STORAGE: str = "local-lvm"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_DEFAULT_CHAT_ID: str = ""

    # Portal
    PORTAL_URL: str = "http://localhost"

    # Cloudflare Tunnel
    CF_TUNNEL_DOMAIN: str = "example.com"
    CF_API_TOKEN: str = ""
    CF_ZONE_ID: str = ""
    CF_TUNNEL_ID: str = ""
    CF_TUNNEL_NAME: str = "vpscloud"
    CF_BASE_DOMAIN: str = "hasonmedia.com"
    CF_CLOUDFLARED_CONFIG_PATH: str = "/etc/cloudflared/config.yml"

    class Config:
        env_file = ".env"


settings = Settings()
