# Phase 2: Backend API Endpoints for Landing Config

## Overview

- **Priority:** P1 (blocking phase 3)
- **Status:** pending
- **Effort:** 1.5h

Create admin API endpoints for CRUD operations on VM landing config + logo file upload.

## Requirements

1. GET `/api/admin/vm-landing-config` - Retrieve current config
2. PUT `/api/admin/vm-landing-config` - Update config fields
3. POST `/api/admin/vm-landing-config/logo` - Upload logo file
4. GET `/api/admin/vm-landing-config/preview` - Generate HTML preview

## Implementation Steps

### Step 1: Create API endpoint file

File: `/backend/app/api/admin-vm-landing-config-endpoints.py`

```python
import os
import shutil
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.schemas.vm_landing_config_schemas import (
    VmLandingConfigResponse,
    VmLandingConfigUpdate,
)
from app.services.system_settings_service import (
    get_vm_landing_config,
    set_vm_landing_config,
)
from app.services.cloud_init_generator import CloudInitGenerator
from app.api.admin_shared_helpers import log_audit

router = APIRouter(prefix="/admin/vm-landing-config", tags=["admin-vm-landing"])

# Logo upload directory (mounted in docker-compose)
LOGO_UPLOAD_DIR = "/app/static"
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB


@router.get("", response_model=VmLandingConfigResponse)
async def get_landing_config(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get current VM landing page configuration."""
    config = await get_vm_landing_config(session)
    return VmLandingConfigResponse(**config)


@router.put("", response_model=VmLandingConfigResponse)
async def update_landing_config(
    config_update: VmLandingConfigUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update VM landing page configuration."""
    current = await get_vm_landing_config(session)

    # Merge updates into current config
    update_data = config_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            current[key] = value

    await set_vm_landing_config(session, current)
    await log_audit(session, admin.id, "update_vm_landing_config", "system", None,
                    f"Updated fields: {', '.join(update_data.keys())}")

    return VmLandingConfigResponse(**current)


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Upload custom logo for VM landing page."""
    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Validate file size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum 2MB allowed."
        )

    # Generate unique filename
    filename = f"vm-landing-logo-{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(LOGO_UPLOAD_DIR, filename)

    # Save file
    os.makedirs(LOGO_UPLOAD_DIR, exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(contents)

    # Update config with new logo URL
    logo_url = f"/static/{filename}"
    current = await get_vm_landing_config(session)
    current["logo_url"] = logo_url
    await set_vm_landing_config(session, current)

    await log_audit(session, admin.id, "upload_vm_landing_logo", "system", None,
                    f"Uploaded logo: {filename}")

    return {"logo_url": logo_url, "filename": filename}


@router.get("/preview")
async def get_landing_preview(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate HTML preview of landing page with current config."""
    config = await get_vm_landing_config(session)
    html = CloudInitGenerator.generate_landing_html(config)
    return {"html": html}
```

### Step 2: Register router in main.py

File: `/backend/app/main.py`

Add import and include:
```python
from app.api import admin_vm_landing_config_endpoints
app.include_router(admin_vm_landing_config_endpoints.router, prefix="/api")
```

### Step 3: Update docker-compose.yml

Mount static directory for logo uploads:
```yaml
api:
  volumes:
    - ./nginx/html/static:/app/static
```

## Related Files

| Action | File |
|--------|------|
| Create | `/backend/app/api/admin-vm-landing-config-endpoints.py` |
| Modify | `/backend/app/main.py` |
| Modify | `/docker-compose.yml` |

## Todo

- [ ] Create admin-vm-landing-config-endpoints.py
- [ ] Add GET /vm-landing-config endpoint
- [ ] Add PUT /vm-landing-config endpoint
- [ ] Add POST /vm-landing-config/logo endpoint
- [ ] Add GET /vm-landing-config/preview endpoint
- [ ] Register router in main.py
- [ ] Add volume mount in docker-compose.yml

## Success Criteria

- GET returns current config (or defaults)
- PUT updates config fields
- POST /logo uploads file and updates logo_url
- GET /preview returns rendered HTML

## Security Considerations

- Admin-only endpoints via `get_current_admin_user`
- File upload validation (extension, size)
- Audit logging for all changes
