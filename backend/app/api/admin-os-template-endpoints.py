import importlib
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.os_template_model import OsTemplate

_schemas = importlib.import_module("app.schemas.os-template-schemas")

router = APIRouter(prefix="/admin", tags=["admin-os-templates"])


@router.get("/os-templates", response_model=List[_schemas.OsTemplateResponse])
async def list_os_templates(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all OS templates (admin only)."""
    result = await session.execute(
        select(OsTemplate).order_by(OsTemplate.sort_order, OsTemplate.id)
    )
    return result.scalars().all()


@router.put("/os-templates/{template_id}", response_model=_schemas.OsTemplateResponse)
async def update_os_template(
    template_id: int,
    update_data: _schemas.OsTemplateUpdate,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update OS template enabled status or sort order (admin only)."""
    result = await session.execute(
        select(OsTemplate).where(OsTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy OS template",
        )

    if update_data.is_enabled is not None:
        template.is_enabled = update_data.is_enabled
    if update_data.sort_order is not None:
        template.sort_order = update_data.sort_order

    await session.commit()
    await session.refresh(template)
    return template
