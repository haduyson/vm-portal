# Phase 4: Update Cloud Init Generator to Use DB Config

## Overview

- **Priority:** P1 (core feature)
- **Status:** pending
- **Effort:** 1h

Modify cloud_init_generator.py to read landing page config from database instead of using hardcoded HASONTECH_LANDING_PAGE constant.

## Current State

- `HASONTECH_LANDING_PAGE` - Hardcoded HTML string (~120 lines)
- `generate_user_data()` - Uses constant directly in write_files config

## Target State

- `generate_landing_html(config: dict) -> str` - New method generates HTML from config
- `generate_user_data()` - Calls generate_landing_html with DB config
- Remove or keep HASONTECH_LANDING_PAGE as fallback

## Implementation Steps

### Step 1: Add generate_landing_html method

File: `/backend/app/services/cloud_init_generator.py`

```python
@staticmethod
def generate_landing_html(config: dict) -> str:
    """Generate landing page HTML from configuration dict."""
    return f'''<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{config.get("title", "VM CLOUD")}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: {config.get("background_color", "#ffffff")};
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
        .custom-content {{ margin-top: 20px; text-align: left; }}
    </style>
</head>
<body>
    <div class="container">
        <img src="{config.get("logo_url", "/static/logo.png")}" alt="{config.get("company_name", "Company")}" class="logo">
        <h1>{config.get("title", "VM CLOUD")}</h1>
        <div class="status">May chu dang hoat dong</div>
        <div class="info">
            <h3>{config.get("company_name", "COMPANY NAME")}</h3>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>{config.get("address", "Address")}</span>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                <a href="tel:{config.get("phone", "")}">{config.get("phone", "Phone")}</a>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <a href="mailto:{config.get("email", "")}">{config.get("email", "email@company.com")}</a>
            </div>
            <div class="info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <a href="https://{config.get("website", "company.com")}" target="_blank">{config.get("website", "company.com")}</a>
            </div>
        </div>
        {f'<div class="custom-content">{config.get("custom_content")}</div>' if config.get("custom_content") else ''}
        <div class="footer">Powered by VM Cloud</div>
    </div>
</body>
</html>'''
```

### Step 2: Update generate_user_data to accept config

Modify signature to accept optional config parameter:

```python
@staticmethod
def generate_user_data(
    vm_name: str,
    username: str,
    password: str,
    web_domain: Optional[str] = None,
    landing_config: Optional[dict] = None
) -> str:
    """Generate cloud-init user-data YAML configuration."""

    # Generate landing HTML from config or use default
    if landing_config:
        landing_html = CloudInitGenerator.generate_landing_html(landing_config)
    else:
        landing_html = HASONTECH_LANDING_PAGE  # Fallback to hardcoded

    config = {
        # ... existing config ...
        "write_files": [
            {
                "path": "/var/www/html/index.html",
                "content": landing_html,
                "permissions": "0644",
            },
        ],
        # ... rest of config ...
    }
```

### Step 3: Update VM provisioning to pass config

File: `/backend/app/services/vm_provisioning_service.py`

When calling generate_user_data, fetch config from DB:

```python
from app.services.system_settings_service import get_vm_landing_config

# In provisioning method:
landing_config = await get_vm_landing_config(session)
user_data = CloudInitGenerator.generate_user_data(
    vm_name=vm_name,
    username=username,
    password=password,
    web_domain=web_domain,
    landing_config=landing_config
)
```

## Related Files

| Action | File |
|--------|------|
| Modify | `/backend/app/services/cloud_init_generator.py` |
| Modify | `/backend/app/services/vm_provisioning_service.py` |

## Todo

- [ ] Add generate_landing_html(config) static method
- [ ] Update generate_user_data to accept landing_config param
- [ ] Update vm_provisioning_service to fetch and pass config
- [ ] Test with default config (no DB entry)
- [ ] Test with custom config from DB

## Success Criteria

- New VMs get landing page from DB config
- Fallback to default if no config in DB
- Logo URL works (absolute path /static/...)
- Colors applied correctly
- Custom content rendered if present

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing VMs | Keep HASONTECH_LANDING_PAGE as fallback |
| Logo path issues | Use absolute /static/ path, verify nginx serves |
| HTML escaping issues | Config values should be text-only, no HTML in fields except custom_content |

## Notes

- Logo URL must be accessible from VM's nginx
- For external logos (https://...), VM needs internet access
- Consider caching generated HTML if performance needed
