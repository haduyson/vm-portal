from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://vmadmin:password@db:5432/vmportal"

    # Security
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ALGORITHM: str = "HS256"

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
