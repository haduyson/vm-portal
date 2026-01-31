"""Service for managing user-owned IP addresses."""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user_model import User


class UserIpAddressService:
    """Manage user IP address pool: acquire, release, assign operations."""

    @staticmethod
    async def acquire_ip(
        session: AsyncSession,
        user_id: int,
        ip_address: str,
        network_bridge_id: int,
        vm_id: int,
        subnet_mask: str = "255.255.255.0",
        gateway: Optional[str] = None,
    ):
        """
        Create IP ownership record when VM acquires IP on public network.
        Returns the created UserIpAddress record.
        """
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        # Check if IP already exists
        existing = await session.execute(
            select(UserIpAddress).where(UserIpAddress.ip_address == ip_address)
        )
        if existing.scalar_one_or_none():
            return None  # IP already owned

        ip_record = UserIpAddress(
            user_id=user_id,
            ip_address=ip_address,
            network_bridge_id=network_bridge_id,
            vm_id=vm_id,
            subnet_mask=subnet_mask,
            gateway=gateway,
            is_retained=False,
        )
        session.add(ip_record)
        await session.flush()
        return ip_record

    @staticmethod
    async def get_user_ips(
        session: AsyncSession,
        user_id: int,
        network_bridge_id: Optional[int] = None,
    ):
        """Get all IPs owned by a user, optionally filtered by bridge."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        query = select(UserIpAddress).where(UserIpAddress.user_id == user_id)
        if network_bridge_id:
            query = query.where(UserIpAddress.network_bridge_id == network_bridge_id)
        query = query.order_by(UserIpAddress.acquired_at.desc())

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_user_available_ips(
        session: AsyncSession,
        user_id: int,
        network_bridge_id: Optional[int] = None,
    ):
        """Get user's IPs not assigned to any VM (vm_id is NULL)."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        query = select(UserIpAddress).where(
            UserIpAddress.user_id == user_id,
            UserIpAddress.vm_id == None,  # noqa: E711
        )
        if network_bridge_id:
            query = query.where(UserIpAddress.network_bridge_id == network_bridge_id)
        query = query.order_by(UserIpAddress.ip_address)

        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_ip_by_id(session: AsyncSession, ip_id: int, user_id: Optional[int] = None):
        """Get IP record by ID, optionally verify ownership."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        query = select(UserIpAddress).where(UserIpAddress.id == ip_id)
        if user_id:
            query = query.where(UserIpAddress.user_id == user_id)

        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def assign_ip_to_vm(
        session: AsyncSession,
        ip_id: int,
        vm_id: int,
        user_id: Optional[int] = None,
    ):
        """Assign an available IP to a VM. Returns the updated record or None if not available."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        query = select(UserIpAddress).where(
            UserIpAddress.id == ip_id,
            UserIpAddress.vm_id == None,  # noqa: E711
        )
        if user_id:
            query = query.where(UserIpAddress.user_id == user_id)

        result = await session.execute(query)
        ip_record = result.scalar_one_or_none()

        if not ip_record:
            return None

        ip_record.vm_id = vm_id
        ip_record.is_retained = False
        await session.flush()
        return ip_record

    @staticmethod
    async def release_ip(
        session: AsyncSession,
        vm_id: int,
        retain: bool = False,
    ):
        """
        Release IP when VM deleted.
        If retain=True: keep record with vm_id=NULL (user can reuse).
        If retain=False: delete the record (IP returns to DHCP pool).
        """
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        result = await session.execute(
            select(UserIpAddress).where(UserIpAddress.vm_id == vm_id)
        )
        ip_record = result.scalar_one_or_none()

        if not ip_record:
            return None

        if retain:
            ip_record.vm_id = None
            ip_record.is_retained = True
            await session.flush()
            return ip_record
        else:
            await session.delete(ip_record)
            await session.flush()
            return None

    @staticmethod
    async def delete_ip(session: AsyncSession, ip_id: int, user_id: Optional[int] = None):
        """Permanently delete an IP record (release ownership)."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        query = select(UserIpAddress).where(UserIpAddress.id == ip_id)
        if user_id:
            query = query.where(UserIpAddress.user_id == user_id)

        result = await session.execute(query)
        ip_record = result.scalar_one_or_none()

        if not ip_record:
            return False

        # Cannot delete IP that's assigned to a VM
        if ip_record.vm_id is not None:
            return False

        await session.delete(ip_record)
        await session.flush()
        return True

    @staticmethod
    async def check_ip_exists(session: AsyncSession, ip_address: str) -> bool:
        """Check if IP already owned by any user."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        result = await session.execute(
            select(UserIpAddress).where(UserIpAddress.ip_address == ip_address)
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def get_ip_with_details(session: AsyncSession, ip_id: int, user_id: Optional[int] = None):
        """Get IP with bridge and VM details loaded."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        query = (
            select(UserIpAddress)
            .options(
                selectinload(UserIpAddress.network_bridge),
                selectinload(UserIpAddress.virtual_machine),
            )
            .where(UserIpAddress.id == ip_id)
        )
        if user_id:
            query = query.where(UserIpAddress.user_id == user_id)

        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_ips_with_details(session: AsyncSession, user_id: int):
        """Get all user IPs with bridge and VM details."""
        import importlib
        _model = importlib.import_module("app.models.user-ip-address-model")
        UserIpAddress = _model.UserIpAddress

        query = (
            select(UserIpAddress)
            .options(
                selectinload(UserIpAddress.network_bridge),
                selectinload(UserIpAddress.virtual_machine),
            )
            .where(UserIpAddress.user_id == user_id)
            .order_by(UserIpAddress.acquired_at.desc())
        )

        result = await session.execute(query)
        return result.scalars().all()
