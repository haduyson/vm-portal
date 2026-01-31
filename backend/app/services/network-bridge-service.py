"""Service for managing network bridges."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NetworkBridge, ProxmoxServer
from app.services.proxmox_client import ProxmoxService


class NetworkBridgeService:
    """Service for network bridge operations."""

    @staticmethod
    async def sync_bridges_from_proxmox(
        session: AsyncSession, server_id: int
    ) -> dict:
        """Sync bridges from Proxmox API to database.
        Returns dict with added, updated, total counts.
        """
        # Get server
        result = await session.execute(
            select(ProxmoxServer).where(ProxmoxServer.id == server_id)
        )
        server = result.scalar_one_or_none()
        if not server:
            raise ValueError(f"Server with id {server_id} not found")

        # Fetch bridges from Proxmox
        proxmox = ProxmoxService.from_server(server)
        discovered = await proxmox.get_network_bridges()

        # Get existing bridges
        existing_result = await session.execute(
            select(NetworkBridge).where(NetworkBridge.proxmox_server_id == server_id)
        )
        existing_bridges = {b.bridge_name: b for b in existing_result.scalars().all()}

        added = 0
        updated = 0

        for bridge_data in discovered:
            iface = bridge_data.get("iface")
            if not iface:
                continue

            if iface in existing_bridges:
                # Bridge exists, no update needed (preserve user settings)
                updated += 1
            else:
                # New bridge - add to DB
                new_bridge = NetworkBridge(
                    proxmox_server_id=server_id,
                    bridge_name=iface,
                    display_name=iface,  # Default display name = interface name
                    is_enabled=True,
                    is_public_network=False,
                )
                session.add(new_bridge)
                added += 1

        await session.commit()

        return {"added": added, "updated": updated, "total": len(discovered)}

    @staticmethod
    async def get_bridges_for_server(
        session: AsyncSession, server_id: int
    ) -> list[NetworkBridge]:
        """Get all bridges for a Proxmox server."""
        result = await session.execute(
            select(NetworkBridge)
            .where(NetworkBridge.proxmox_server_id == server_id)
            .order_by(NetworkBridge.bridge_name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_enabled_bridges_for_server(
        session: AsyncSession, server_id: int
    ) -> list[NetworkBridge]:
        """Get only enabled bridges for VM creation dropdown."""
        result = await session.execute(
            select(NetworkBridge)
            .where(
                NetworkBridge.proxmox_server_id == server_id,
                NetworkBridge.is_enabled == True,
            )
            .order_by(NetworkBridge.bridge_name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_bridge_by_id(
        session: AsyncSession, bridge_id: int
    ) -> NetworkBridge | None:
        """Get a bridge by ID."""
        result = await session.execute(
            select(NetworkBridge).where(NetworkBridge.id == bridge_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def update_bridge(
        session: AsyncSession, bridge_id: int, data: dict
    ) -> NetworkBridge | None:
        """Update bridge settings."""
        bridge = await NetworkBridgeService.get_bridge_by_id(session, bridge_id)
        if not bridge:
            return None

        for key, value in data.items():
            if value is not None and hasattr(bridge, key):
                setattr(bridge, key, value)

        await session.commit()
        await session.refresh(bridge)
        return bridge

    @staticmethod
    async def get_default_bridge_for_server(
        session: AsyncSession, server_id: int
    ) -> NetworkBridge | None:
        """Get the first enabled bridge as default (auto-discover fallback)."""
        result = await session.execute(
            select(NetworkBridge)
            .where(
                NetworkBridge.proxmox_server_id == server_id,
                NetworkBridge.is_enabled == True,
            )
            .order_by(NetworkBridge.bridge_name)
            .limit(1)
        )
        return result.scalar_one_or_none()
