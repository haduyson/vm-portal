"""Email notification service with SMTP and API provider support."""
import aiosmtplib
import httpx
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession


class EmailService:
    """Dual-provider email service (SMTP + API)."""

    def __init__(
        self,
        provider: str = "smtp",  # smtp | sendgrid | resend
        smtp_host: Optional[str] = None,
        smtp_port: int = 587,
        smtp_user: Optional[str] = None,
        smtp_password: Optional[str] = None,
        smtp_use_tls: bool = True,
        api_key: Optional[str] = None,
        from_email: str = "noreply@example.com",
        from_name: str = "VM Portal",
    ):
        self.provider = provider
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_password = smtp_password
        self.smtp_use_tls = smtp_use_tls
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name

    @classmethod
    async def from_db_config(cls, session: AsyncSession) -> "EmailService":
        """Create EmailService from database settings."""
        from app.services.system_settings_service import get_setting

        provider = await get_setting(session, "email_provider") or "smtp"
        smtp_port_str = await get_setting(session, "email_smtp_port")
        smtp_use_tls_str = await get_setting(session, "email_smtp_use_tls")

        return cls(
            provider=provider,
            smtp_host=await get_setting(session, "email_smtp_host"),
            smtp_port=int(smtp_port_str) if smtp_port_str else 587,
            smtp_user=await get_setting(session, "email_smtp_user"),
            smtp_password=await get_setting(session, "email_smtp_password"),
            smtp_use_tls=smtp_use_tls_str != "false" if smtp_use_tls_str else True,
            api_key=await get_setting(session, "email_api_key"),
            from_email=await get_setting(session, "email_from_address") or "noreply@example.com",
            from_name=await get_setting(session, "email_from_name") or "VM Portal",
        )

    def is_configured(self) -> bool:
        """Check if email service is properly configured."""
        if self.provider == "smtp":
            return bool(self.smtp_host and self.smtp_user)
        return bool(self.api_key)

    async def send(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        """Send email via configured provider."""
        if not self.is_configured():
            print(f"Email service not configured (provider: {self.provider})")
            return False

        try:
            if self.provider == "smtp":
                return await self._send_smtp(to_email, subject, text_body, html_body)
            elif self.provider == "sendgrid":
                return await self._send_sendgrid(to_email, subject, text_body, html_body)
            elif self.provider == "resend":
                return await self._send_resend(to_email, subject, text_body, html_body)
            else:
                print(f"Unknown email provider: {self.provider}")
                return False
        except Exception as e:
            print(f"Email send error ({self.provider}): {e}")
            return False

    async def _send_smtp(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str],
    ) -> bool:
        """Send via SMTP using aiosmtplib."""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_email}>"
        msg["To"] = to_email

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        if html_body:
            msg.attach(MIMEText(html_body, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=self.smtp_host,
            port=self.smtp_port,
            username=self.smtp_user,
            password=self.smtp_password,
            start_tls=self.smtp_use_tls,
        )
        print(f"Email sent via SMTP to {to_email}")
        return True

    async def _send_sendgrid(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str],
    ) -> bool:
        """Send via SendGrid API v3."""
        async with httpx.AsyncClient() as client:
            content = [{"type": "text/plain", "value": text_body}]
            if html_body:
                content.append({"type": "text/html", "value": html_body})

            payload = {
                "personalizations": [{"to": [{"email": to_email}]}],
                "from": {"email": self.from_email, "name": self.from_name},
                "subject": subject,
                "content": content,
            }

            resp = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30,
            )

            if resp.status_code == 202:
                print(f"Email sent via SendGrid to {to_email}")
                return True
            else:
                print(f"SendGrid error: {resp.status_code} - {resp.text}")
                return False

    async def _send_resend(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str],
    ) -> bool:
        """Send via Resend API."""
        async with httpx.AsyncClient() as client:
            payload = {
                "from": f"{self.from_name} <{self.from_email}>",
                "to": [to_email],
                "subject": subject,
                "text": text_body,
            }
            if html_body:
                payload["html"] = html_body

            resp = await client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30,
            )

            if resp.status_code == 200:
                print(f"Email sent via Resend to {to_email}")
                return True
            else:
                print(f"Resend error: {resp.status_code} - {resp.text}")
                return False
