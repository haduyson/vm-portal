import random
import string
import base64
import os
from typing import Tuple, Optional
import yaml
import json
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings

# Path to static files (mounted in docker)
STATIC_DIR = "/app/static"


def _resolve_logo_url(logo_url: str) -> str:
    """Convert logo path to base64 data URL for embedding in HTML."""
    if logo_url.startswith(('http://', 'https://', 'data:')):
        return logo_url

    # Try to read file and convert to base64
    if logo_url.startswith('/static/'):
        file_path = os.path.join(STATIC_DIR, logo_url[8:])  # Remove /static/ prefix
        if os.path.exists(file_path):
            try:
                with open(file_path, 'rb') as f:
                    b64 = base64.b64encode(f.read()).decode('utf-8')
                ext = os.path.splitext(file_path)[1].lower()
                mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'svg': 'image/svg+xml'}.get(ext.lstrip('.'), 'image/png')
                return f"data:{mime};base64,{b64}"
            except Exception:
                pass

    # Fallback to portal URL
    portal = settings.PORTAL_URL.rstrip('/')
    return f"{portal}{logo_url}"


def generate_landing_page_html(config: dict) -> str:
    """Generate landing page HTML from configuration."""
    logo_url = _resolve_logo_url(config.get("logo_url", "/static/logo-hasontech.png"))
    return f'''<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{config.get("title", "VM CLOUD - HASONTECH")}</title>
    <link rel="icon" href="{logo_url}">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: {config.get("bg_color", "#ffffff")};
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }}
        .container {{
            background: white;
            border-radius: 20px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }}
        .logo {{ max-width: 200px; margin-bottom: 20px; }}
        h1 {{ color: #1a202c; font-size: 24px; margin-bottom: 10px; }}
        .status {{
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #d4edda;
            color: #155724;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 500;
            margin-bottom: 20px;
        }}
        .status::before {{
            content: "";
            width: 10px;
            height: 10px;
            background: #28a745;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }}
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.5; }}
        }}
        .info {{
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            text-align: left;
        }}
        .info h3 {{ color: #495057; font-size: 13px; margin-bottom: 15px; }}
        .info-row {{
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
            color: #495057;
            font-size: 14px;
        }}
        .info-row svg {{ width: 18px; height: 18px; flex-shrink: 0; }}
        a {{ color: {config.get("primary_color", "#667eea")}; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
        .footer {{ margin-top: 20px; font-size: 12px; color: #6c757d; }}
        .message {{
            background: #fff3cd;
            color: #856404;
            padding: 12px 16px;
            border-radius: 10px;
            margin: 15px 0;
            font-size: 14px;
            line-height: 1.5;
            border-left: 4px solid #ffc107;
        }}
    </style>
</head>
<body>
    <div class="container">
        <img src="{logo_url}" alt="Logo" class="logo">
        <h1>{config.get("title", "VM CLOUD - HASONTECH")}</h1>
        <div class="status">Máy chủ đang hoạt động</div>
        {f'<div class="message">{config.get("message", "")}</div>' if config.get("message") else ""}
        <div class="info">
            <h3>{config.get("company_name", "CÔNG TY TNHH MỘT THÀNH VIÊN CÔNG NGHỆ HÀ SƠN")}</h3>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>{config.get("address", "300 Xô Viết Nghệ Tĩnh, P. Cẩm Lệ, TP. Đà Nẵng")}</span>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                <a href="tel:{config.get("phone", "(0236) 3.507.507").replace(" ", "").replace("(", "").replace(")", "").replace(".", "")}">{config.get("phone", "(0236) 3.507.507")}</a>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <a href="mailto:{config.get("email", "lienhe@hasontech.vn")}">{config.get("email", "lienhe@hasontech.vn")}</a>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <a href="https://{config.get("website", "hasontech.vn")}" target="_blank">{config.get("website", "hasontech.vn")}</a>
            </div>
        </div>
        <div class="footer">Powered by <a href="https://hasontech.vn" target="_blank">Hason Tech</a></div>
    </div>
</body>
</html>'''


# Default landing page using default config
HASONTECH_LANDING_PAGE = generate_landing_page_html({
    "title": "VM CLOUD - HASONTECH",
    "logo_url": "/static/logo-hasontech.png",
    "company_name": "CÔNG TY TNHH MỘT THÀNH VIÊN CÔNG NGHỆ HÀ SƠN",
    "address": "300 Xô Viết Nghệ Tĩnh, P. Cẩm Lệ, TP. Đà Nẵng",
    "phone": "(0236) 3.507.507",
    "email": "lienhe@hasontech.vn",
    "website": "hasontech.vn",
    "primary_color": "#667eea",
    "bg_color": "#ffffff"
})


class CloudInitGenerator:
    """Generate cloud-init configuration for VMs."""

    @staticmethod
    def generate_credentials() -> Tuple[str, str]:
        """Generate SSH credentials with root as default username."""
        username = "root"
        password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
        return username, password

    @staticmethod
    async def generate_user_data(
        vm_name: str,
        username: str,
        password: str,
        web_domain: Optional[str] = None,
        session: Optional[AsyncSession] = None
    ) -> str:
        """Generate cloud-init user-data YAML configuration."""
        # Load landing page config from database
        landing_page_html = HASONTECH_LANDING_PAGE
        if session:
            from app.services.system_settings_service import get_setting
            config_json = await get_setting(session, "vm_landing_config")
            if config_json:
                try:
                    config_dict = json.loads(config_json)
                    landing_page_html = generate_landing_page_html(config_dict)
                except (json.JSONDecodeError, ValueError):
                    # Use default if invalid JSON
                    pass

        config = {
            "#cloud-config": None,
            "hostname": vm_name,
            "manage_etc_hosts": True,
            "disable_root": False,  # Enable root login
            "chpasswd": {
                "expire": False,
                "list": [f"root:{password}"],
            },
            "ssh_pwauth": True,
            "package_update": True,
            "packages": [
                "openssh-server",
                "curl",
                "wget",
                "qemu-guest-agent",
                "nginx",  # Web server for HTTP subdomain
            ],
            "write_files": [
                {
                    "path": "/var/www/html/index.html",
                    "content": landing_page_html,
                    "permissions": "0644",
                },
            ],
            "runcmd": [
                # Ensure SSH is configured for password auth and root login
                "mkdir -p /etc/ssh/sshd_config.d",
                "echo 'PasswordAuthentication yes' > /etc/ssh/sshd_config.d/70-vpscloud.conf",
                "echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config.d/70-vpscloud.conf",
                # Also modify main config for older systems without sshd_config.d
                "sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config",
                "sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config",
                # Enable and restart SSH (try both ssh and sshd for different distros)
                "systemctl enable ssh || systemctl enable sshd || true",
                "systemctl restart ssh || systemctl restart sshd || true",
                # QEMU Guest Agent
                "systemctl enable qemu-guest-agent",
                "systemctl start qemu-guest-agent",
                # Enable and start nginx web server
                "systemctl enable nginx",
                "systemctl start nginx",
            ],
        }

        # Convert to YAML with cloud-config header
        yaml_content = "#cloud-config\n"
        # Remove the None value from #cloud-config key
        config_without_header = {k: v for k, v in config.items() if k != "#cloud-config"}
        yaml_content += yaml.dump(config_without_header, default_flow_style=False, allow_unicode=True)

        return yaml_content

    SNIPPETS_DIR = "/var/lib/vz/snippets"

    @classmethod
    def save_to_snippets(cls, vmid: int, user_data: str) -> str:
        """
        Save cloud-init configuration to Proxmox snippets directory.
        Returns the filename (without path).
        """
        import os
        filename = f"{vmid}-cloud-init.yml"
        filepath = os.path.join(cls.SNIPPETS_DIR, filename)

        os.makedirs(cls.SNIPPETS_DIR, exist_ok=True)
        with open(filepath, "w") as f:
            f.write(user_data)

        return filename

    @classmethod
    def delete_from_snippets(cls, vmid: int) -> bool:
        """Delete cloud-init snippet file for a VM."""
        import os
        filename = f"{vmid}-cloud-init.yml"
        filepath = os.path.join(cls.SNIPPETS_DIR, filename)

        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                return True
        except Exception:
            pass
        return False
