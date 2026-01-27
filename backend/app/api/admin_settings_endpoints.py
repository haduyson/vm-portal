from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.schemas.admin_schemas import TelegramSettingsResponse, TelegramSettingsUpdate
from app.schemas.settings_schemas import (
    AllSettingsResponse,
    AllSettingsUpdate,
    PublicFeaturesResponse,
)
from app.services.system_settings_service import get_telegram_config, get_setting, set_setting
from app.services.telegram_notifier import TelegramNotifier
from app.api.admin_shared_helpers import log_audit

router = APIRouter(prefix="/admin", tags=["admin-settings"])

# Default setting values
SETTING_DEFAULTS = {
    "feature_novnc_console": "false",
    "feature_2fa_required": "false",
    "refresh_token_expiry_days": "7",
}


async def _get_setting_with_default(session, key: str) -> str:
    val = await get_setting(session, key)
    return val if val is not None else SETTING_DEFAULTS.get(key, "")


@router.get("/settings", response_model=AllSettingsResponse)
async def get_all_settings(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get all system settings (admin only)."""
    telegram_config = await get_telegram_config(session)

    bot_token = telegram_config["bot_token"]
    if bot_token and len(bot_token) > 4:
        masked_token = "*" * (len(bot_token) - 4) + bot_token[-4:]
    else:
        masked_token = "****" if bot_token else ""

    return AllSettingsResponse(
        feature_novnc_console=await _get_setting_with_default(session, "feature_novnc_console"),
        feature_2fa_required=await _get_setting_with_default(session, "feature_2fa_required"),
        refresh_token_expiry_days=await _get_setting_with_default(session, "refresh_token_expiry_days"),
        telegram_bot_token=bot_token,
        telegram_bot_token_masked=masked_token,
        telegram_default_chat_id=telegram_config["default_chat_id"],
        telegram_source=telegram_config["source"],
    )


@router.put("/settings", response_model=AllSettingsResponse)
async def update_all_settings(
    settings_update: AllSettingsUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Batch update system settings (admin only)."""
    changes = []

    if settings_update.feature_novnc_console is not None:
        await set_setting(session, "feature_novnc_console", settings_update.feature_novnc_console)
        changes.append(f"feature_novnc_console={settings_update.feature_novnc_console}")

    if settings_update.feature_2fa_required is not None:
        await set_setting(session, "feature_2fa_required", settings_update.feature_2fa_required)
        changes.append(f"feature_2fa_required={settings_update.feature_2fa_required}")

    if settings_update.refresh_token_expiry_days is not None:
        await set_setting(session, "refresh_token_expiry_days", settings_update.refresh_token_expiry_days)
        changes.append(f"refresh_token_expiry_days={settings_update.refresh_token_expiry_days}")

    if settings_update.telegram_bot_token is not None:
        await set_setting(session, "telegram_bot_token", settings_update.telegram_bot_token)
        changes.append("Updated telegram bot token")

    if settings_update.telegram_default_chat_id is not None:
        await set_setting(session, "telegram_default_chat_id", settings_update.telegram_default_chat_id)
        changes.append(f"telegram_default_chat_id={settings_update.telegram_default_chat_id}")

    if changes:
        await log_audit(session, admin.id, "update_settings", "system", None, ", ".join(changes))

    # Return updated settings
    return await get_all_settings(_admin=admin, session=session)


# --- Legacy Telegram-specific endpoints (kept for backward compat) ---

@router.get("/settings/telegram", response_model=TelegramSettingsResponse)
async def get_telegram_settings(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get current Telegram bot configuration (admin only)."""
    config = await get_telegram_config(session)
    bot_token = config["bot_token"]
    if bot_token and len(bot_token) > 4:
        masked_token = "*" * (len(bot_token) - 4) + bot_token[-4:]
    else:
        masked_token = "****" if bot_token else ""

    return TelegramSettingsResponse(
        bot_token_masked=masked_token, bot_token=bot_token,
        default_chat_id=config["default_chat_id"], source=config["source"],
    )


@router.put("/settings/telegram", response_model=TelegramSettingsResponse)
async def update_telegram_settings(
    settings_update: TelegramSettingsUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update Telegram bot configuration (admin only)."""
    if settings_update.bot_token is not None:
        await set_setting(session, "telegram_bot_token", settings_update.bot_token)
    if settings_update.default_chat_id is not None:
        await set_setting(session, "telegram_default_chat_id", settings_update.default_chat_id)

    details = []
    if settings_update.bot_token is not None:
        details.append("Updated bot token")
    if settings_update.default_chat_id is not None:
        details.append(f"Updated default chat ID to {settings_update.default_chat_id}")

    await log_audit(session, admin.id, "update_telegram_settings", "system", None, ", ".join(details))

    config = await get_telegram_config(session)
    bot_token = config["bot_token"]
    if bot_token and len(bot_token) > 4:
        masked_token = "*" * (len(bot_token) - 4) + bot_token[-4:]
    else:
        masked_token = "****" if bot_token else ""

    return TelegramSettingsResponse(
        bot_token_masked=masked_token, bot_token=bot_token,
        default_chat_id=config["default_chat_id"], source=config["source"],
    )


@router.post("/settings/telegram/test", status_code=status.HTTP_200_OK)
async def test_telegram_settings(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Send a test message to verify Telegram configuration (admin only)."""
    config = await get_telegram_config(session)

    if not config["bot_token"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bot token chưa được cấu hình")
    if not config["default_chat_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chat ID mặc định chưa được cấu hình")

    telegram = TelegramNotifier(bot_token=config["bot_token"], default_chat_id=config["default_chat_id"])
    test_message = "🔔 *Thông báo kiểm tra*\n\nCấu hình Telegram Bot đã hoạt động thành công!"
    success = await telegram.send_message(config["default_chat_id"], test_message)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể gửi tin nhắn. Vui lòng kiểm tra lại bot token và chat ID",
        )

    return {"message": "Tin nhắn thử đã được gửi thành công"}
