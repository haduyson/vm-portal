"""Admin endpoints for notification templates configuration."""
import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Dict, Any, Optional

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.services.system_settings_service import get_setting, set_setting

router = APIRouter(prefix="/admin/settings", tags=["admin-notification-templates"])


class NotificationTemplatesUpdate(BaseModel):
    telegram_templates: Optional[Dict[str, Any]] = None
    email_templates: Optional[Dict[str, Any]] = None


@router.get("/notification-templates")
async def get_notification_templates(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get notification templates for Telegram and Email."""
    telegram_json = await get_setting(session, "notification_templates_telegram")
    email_json = await get_setting(session, "notification_templates_email")

    telegram_templates = None
    email_templates = None

    if telegram_json:
        try:
            telegram_templates = json.loads(telegram_json)
        except json.JSONDecodeError:
            pass

    if email_json:
        try:
            email_templates = json.loads(email_json)
        except json.JSONDecodeError:
            pass

    return {
        "telegram_templates": telegram_templates,
        "email_templates": email_templates,
    }


@router.put("/notification-templates")
async def update_notification_templates(
    data: NotificationTemplatesUpdate,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update notification templates."""
    if data.telegram_templates is not None:
        await set_setting(session, "notification_templates_telegram", json.dumps(data.telegram_templates))

    if data.email_templates is not None:
        await set_setting(session, "notification_templates_email", json.dumps(data.email_templates))

    return {"message": "Templates updated"}
