"""Unified notification service respecting user preferences (Telegram + Email)."""
import importlib
from typing import Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.telegram_notifier import TelegramNotifier


class NotificationService:
    """Unified notification service that sends via Telegram and/or Email based on user preference."""

    def __init__(
        self,
        telegram: TelegramNotifier,
        email,  # EmailService
        portal_url: str = "",
        global_flags: Optional[Dict] = None,
    ):
        self.telegram = telegram
        self.email = email
        self.portal_url = portal_url or telegram.portal_url
        self.global_flags = global_flags or {}

    @classmethod
    async def from_db_config(cls, session: AsyncSession) -> "NotificationService":
        """Create NotificationService from database settings."""
        _email_mod = importlib.import_module("app.services.email-notification-service")
        EmailService = _email_mod.EmailService
        _ff_service = importlib.import_module("app.services.feature-flag-resolution-service")
        FeatureFlagService = _ff_service.FeatureFlagService

        telegram = await TelegramNotifier.from_db_config(session)
        email = await EmailService.from_db_config(session)
        global_flags = await FeatureFlagService.get_global_flags(session)

        return cls(telegram=telegram, email=email, portal_url=telegram.portal_url, global_flags=global_flags)

    def _is_telegram_enabled(self, user) -> bool:
        """Check if telegram notifications enabled for user."""
        user_flags = getattr(user, "feature_flags", None) or {}
        if "telegram_notifications_enabled" in user_flags:
            return bool(user_flags["telegram_notifications_enabled"])
        if "telegram_notifications_enabled" in self.global_flags:
            return bool(self.global_flags["telegram_notifications_enabled"])
        return True  # Default enabled

    def _is_email_enabled(self, user) -> bool:
        """Check if email notifications enabled for user."""
        user_flags = getattr(user, "feature_flags", None) or {}
        if "email_notifications_enabled" in user_flags:
            return bool(user_flags["email_notifications_enabled"])
        if "email_notifications_enabled" in self.global_flags:
            return bool(self.global_flags["email_notifications_enabled"])
        return True  # Default enabled

    async def notify_vm_ready(
        self,
        user,  # User model
        vm_name: str,
        ip: str,
        username: str,
        password: str,
        tailscale_ip: Optional[str] = None,
        web_domain: Optional[str] = None,
    ) -> Dict[str, bool]:
        """Send VM ready notification based on user preference."""
        _templates = importlib.import_module("app.services.email-notification-templates")
        EmailTemplates = _templates.EmailTemplates

        results = {"telegram": False, "email": False}
        pref = getattr(user, "notification_preference", None) or "telegram"

        # Send via Telegram (if feature enabled)
        if pref in ("telegram", "both") and self._is_telegram_enabled(user):
            chat_id = getattr(user, "telegram_chat_id", None)
            if chat_id:
                results["telegram"] = await self.telegram.send_vm_ready(
                    chat_id, vm_name, ip, username, password, tailscale_ip, web_domain
                )

        # Send via Email (if feature enabled)
        if pref in ("email", "both") and self._is_email_enabled(user):
            user_email = getattr(user, "email", None)
            if user_email and self.email.is_configured():
                text, html = EmailTemplates.vm_ready(
                    vm_name, ip, username, password, tailscale_ip, web_domain, self.portal_url
                )
                results["email"] = await self.email.send(user_email, "VM Đã Sẵn Sàng", text, html)

        return results

    async def notify_vm_error(
        self,
        user,  # User model or telegram_chat_id string
        vm_name: str,
        error: str,
    ) -> Dict[str, bool]:
        """Send VM error notification based on user preference."""
        _templates = importlib.import_module("app.services.email-notification-templates")
        EmailTemplates = _templates.EmailTemplates

        results = {"telegram": False, "email": False}

        # Handle both User object and raw chat_id
        if isinstance(user, str):
            # Direct chat_id passed
            results["telegram"] = await self.telegram.send_vm_error(user, vm_name, error)
            return results

        pref = getattr(user, "notification_preference", None) or "telegram"

        # Send via Telegram (if feature enabled)
        if pref in ("telegram", "both") and self._is_telegram_enabled(user):
            chat_id = getattr(user, "telegram_chat_id", None)
            if chat_id:
                results["telegram"] = await self.telegram.send_vm_error(chat_id, vm_name, error)

        # Send via Email (if feature enabled)
        if pref in ("email", "both") and self._is_email_enabled(user):
            user_email = getattr(user, "email", None)
            if user_email and self.email.is_configured():
                text, html = EmailTemplates.vm_error(vm_name, error, self.portal_url)
                results["email"] = await self.email.send(user_email, "Lỗi Tạo VM", text, html)

        return results

    async def notify_password_reset(
        self,
        user,  # User model
        new_password: str,
        expiry_minutes: Optional[int] = None,
    ) -> Dict[str, bool]:
        """Send password reset notification based on user preference."""
        _templates = importlib.import_module("app.services.email-notification-templates")
        EmailTemplates = _templates.EmailTemplates

        results = {"telegram": False, "email": False}
        pref = getattr(user, "notification_preference", None) or "telegram"
        username = getattr(user, "username", "unknown")

        # Send via Telegram (if feature enabled)
        if pref in ("telegram", "both") and self._is_telegram_enabled(user):
            chat_id = getattr(user, "telegram_chat_id", None)
            if chat_id:
                results["telegram"] = await self.telegram.send_password_reset(
                    chat_id, username, new_password, expiry_minutes
                )

        # Send via Email (if feature enabled)
        if pref in ("email", "both") and self._is_email_enabled(user):
            user_email = getattr(user, "email", None)
            if user_email and self.email.is_configured():
                text, html = EmailTemplates.password_reset(
                    username, new_password, expiry_minutes, self.portal_url
                )
                results["email"] = await self.email.send(
                    user_email, "Đặt Lại Mật Khẩu VM Portal", text, html
                )

        return results

    async def send_test_email(self, to_email: str) -> bool:
        """Send test email to verify configuration."""
        _templates = importlib.import_module("app.services.email-notification-templates")
        EmailTemplates = _templates.EmailTemplates

        if not self.email.is_configured():
            return False

        text, html = EmailTemplates.test_email(self.portal_url)
        return await self.email.send(to_email, "Kiểm Tra Email - VM Portal", text, html)
