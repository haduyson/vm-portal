import aiohttp
from typing import Optional
from app.config import settings


class TelegramNotifier:
    """Service for sending Telegram notifications."""

    def __init__(self):
        self.bot_token = settings.TELEGRAM_BOT_TOKEN
        self.default_chat_id = settings.TELEGRAM_DEFAULT_CHAT_ID
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"

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
