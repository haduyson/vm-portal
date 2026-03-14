"""Email templates matching Telegram notification style."""
import html
from typing import Optional, Tuple


def _esc(value: str) -> str:
    """SEC-023: Escape HTML special characters to prevent XSS."""
    return html.escape(str(value)) if value else ""


class EmailTemplates:
    """Email templates for VM Portal notifications."""

    @staticmethod
    def _base_html(title: str, content: str, portal_url: str) -> str:
        """Generate base HTML email template."""
        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }}
        .header {{ background: #1976d2; color: #fff; padding: 20px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ padding: 24px; }}
        .info-row {{ margin: 12px 0; padding: 12px; background: #f8f9fa; border-radius: 4px; }}
        .info-label {{ color: #666; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }}
        .info-value {{ font-family: monospace; font-size: 14px; color: #333; }}
        .password {{ background: #fff3cd; border-left: 4px solid #ffc107; }}
        .footer {{ padding: 16px 24px; background: #f8f9fa; text-align: center; font-size: 12px; color: #666; }}
        .btn {{ display: inline-block; padding: 12px 24px; background: #1976d2; color: #fff; text-decoration: none; border-radius: 4px; margin-top: 16px; }}
        .error {{ background: #f8d7da; border-left: 4px solid #dc3545; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>{title}</h1></div>
        <div class="content">{content}</div>
        <div class="footer">
            <a href="{portal_url}" class="btn">Quản lý VM Portal</a>
            <p style="margin-top: 16px;">VM Portal - Hason Tech</p>
        </div>
    </div>
</body>
</html>"""

    @staticmethod
    def vm_ready(
        vm_name: str,
        ip: str,
        username: str,
        password: str,
        tailscale_ip: Optional[str],
        web_domain: Optional[str],
        portal_url: str,
    ) -> Tuple[str, str]:
        """Return (text, html) for VM ready notification.
        SEC-023: All user-controlled values are HTML-escaped.
        """
        tailscale_line_text = f"\nTailscale IP: {tailscale_ip}" if tailscale_ip else ""
        tailscale_line_html = f'<div class="info-row"><div class="info-label">Tailscale IP</div><div class="info-value">{_esc(tailscale_ip)}</div></div>' if tailscale_ip else ""
        web_line_text = f"\nWeb Domain: {web_domain}" if web_domain else ""
        web_line_html = f'<div class="info-row"><div class="info-label">Web Domain</div><div class="info-value">{_esc(web_domain)}</div></div>' if web_domain else ""
        ssh_target = tailscale_ip or ip

        text = f"""VM Đã Sẵn Sàng!

Tên VM: {vm_name}
IP Nội Bộ: {ip}{tailscale_line_text}{web_line_text}
Username: {username}
Password: {password}

Kết nối: ssh {username}@{ssh_target}
Quản lý VM: {portal_url}
"""

        # SEC-023: Escape all user-controlled values
        content = f"""
            <p>Máy ảo của bạn đã sẵn sàng sử dụng!</p>
            <div class="info-row"><div class="info-label">Tên VM</div><div class="info-value">{_esc(vm_name)}</div></div>
            <div class="info-row"><div class="info-label">IP Nội Bộ</div><div class="info-value">{_esc(ip)}</div></div>
            {tailscale_line_html}
            {web_line_html}
            <div class="info-row"><div class="info-label">Username</div><div class="info-value">{_esc(username)}</div></div>
            <div class="info-row password"><div class="info-label">Password</div><div class="info-value">{_esc(password)}</div></div>
            <div class="info-row"><div class="info-label">Kết nối SSH</div><div class="info-value">ssh {_esc(username)}@{_esc(ssh_target)}</div></div>
        """

        html_content = EmailTemplates._base_html("VM Đã Sẵn Sàng", content, portal_url)
        return text, html_content

    @staticmethod
    def vm_error(vm_name: str, error: str, portal_url: str) -> Tuple[str, str]:
        """Return (text, html) for VM error notification.
        SEC-023: All user-controlled values are HTML-escaped.
        """
        text = f"""Lỗi Tạo VM

Tên VM: {vm_name}
Lỗi: {error}

Vui lòng liên hệ quản trị viên hoặc thử lại.
Quản lý VM: {portal_url}
"""

        # SEC-023: Escape all user-controlled values
        content = f"""
            <p>Đã xảy ra lỗi khi tạo máy ảo của bạn.</p>
            <div class="info-row"><div class="info-label">Tên VM</div><div class="info-value">{_esc(vm_name)}</div></div>
            <div class="info-row error"><div class="info-label">Lỗi</div><div class="info-value">{_esc(error)}</div></div>
            <p>Vui lòng liên hệ quản trị viên hoặc thử lại.</p>
        """

        html = EmailTemplates._base_html("Lỗi Tạo VM", content, portal_url)
        return text, html

    @staticmethod
    def password_reset(
        username: str,
        new_password: str,
        expiry_minutes: Optional[int],
        portal_url: str,
    ) -> Tuple[str, str]:
        """Return (text, html) for password reset notification."""
        expiry_line_text = f"\nHiệu lực: {expiry_minutes} phút kể từ lúc nhận email này." if expiry_minutes else ""
        expiry_line_html = f'<p style="color: #856404;"><strong>Hiệu lực:</strong> {expiry_minutes} phút kể từ lúc nhận email này.</p>' if expiry_minutes else ""

        text = f"""Đặt lại mật khẩu VM Portal

Tài khoản: {username}
Mật khẩu mới: {new_password}{expiry_line_text}

Đăng nhập: {portal_url}
Vui lòng đăng nhập và đổi mật khẩu tại trang Hồ sơ.
"""

        content = f"""
            <p>Mật khẩu của bạn đã được đặt lại.</p>
            <div class="info-row"><div class="info-label">Tài khoản</div><div class="info-value">{username}</div></div>
            <div class="info-row password"><div class="info-label">Mật khẩu mới</div><div class="info-value">{new_password}</div></div>
            {expiry_line_html}
            <p>Vui lòng đăng nhập và đổi mật khẩu tại trang Hồ sơ.</p>
        """

        html = EmailTemplates._base_html("Đặt Lại Mật Khẩu", content, portal_url)
        return text, html

    @staticmethod
    def test_email(portal_url: str) -> Tuple[str, str]:
        """Return (text, html) for test email."""
        text = f"""Thông báo kiểm tra

Cấu hình Email đã hoạt động thành công!
Portal: {portal_url}
"""

        content = """
            <p style="font-size: 18px; color: #28a745;">✓ Cấu hình Email đã hoạt động thành công!</p>
            <p>Nếu bạn nhận được email này, hệ thống thông báo email đã được cấu hình đúng.</p>
        """

        html = EmailTemplates._base_html("Kiểm Tra Email", content, portal_url)
        return text, html
