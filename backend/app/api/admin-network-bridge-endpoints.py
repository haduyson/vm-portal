"""Admin API endpoints for network bridge management."""
import importlib
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.proxmox_server_model import ProxmoxServer
from app.models import NetworkBridge
from app.services.proxmox_client import ProxmoxService
from app.api.admin_shared_helpers import log_audit

# Import kebab-case modules
_schemas = importlib.import_module("app.schemas.network-bridge-schemas")
_service = importlib.import_module("app.services.network-bridge-service")
NetworkBridgeService = _service.NetworkBridgeService

router = APIRouter(
    prefix="/admin/proxmox-servers/{server_id}/bridges",
    tags=["admin-network-bridges"],
)


async def _get_server_or_404(
    server_id: int, session: AsyncSession
) -> ProxmoxServer:
    """Get server by ID or raise 404."""
    result = await session.execute(
        select(ProxmoxServer).where(ProxmoxServer.id == server_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy Proxmox server",
        )
    return server


@router.get("/discovered", response_model=List[_schemas.ProxmoxBridgeDiscovery])
async def discover_bridges(
    server_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Fetch bridges directly from Proxmox API (no DB)."""
    server = await _get_server_or_404(server_id, session)

    try:
        proxmox = ProxmoxService.from_server(server)
        bridges = await proxmox.get_network_bridges()
        return [_schemas.ProxmoxBridgeDiscovery(**b) for b in bridges]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi kết nối Proxmox: {str(e)}",
        )


@router.post("/sync", response_model=_schemas.BridgeSyncResult)
async def sync_bridges(
    server_id: int,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Sync bridges from Proxmox API to database."""
    await _get_server_or_404(server_id, session)

    try:
        result = await NetworkBridgeService.sync_bridges_from_proxmox(
            session, server_id
        )

        await log_audit(
            session,
            admin.id,
            "sync_network_bridges",
            "proxmox_server",
            server_id,
            f"Synced bridges: {result['added']} added, {result['total']} total",
        )

        return _schemas.BridgeSyncResult(**result)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi sync bridges: {str(e)}",
        )


@router.get("", response_model=List[_schemas.NetworkBridgeResponse])
async def list_bridges(
    server_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all bridges for a Proxmox server from database."""
    await _get_server_or_404(server_id, session)

    bridges = await NetworkBridgeService.get_bridges_for_server(session, server_id)
    return [_schemas.NetworkBridgeResponse.model_validate(b) for b in bridges]


@router.get("/{bridge_id}", response_model=_schemas.NetworkBridgeResponse)
async def get_bridge(
    server_id: int,
    bridge_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific bridge by ID."""
    await _get_server_or_404(server_id, session)

    bridge = await NetworkBridgeService.get_bridge_by_id(session, bridge_id)
    if not bridge or bridge.proxmox_server_id != server_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bridge",
        )
    return _schemas.NetworkBridgeResponse.model_validate(bridge)


@router.put("/{bridge_id}", response_model=_schemas.NetworkBridgeResponse)
async def update_bridge(
    server_id: int,
    bridge_id: int,
    data: _schemas.NetworkBridgeUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update bridge settings (display_name, vlan_min/max, is_enabled, etc.)."""
    await _get_server_or_404(server_id, session)

    # Verify bridge belongs to server
    bridge = await NetworkBridgeService.get_bridge_by_id(session, bridge_id)
    if not bridge or bridge.proxmox_server_id != server_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bridge",
        )

    # Validate VLAN range
    update_data = data.model_dump(exclude_unset=True)
    vlan_min = update_data.get("vlan_min", bridge.vlan_min)
    vlan_max = update_data.get("vlan_max", bridge.vlan_max)
    if vlan_min and vlan_max and vlan_min > vlan_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VLAN min không được lớn hơn VLAN max",
        )

    updated = await NetworkBridgeService.update_bridge(session, bridge_id, update_data)

    await log_audit(
        session,
        admin.id,
        "update_network_bridge",
        "network_bridge",
        bridge_id,
        f"Updated bridge: {bridge.bridge_name}",
    )

    return _schemas.NetworkBridgeResponse.model_validate(updated)


# Public endpoint for VM creation (enabled bridges only)
public_router = APIRouter(
    prefix="/proxmox-servers/{server_id}/bridges",
    tags=["proxmox-servers"],
)


@public_router.get("", response_model=List[_schemas.NetworkBridgeResponse])
async def list_enabled_bridges(
    server_id: int,
    session: AsyncSession = Depends(get_session),
):
    """List enabled bridges for VM creation (public endpoint)."""
    result = await session.execute(
        select(ProxmoxServer).where(
            ProxmoxServer.id == server_id,
            ProxmoxServer.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy server",
        )

    bridges = await NetworkBridgeService.get_enabled_bridges_for_server(
        session, server_id
    )
    return [_schemas.NetworkBridgeResponse.model_validate(b) for b in bridges]
