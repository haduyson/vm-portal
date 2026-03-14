# Phase 1: Database Model and Migration

## Overview

- **Priority:** P1 (blocking)
- **Status:** pending
- **Effort:** 1h

Store VM landing page configuration as JSON in existing `system_settings` table.

## Key Insights

- Existing `system_settings` table uses key-value pattern (string key, string value)
- Store entire config as JSON string under key `vm_landing_config`
- No new table needed - reuse existing pattern

## Config Schema

```json
{
  "title": "VM CLOUD - COMPANY NAME",
  "logo_url": "/static/custom-logo.png",
  "company_name": "COMPANY FULL NAME",
  "address": "123 Street, City",
  "phone": "(0236) 3.507.507",
  "email": "contact@company.com",
  "website": "company.com",
  "primary_color": "#667eea",
  "background_color": "#ffffff",
  "custom_content": "<p>Optional rich text</p>"
}
```

## Implementation Steps

### Step 1: Create Pydantic schema for config

File: `/backend/app/schemas/vm-landing-config-schemas.py`

```python
from typing import Optional
from pydantic import BaseModel, HttpUrl, field_validator

class VmLandingConfigUpdate(BaseModel):
    title: Optional[str] = None
    logo_url: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    primary_color: Optional[str] = None  # hex color
    background_color: Optional[str] = None  # hex color
    custom_content: Optional[str] = None  # optional rich text HTML

    @field_validator('primary_color', 'background_color')
    @classmethod
    def validate_hex_color(cls, v):
        if v and not v.startswith('#'):
            v = f'#{v}'
        return v

class VmLandingConfigResponse(BaseModel):
    title: str
    logo_url: str
    company_name: str
    address: str
    phone: str
    email: str
    website: str
    primary_color: str
    background_color: str
    custom_content: Optional[str] = None
```

### Step 2: Add helper functions to system_settings_service

File: `/backend/app/services/system_settings_service.py`

Add functions:
- `get_vm_landing_config(session) -> dict` - Returns config dict with defaults
- `set_vm_landing_config(session, config: dict)` - Saves config as JSON

Default config values (fallback when no DB config exists):
```python
DEFAULT_VM_LANDING_CONFIG = {
    "title": "VM CLOUD - HASONTECH",
    "logo_url": "/static/logo-hasontech.png",
    "company_name": "CONG TY TNHH MOT THANH VIEN CONG NGHE HA SON",
    "address": "300 Xo Viet Nghe Tinh, P. Cam Le, TP. Da Nang",
    "phone": "(0236) 3.507.507",
    "email": "lienhe@hasontech.vn",
    "website": "hasontech.vn",
    "primary_color": "#667eea",
    "background_color": "#ffffff",
    "custom_content": None
}
```

## Related Files

| Action | File |
|--------|------|
| Create | `/backend/app/schemas/vm-landing-config-schemas.py` |
| Modify | `/backend/app/services/system_settings_service.py` |

## Todo

- [ ] Create vm-landing-config-schemas.py with Pydantic models
- [ ] Add get_vm_landing_config() to system_settings_service.py
- [ ] Add set_vm_landing_config() to system_settings_service.py
- [ ] Add DEFAULT_VM_LANDING_CONFIG constant

## Success Criteria

- Pydantic schemas validate config fields
- get_vm_landing_config returns defaults when no DB entry
- set_vm_landing_config saves JSON to system_settings table

## Notes

- No Alembic migration needed - using existing table
- JSON stored as string in `value` column
