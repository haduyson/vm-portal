"""User IP pool management endpoints."""
import importlib
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_session
from app.models.user_model import User

_ip_service = importlib.import_module("app.services.user-ip-address-service")
UserIpAddressService = _ip_service.UserIpAddressService

_ip_schemas = importlib.import_module("app.schemas.user-ip-address-schemas")
UserIpAddressResponse = _ip_schemas.UserIpAddressResponse
IpSelectionOption = _ip_schemas.IpSelectionOption
UserIpPoolSummary = _ip_schemas.UserIpPoolSummary

router = APIRouter(prefix="/my-ips", tags=["ip-pool"])


@router.get("", response_model=List[UserIpAddressResponse])
async def list_my_ips(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all IPs owned by current user with details."""
    ips = await UserIpAddressService.get_user_ips_with_details(session, current_user.id)

    return [
        UserIpAddressResponse(
            id=ip.id,
            ip_address=ip.ip_address,
            subnet_mask=ip.subnet_mask,
            gateway=ip.gateway,
            network_bridge_id=ip.network_bridge_id,
            bridge_name=ip.network_bridge.bridge_name if ip.network_bridge else None,
            vm_id=ip.vm_id,
            vm_name=ip.virtual_machine.name if ip.virtual_machine else None,
            is_retained=ip.is_retained,
            acquired_at=ip.acquired_at,
        )
        for ip in ips
    ]


@router.get("/summary", response_model=UserIpPoolSummary)
async def get_ip_pool_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get summary of user's IP pool."""
    ips = await UserIpAddressService.get_user_ips(session, current_user.id)

    total = len(ips)
    available = sum(1 for ip in ips if ip.vm_id is None)
    in_use = sum(1 for ip in ips if ip.vm_id is not None)
    retained = sum(1 for ip in ips if ip.is_retained)

    return UserIpPoolSummary(
        total=total,
        available=available,
        in_use=in_use,
        retained=retained,
    )


@router.get("/available", response_model=List[IpSelectionOption])
async def list_available_ips(
    network_bridge_id: Optional[int] = Query(None, description="Filter by bridge"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List user's available IPs (not assigned to VM) for VM creation."""
    ips = await UserIpAddressService.get_user_available_ips(
        session, current_user.id, network_bridge_id
    )

    return [
        IpSelectionOption(
            id=ip.id,
            ip_address=ip.ip_address,
            gateway=ip.gateway,
            subnet_mask=ip.subnet_mask,
        )
        for ip in ips
    ]


@router.delete("/{ip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def release_ip(
    ip_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Permanently release an IP (remove ownership). Only works for unassigned IPs."""
    # First check if IP exists and belongs to user
    ip = await UserIpAddressService.get_ip_by_id(session, ip_id, current_user.id)
    if not ip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="IP không tồn tại hoặc không thuộc về bạn",
        )

    if ip.vm_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa IP đang được sử dụng bởi VM. Vui lòng xóa VM trước.",
        )

    success = await UserIpAddressService.delete_ip(session, ip_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xóa IP",
        )

    await session.commit()
