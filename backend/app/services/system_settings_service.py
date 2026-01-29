from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.system_settings_model import SystemSetting
from app.config import settings


async def get_setting(session: AsyncSession, key: str) -> Optional[str]:
    """Get a system setting value by key from database."""
    result = await session.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def set_setting(session: AsyncSession, key: str, value: Optional[str]) -> None:
    """Set or update a system setting in database."""
    result = await session.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = value
    else:
        setting = SystemSetting(key=key, value=value)
        session.add(setting)

    await session.commit()


async def get_telegram_config(session: AsyncSession) -> dict:
    """
    Get Telegram configuration from database, with fallback to environment variables.
    Returns dict with bot_token, default_chat_id, portal_url and source indicator.
    """
    db_bot_token = await get_setting(session, "telegram_bot_token")
    db_default_chat_id = await get_setting(session, "telegram_default_chat_id")
    db_portal_url = await get_setting(session, "telegram_portal_url")

    # Use DB values if available, otherwise fallback to env vars
    bot_token = db_bot_token if db_bot_token else settings.TELEGRAM_BOT_TOKEN
    default_chat_id = db_default_chat_id if db_default_chat_id else settings.TELEGRAM_DEFAULT_CHAT_ID
    portal_url = db_portal_url if db_portal_url else settings.PORTAL_URL

    # Determine source (database takes priority)
    source = "database" if (db_bot_token or db_default_chat_id) else "environment"

    return {
        "bot_token": bot_token,
        "default_chat_id": default_chat_id,
        "portal_url": portal_url,
        "source": source
    }


async def get_proxmox_config(session: AsyncSession) -> dict:
    """
    Get Proxmox configuration from database, with fallback to environment variables.
    Returns dict with host, token_name, token_value, node, and source indicator.
    """
    db_host = await get_setting(session, "proxmox_host")
    db_token_name = await get_setting(session, "proxmox_token_name")
    db_token_value = await get_setting(session, "proxmox_token_value")
    db_node = await get_setting(session, "proxmox_node")

    host = db_host if db_host else settings.PROXMOX_HOST
    token_name = db_token_name if db_token_name else settings.PROXMOX_TOKEN_NAME
    token_value = db_token_value if db_token_value else settings.PROXMOX_TOKEN_VALUE
    node = db_node if db_node else settings.PROXMOX_NODE

    source = "database" if (db_host or db_token_value) else "environment"

    return {
        "host": host,
        "token_name": token_name,
        "token_value": token_value,
        "node": node,
        "source": source,
    }
