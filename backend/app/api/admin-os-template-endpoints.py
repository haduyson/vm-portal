import importlib
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.os_template_model import OsTemplate
from app.services.proxmox_client import create_proxmox_service

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


@router.post("/os-templates", response_model=_schemas.OsTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_os_template(
    template_data: _schemas.OsTemplateCreate,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new OS template (admin only)."""
    # Check if os_type_key already exists
    result = await session.execute(
        select(OsTemplate).where(OsTemplate.os_type_key == template_data.os_type_key)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OS type key đã tồn tại",
        )

    template = OsTemplate(
        label=template_data.label,
        os_type_key=template_data.os_type_key,
        description=template_data.description,
        is_enabled=template_data.is_enabled,
        sort_order=template_data.sort_order,
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


@router.put("/os-templates/{template_id}", response_model=_schemas.OsTemplateResponse)
async def update_os_template(
    template_id: int,
    update_data: _schemas.OsTemplateUpdate,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update OS template (admin only)."""
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
    if update_data.label is not None:
        template.label = update_data.label
    if update_data.description is not None:
        template.description = update_data.description

    await session.commit()
    await session.refresh(template)
    return template


@router.delete("/os-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_os_template(
    template_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete an OS template (admin only)."""
    result = await session.execute(
        select(OsTemplate).where(OsTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy OS template",
        )

    await session.delete(template)
    await session.commit()


@router.get("/proxmox-templates")
async def scan_proxmox_templates(
    server_id: int = 1,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Scan and return VM templates and ISO images from Proxmox server."""
    from app.services.proxmox_client import create_proxmox_service_for_server
    try:
        proxmox = await create_proxmox_service_for_server(server_id, session)
        templates = await proxmox.get_vm_templates()
        isos = await proxmox.get_iso_images("local")
        return {"templates": templates, "isos": isos}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể quét từ Proxmox: {str(e)}"
        )
