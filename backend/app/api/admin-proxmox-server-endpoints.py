import asyncio
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.proxmox_server_model import ProxmoxServer
from app.models.virtual_machine_model import VirtualMachine
import importlib
schemas = importlib.import_module("app.schemas.proxmox-server-schemas")
from app.api.admin_shared_helpers import log_audit
from app.services.proxmox_client import ProxmoxService

router = APIRouter(prefix="/admin/proxmox-servers", tags=["admin-proxmox-servers"])


def _mask_token(token: str) -> str:
    if token and len(token) > 4:
        return "*" * (len(token) - 4) + token[-4:]
    return "****" if token else ""


def _parse_excluded_storages(raw: str | None) -> list[str]:
    """Parse comma-separated excluded_storages string to list."""
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _server_to_response(server: ProxmoxServer) -> schemas.ProxmoxServerResponse:
    return schemas.ProxmoxServerResponse(
        id=server.id,
        name=server.name,
        host=server.host,
        port=server.port,
        user=server.user,
        token_name=server.token_name,
        token_value_masked=_mask_token(server.token_value),
        node=server.node,
        excluded_storages=_parse_excluded_storages(server.excluded_storages),
        cloud_init_template_vmid=server.cloud_init_template_vmid,
        is_active=server.is_active,
        created_at=server.created_at,
        updated_at=server.updated_at,
    )


@router.get("", response_model=List[schemas.ProxmoxServerResponse])
async def list_proxmox_servers(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all Proxmox servers."""
    result = await session.execute(
        select(ProxmoxServer).order_by(ProxmoxServer.id)
    )
    servers = result.scalars().all()
    return [_server_to_response(s) for s in servers]


@router.post("", response_model=schemas.ProxmoxServerResponse, status_code=status.HTTP_201_CREATED)
async def create_proxmox_server(
    data: schemas.ProxmoxServerCreate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Add a new Proxmox server."""
    # Check unique name
    existing = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Server với tên '{data.name}' đã tồn tại",
        )

    # Auto-detect node from Proxmox API
    try:
        temp_service = ProxmoxService(
            host=data.host,
            port=data.port,
            user=data.user,
            token_name=data.token_name,
            token_value=data.token_value,
        )
        nodes = await temp_service.get_nodes()
        if not nodes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể kết nối Proxmox hoặc không tìm thấy node",
            )
        node_name = nodes[0]['node']
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi kết nối Proxmox: {str(e)}",
        )

    server = ProxmoxServer(
        name=data.name,
        host=data.host,
        port=data.port,
        user=data.user,
        token_name=data.token_name,
        token_value=data.token_value,
        node=node_name,
        excluded_storages=",".join(data.excluded_storages) if data.excluded_storages else "",
        cloud_init_template_vmid=data.cloud_init_template_vmid,
    )
    session.add(server)
    await session.commit()
    await session.refresh(server)

    await log_audit(
        session, admin.id, "create_proxmox_server", "proxmox_server",
        server.id, f"Added server: {server.name} ({server.host})",
    )

    return _server_to_response(server)


@router.get("/{server_id}", response_model=schemas.ProxmoxServerResponse)
async def get_proxmox_server(
    server_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a Proxmox server by ID."""
    result = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy server",
        )
    return _server_to_response(server)


@router.put("/{server_id}", response_model=schemas.ProxmoxServerResponse)
async def update_proxmox_server(
    server_id: int,
    data: schemas.ProxmoxServerUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update a Proxmox server."""
    result = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy server",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Check unique name if changing
    if "name" in update_data and update_data["name"] != server.name:
        existing = await session.execute(
            select(ProxmoxServer).where(ProxmoxServer.name == update_data["name"])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Server với tên '{update_data['name']}' đã tồn tại",
            )

    # Convert excluded_storages list to comma-separated string for DB
    if "excluded_storages" in update_data:
        update_data["excluded_storages"] = ",".join(update_data["excluded_storages"] or [])

    for key, value in update_data.items():
        setattr(server, key, value)

    await session.commit()
    await session.refresh(server)

    await log_audit(
        session, admin.id, "update_proxmox_server", "proxmox_server",
        server.id, f"Updated server: {server.name}",
    )

    return _server_to_response(server)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_proxmox_server(
    server_id: int,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a Proxmox server (only if no VMs are linked)."""
    result = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy server",
        )

    # Check if any VMs use this server
    vm_count_result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.proxmox_server_id == server_id)
    )
    if vm_count_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa server đang có VM liên kết",
        )

    server_name = server.name
    await session.delete(server)
    await session.commit()

    await log_audit(
        session, admin.id, "delete_proxmox_server", "proxmox_server",
        server_id, f"Deleted server: {server_name}",
    )


@router.get("/{server_id}/resources", response_model=schemas.ProxmoxServerResourceResponse)
async def get_proxmox_server_resources(
    server_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get live resource usage from a Proxmox server."""
    result = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy server",
        )

    try:
        proxmox = ProxmoxService.from_server(server)
        resources = await proxmox.get_node_resources()
        return schemas.ProxmoxServerResourceResponse(
            id=server.id,
            name=server.name,
            **resources,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy tài nguyên server: {str(e)}",
        )


@router.get("/{server_id}/storages", response_model=List[schemas.ProxmoxStorageItem])
async def get_proxmox_server_storages(
    server_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get all storages from a Proxmox server."""
    result = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy server",
        )

    try:
        proxmox = ProxmoxService.from_server(server)
        storages = await proxmox.get_storages()

        # Fetch allocated bytes for all storages in parallel
        storage_names = [s.get('storage', '') for s in storages]
        allocated_tasks = [proxmox.get_storage_allocated_bytes(name) for name in storage_names]
        allocated_results = await asyncio.gather(*allocated_tasks, return_exceptions=True)

        result_list = []
        for i, s in enumerate(storages):
            total = s.get('total', 0)
            used = s.get('used', 0)
            avail = s.get('avail', 0)
            alloc = allocated_results[i] if not isinstance(allocated_results[i], Exception) else 0

            result_list.append(schemas.ProxmoxStorageItem(
                storage=s.get('storage', ''),
                type=s.get('type', ''),
                content=s.get('content', ''),
                total_gb=round(total / (1024 ** 3), 2) if total else 0,
                used_gb=round(used / (1024 ** 3), 2) if used else 0,
                available_gb=round(avail / (1024 ** 3), 2) if avail else 0,
                allocated_gb=round(alloc / (1024 ** 3), 2) if alloc else 0,
                active=s.get('active', 0) == 1,
            ))

        return result_list
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy danh sách storage: {str(e)}",
        )


class ProxmoxTestConnectionRequest(BaseModel):
    host: str
    port: int = 8006
    user: str = "root@pam"
    token_name: str
    token_value: str


class ProxmoxTestConnectionResponse(BaseModel):
    success: bool
    node: str = None
    error: str = None


@router.post("/test-connection", response_model=ProxmoxTestConnectionResponse)
async def test_proxmox_connection(
    data: ProxmoxTestConnectionRequest,
    _admin: User = Depends(get_current_admin_user),
):
    """Test connection to a Proxmox server and return node info."""
    try:
        temp_service = ProxmoxService(
            host=data.host,
            port=data.port,
            user=data.user,
            token_name=data.token_name,
            token_value=data.token_value,
        )
        nodes = await temp_service.get_nodes()
        if not nodes:
            return ProxmoxTestConnectionResponse(
                success=False,
                error="Không tìm thấy node nào",
            )

        return ProxmoxTestConnectionResponse(
            success=True,
            node=nodes[0]['node'],
        )
    except Exception as e:
        return ProxmoxTestConnectionResponse(
            success=False,
            error=str(e),
        )
