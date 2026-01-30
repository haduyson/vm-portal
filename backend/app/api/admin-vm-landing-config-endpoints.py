from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.core.security import get_current_admin_user
from app.models.user_model import User
from app.services.system_settings_service import get_setting, set_setting
from app.schemas.vm_landing_config_schemas import VmLandingConfig, VmLandingConfigUpdate
import json
import os
import shutil
from pathlib import Path

router = APIRouter(prefix="/admin/vm-landing-config", tags=["admin", "vm-landing-config"])

UPLOAD_DIR = Path("/home/vpscloud/nginx/html/static")


@router.get("", response_model=VmLandingConfig)
async def get_vm_landing_config(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_admin_user),
):
    """Get VM landing page configuration."""
    config_json = await get_setting(db, "vm_landing_config")

    if config_json:
        try:
            config_dict = json.loads(config_json)
            return VmLandingConfig(**config_dict)
        except (json.JSONDecodeError, ValueError):
            # Return defaults if invalid JSON
            return VmLandingConfig()

    # Return defaults if not found
    return VmLandingConfig()


@router.put("", response_model=VmLandingConfig)
async def update_vm_landing_config(
    config_update: VmLandingConfigUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_admin_user),
):
    """Update VM landing page configuration."""
    # Get existing config
    config_json = await get_setting(db, "vm_landing_config")

    if config_json:
        try:
            config_dict = json.loads(config_json)
            existing_config = VmLandingConfig(**config_dict)
        except (json.JSONDecodeError, ValueError):
            existing_config = VmLandingConfig()
    else:
        existing_config = VmLandingConfig()

    # Update only provided fields
    update_data = config_update.model_dump(exclude_unset=True)
    updated_config = existing_config.model_copy(update=update_data)

    # Save to database
    config_json = updated_config.model_dump_json()
    await set_setting(db, "vm_landing_config", config_json)

    return updated_config


@router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_admin_user),
):
    """Upload logo file and return URL."""
    # Validate file type
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )

    # Validate file size (max 5MB)
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to start

    if file_size > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")

    # Create upload directory if not exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Generate filename
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "png"
    filename = f"vm-landing-logo.{file_extension}"
    file_path = UPLOAD_DIR / filename

    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Return URL
    logo_url = f"/static/{filename}"

    return {
        "logo_url": logo_url,
        "filename": filename,
        "message": "Logo uploaded successfully"
    }
