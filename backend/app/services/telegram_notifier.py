import aiohttp
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings


class TelegramNotifier:
    """Service for sending Telegram notifications."""

    def __init__(self, bot_token: Optional[str] = None, default_chat_id: Optional[str] = None):
        """
        Initialize TelegramNotifier with optional bot_token and default_chat_id.
        If not provided, will use values from settings.
        """
        self.bot_token = bot_token or settings.TELEGRAM_BOT_TOKEN
        self.default_chat_id = default_chat_id or settings.TELEGRAM_DEFAULT_CHAT_ID
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"

    @classmethod
    async def from_db_config(cls, session: AsyncSession) -> "TelegramNotifier":
        """Create TelegramNotifier instance using database config with env fallback."""
        from app.services.system_settings_service import get_telegram_config
        config = await get_telegram_config(session)
        return cls(
            bot_token=config["bot_token"],
            default_chat_id=config["default_chat_id"]
        )

    async def send_message(self, chat_id: str, message: str, parse_mode: str = "Markdown") -> bool:
        """Send a message via Telegram Bot API."""
        if not self.bot_token:
            print("Warning: Telegram bot token not configured")
            return False

        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": parse_mode,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status == 200:
                        return True
                    else:
                        error_text = await response.text()
                        print(f"Telegram API error: {error_text}")
                        return False
        except Exception as e:
            print(f"Error sending Telegram message: {e}")
            return False

    async def send_vm_ready(
        self,
        chat_id: Optional[str],
        vm_name: str,
        ip: str,
        username: str,
        password: str,
        ssh_domain: str,
    ) -> bool:
        """Send VM ready notification."""
        target_chat_id = chat_id or self.default_chat_id

        if not target_chat_id:
            print("Warning: No Telegram chat ID configured")
            return False

        message = f"""🖥 *VM Đã Sẵn Sàng!*

*Tên VM:* `{vm_name}`
*IP Nội Bộ:* `{ip}`
*SSH Domain:* `{ssh_domain}`
*Username:* `{username}`
*Password:* `{password}`

Kết nối: `ssh {username}@{ssh_domain}`"""

        return await self.send_message(target_chat_id, message)

    async def send_vm_error(
        self,
        chat_id: Optional[str],
        vm_name: str,
        error: str,
    ) -> bool:
        """Send VM creation error notification."""
        target_chat_id = chat_id or self.default_chat_id

        if not target_chat_id:
            return False

        message = f"""❌ *Lỗi Tạo VM*

*Tên VM:* `{vm_name}`
*Lỗi:* {error}

Vui lòng liên hệ quản trị viên."""

        return await self.send_message(target_chat_id, message)

    async def send_password_reset(
        self,
        chat_id: str,
        username: str,
        new_password: str,
        expiry_minutes: int | None = None,
    ) -> bool:
        """Send password reset notification."""
        expiry_line = ""
        if expiry_minutes:
            expiry_line = f"\n⏰ *Hiệu lực:* {expiry_minutes} phút kể từ lúc nhận tin nhắn này."

        message = f"""🔐 *Đặt lại mật khẩu VM Portal*

*Tài khoản:* `{username}`
*Mật khẩu mới:* `{new_password}`{expiry_line}

Vui lòng đăng nhập và đổi mật khẩu tại trang Hồ sơ."""

        return await self.send_message(chat_id, message)
