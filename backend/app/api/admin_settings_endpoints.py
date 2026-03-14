import importlib
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
from app.core.credential_encryption import encrypt_credential

_email_schemas = importlib.import_module("app.schemas.email-settings-schemas")
EmailSettingsResponse = _email_schemas.EmailSettingsResponse
EmailSettingsUpdate = _email_schemas.EmailSettingsUpdate
EmailTestRequest = _email_schemas.EmailTestRequest

router = APIRouter(prefix="/admin", tags=["admin-settings"])

# Default setting values
SETTING_DEFAULTS = {
    "feature_novnc_console": "false",
    "feature_2fa_required": "false",
    "refresh_token_expiry_days": "7",
    "temp_password_expiry_minutes": "60",
    "auto_assign_ip_subdomain": "false",
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

    portal_url = await get_setting(session, "telegram_portal_url") or ""

    tailscale_enabled = await get_setting(session, "tailscale_auto_install_enabled") or "false"
    tailscale_key = await get_setting(session, "tailscale_auth_key") or ""
    tailscale_api_token = await get_setting(session, "tailscale_api_token") or ""
    tailscale_tailnet = await get_setting(session, "tailscale_tailnet") or ""

    # Mask API token
    if tailscale_api_token and len(tailscale_api_token) > 4:
        tailscale_api_token_masked = "*" * (len(tailscale_api_token) - 4) + tailscale_api_token[-4:]
    else:
        tailscale_api_token_masked = "****" if tailscale_api_token else ""

    return AllSettingsResponse(
        feature_novnc_console=await _get_setting_with_default(session, "feature_novnc_console"),
        feature_2fa_required=await _get_setting_with_default(session, "feature_2fa_required"),
        refresh_token_expiry_days=await _get_setting_with_default(session, "refresh_token_expiry_days"),
        temp_password_expiry_minutes=await _get_setting_with_default(session, "temp_password_expiry_minutes"),
        auto_assign_ip_subdomain=await _get_setting_with_default(session, "auto_assign_ip_subdomain"),
        tailscale_auto_install_enabled=tailscale_enabled,
        tailscale_auth_key=tailscale_key,
        tailscale_api_token_masked=tailscale_api_token_masked,
        tailscale_tailnet=tailscale_tailnet,
        telegram_bot_token=bot_token,
        telegram_bot_token_masked=masked_token,
        telegram_default_chat_id=telegram_config["default_chat_id"],
        telegram_portal_url=portal_url,
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

    if settings_update.temp_password_expiry_minutes is not None:
        await set_setting(session, "temp_password_expiry_minutes", settings_update.temp_password_expiry_minutes)
        changes.append(f"temp_password_expiry_minutes={settings_update.temp_password_expiry_minutes}")

    if settings_update.auto_assign_ip_subdomain is not None:
        await set_setting(session, "auto_assign_ip_subdomain", settings_update.auto_assign_ip_subdomain)
        changes.append(f"auto_assign_ip_subdomain={settings_update.auto_assign_ip_subdomain}")

    if settings_update.tailscale_auto_install_enabled is not None:
        await set_setting(session, "tailscale_auto_install_enabled", settings_update.tailscale_auto_install_enabled)
        changes.append(f"tailscale_auto_install_enabled={settings_update.tailscale_auto_install_enabled}")

    if settings_update.tailscale_auth_key is not None:
        # Encrypt sensitive auth key before storing
        encrypted_auth_key = encrypt_credential(settings_update.tailscale_auth_key)
        await set_setting(session, "tailscale_auth_key", encrypted_auth_key)
        changes.append("Updated tailscale_auth_key")

    if settings_update.tailscale_api_token is not None:
        # Encrypt sensitive API token before storing
        encrypted_api_token = encrypt_credential(settings_update.tailscale_api_token)
        await set_setting(session, "tailscale_api_token", encrypted_api_token)
        changes.append("Updated tailscale_api_token")

    if settings_update.tailscale_tailnet is not None:
        await set_setting(session, "tailscale_tailnet", settings_update.tailscale_tailnet)
        changes.append(f"tailscale_tailnet={settings_update.tailscale_tailnet}")

    if settings_update.telegram_bot_token is not None:
        await set_setting(session, "telegram_bot_token", settings_update.telegram_bot_token)
        changes.append("Updated telegram bot token")

    if settings_update.telegram_default_chat_id is not None:
        await set_setting(session, "telegram_default_chat_id", settings_update.telegram_default_chat_id)
        changes.append(f"telegram_default_chat_id={settings_update.telegram_default_chat_id}")

    if settings_update.telegram_portal_url is not None:
        await set_setting(session, "telegram_portal_url", settings_update.telegram_portal_url)
        changes.append(f"telegram_portal_url={settings_update.telegram_portal_url}")

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

    telegram = TelegramNotifier(bot_token=config["bot_token"], default_chat_id=config["default_chat_id"], portal_url=config["portal_url"])
    test_message = f"🔔 *Thông báo kiểm tra*\n\nCấu hình Telegram Bot đã hoạt động thành công!\n🔗 Portal: {config['portal_url'] or 'Chưa cấu hình'}"
    success = await telegram.send_message(config["default_chat_id"], test_message)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể gửi tin nhắn. Vui lòng kiểm tra lại bot token và chat ID",
        )

    return {"message": "Tin nhắn thử đã được gửi thành công"}


# --- Email Settings Endpoints ---

def _mask_password(password: str | None) -> str:
    """Mask password showing only that it's set."""
    if not password:
        return ""
    return "********"


def _mask_api_key(api_key: str | None) -> str:
    """Mask API key showing last 4 characters."""
    if not api_key:
        return ""
    if len(api_key) <= 4:
        return "****"
    return "*" * (len(api_key) - 4) + api_key[-4:]


@router.get("/settings/email", response_model=EmailSettingsResponse)
async def get_email_settings(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get email configuration (admin only). Masks sensitive fields."""
    provider = await get_setting(session, "email_provider") or "smtp"
    smtp_host = await get_setting(session, "email_smtp_host")
    smtp_port_str = await get_setting(session, "email_smtp_port")
    smtp_user = await get_setting(session, "email_smtp_user")
    smtp_password = await get_setting(session, "email_smtp_password")
    smtp_use_tls_str = await get_setting(session, "email_smtp_use_tls")
    api_key = await get_setting(session, "email_api_key")
    from_email = await get_setting(session, "email_from_address") or "noreply@example.com"
    from_name = await get_setting(session, "email_from_name") or "VM Portal"

    # Check if configured
    is_configured = False
    if provider == "smtp":
        is_configured = bool(smtp_host and smtp_user)
    else:
        is_configured = bool(api_key)

    return EmailSettingsResponse(
        provider=provider,
        smtp_host=smtp_host,
        smtp_port=int(smtp_port_str) if smtp_port_str else 587,
        smtp_user=smtp_user,
        smtp_password_masked=_mask_password(smtp_password),
        smtp_use_tls=smtp_use_tls_str != "false" if smtp_use_tls_str else True,
        api_key_masked=_mask_api_key(api_key),
        from_email=from_email,
        from_name=from_name,
        is_configured=is_configured,
    )


@router.put("/settings/email", response_model=EmailSettingsResponse)
async def update_email_settings(
    settings_update: EmailSettingsUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update email configuration (admin only)."""
    changes = []

    if settings_update.provider is not None:
        if settings_update.provider not in ("smtp", "sendgrid", "resend"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provider phải là smtp, sendgrid, hoặc resend",
            )
        await set_setting(session, "email_provider", settings_update.provider)
        changes.append(f"provider={settings_update.provider}")

    if settings_update.smtp_host is not None:
        await set_setting(session, "email_smtp_host", settings_update.smtp_host)
        changes.append(f"smtp_host={settings_update.smtp_host}")

    if settings_update.smtp_port is not None:
        await set_setting(session, "email_smtp_port", str(settings_update.smtp_port))
        changes.append(f"smtp_port={settings_update.smtp_port}")

    if settings_update.smtp_user is not None:
        await set_setting(session, "email_smtp_user", settings_update.smtp_user)
        changes.append(f"smtp_user={settings_update.smtp_user}")

    if settings_update.smtp_password is not None:
        await set_setting(session, "email_smtp_password", settings_update.smtp_password)
        changes.append("Updated smtp_password")

    if settings_update.smtp_use_tls is not None:
        await set_setting(session, "email_smtp_use_tls", "true" if settings_update.smtp_use_tls else "false")
        changes.append(f"smtp_use_tls={settings_update.smtp_use_tls}")

    if settings_update.api_key is not None:
        await set_setting(session, "email_api_key", settings_update.api_key)
        changes.append("Updated api_key")

    if settings_update.from_email is not None:
        await set_setting(session, "email_from_address", settings_update.from_email)
        changes.append(f"from_email={settings_update.from_email}")

    if settings_update.from_name is not None:
        await set_setting(session, "email_from_name", settings_update.from_name)
        changes.append(f"from_name={settings_update.from_name}")

    if changes:
        await log_audit(session, admin.id, "update_email_settings", "system", None, ", ".join(changes))

    return await get_email_settings(_admin=admin, session=session)


@router.post("/settings/email/test", status_code=status.HTTP_200_OK)
async def send_test_email(
    request: EmailTestRequest,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Send a test email to verify configuration (admin only)."""
    _notif_service = importlib.import_module("app.services.unified-notification-service")
    NotificationService = _notif_service.NotificationService

    notifier = await NotificationService.from_db_config(session)

    if not notifier.email.is_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email chưa được cấu hình. Vui lòng cấu hình SMTP hoặc API key trước.",
        )

    success = await notifier.send_test_email(request.to_email)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể gửi email. Vui lòng kiểm tra lại cấu hình.",
        )

    return {"message": f"Email thử đã được gửi đến {request.to_email}"}
