from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.database import get_session
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.schemas.network_schemas import (
    NetworkInterfaceResponse,
    NetworkInterfaceAddress,
    FirewallRuleResponse,
    FirewallRuleCreate,
    FirewallOptionsResponse,
    FirewallOptionsUpdate,
)
from app.services.proxmox_client import ProxmoxService


router = APIRouter(prefix="/vms", tags=["vm-network"])


@router.get("/{vm_id}/network", response_model=List[NetworkInterfaceResponse])
async def get_vm_network_interfaces(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get VM network interfaces via QEMU guest agent (owner or admin only)."""
    # Get VM from database
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    # Check if user owns this VM or is admin
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    # VM must be running to get network info
    if vm.status != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM phải đang chạy để xem thông tin mạng",
        )

    try:
        proxmox = ProxmoxService()
        interfaces_data = await proxmox.get_vm_network_interfaces(vm.vmid)

        # Transform data to response format
        interfaces = []
        for iface in interfaces_data:
            ip_addresses = []
            for addr in iface.get("ip-addresses", []):
                ip_addresses.append(
                    NetworkInterfaceAddress(
                        ip_address=addr.get("ip-address", ""),
                        ip_address_type=addr.get("ip-address-type", ""),
                        prefix=addr.get("prefix"),
                    )
                )

            interfaces.append(
                NetworkInterfaceResponse(
                    name=iface.get("name", ""),
                    hardware_address=iface.get("hardware-address"),
                    ip_addresses=ip_addresses,
                )
            )

        return interfaces

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy thông tin mạng: {str(e)}",
        )


@router.get("/{vm_id}/firewall/rules", response_model=List[FirewallRuleResponse])
async def get_firewall_rules(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get VM firewall rules (owner or admin only)."""
    # Get VM from database
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    # Check if user owns this VM or is admin
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    try:
        proxmox = ProxmoxService()
        rules = await proxmox.get_firewall_rules(vm.vmid)
        return [FirewallRuleResponse(**rule) for rule in rules]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy danh sách firewall rules: {str(e)}",
        )


@router.post("/{vm_id}/firewall/rules", response_model=FirewallRuleResponse, status_code=status.HTTP_201_CREATED)
async def add_firewall_rule(
    vm_id: int,
    rule_data: FirewallRuleCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Add a firewall rule to a VM (owner or admin only)."""
    # Get VM from database
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    # Check if user owns this VM or is admin
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    try:
        proxmox = ProxmoxService()
        # Convert Pydantic model to dict, excluding None values
        rule_dict = rule_data.model_dump(exclude_none=True)
        result_data = await proxmox.add_firewall_rule(vm.vmid, rule_dict)

        # Get updated rules list to return the created rule with pos
        rules = await proxmox.get_firewall_rules(vm.vmid)
        # Return the last rule (newly added)
        if rules:
            return FirewallRuleResponse(**rules[-1])
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Không thể xác nhận rule đã tạo",
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi thêm firewall rule: {str(e)}",
        )


@router.delete("/{vm_id}/firewall/rules/{pos}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_firewall_rule(
    vm_id: int,
    pos: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a firewall rule by position (owner or admin only)."""
    # Get VM from database
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    # Check if user owns this VM or is admin
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    try:
        proxmox = ProxmoxService()
        await proxmox.delete_firewall_rule(vm.vmid, pos)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi xóa firewall rule: {str(e)}",
        )


@router.get("/{vm_id}/firewall/options", response_model=FirewallOptionsResponse)
async def get_firewall_options(
    vm_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get VM firewall options (owner or admin only)."""
    # Get VM from database
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    # Check if user owns this VM or is admin
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    try:
        proxmox = ProxmoxService()
        options = await proxmox.get_firewall_options(vm.vmid)
        return FirewallOptionsResponse(**options)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lấy firewall options: {str(e)}",
        )


@router.put("/{vm_id}/firewall/options", response_model=FirewallOptionsResponse)
async def update_firewall_options(
    vm_id: int,
    options_data: FirewallOptionsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update VM firewall options (owner or admin only)."""
    # Get VM from database
    result = await session.execute(
        select(VirtualMachine).where(VirtualMachine.id == vm_id)
    )
    vm = result.scalar_one_or_none()

    if not vm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy VM",
        )

    # Check if user owns this VM or is admin
    if vm.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập VM này",
        )

    try:
        proxmox = ProxmoxService()
        # Convert Pydantic model to dict, excluding None values
        options_dict = options_data.model_dump(exclude_none=True)
        await proxmox.set_firewall_options(vm.vmid, options_dict)

        # Get updated options to return
        updated_options = await proxmox.get_firewall_options(vm.vmid)
        return FirewallOptionsResponse(**updated_options)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi cập nhật firewall options: {str(e)}",
        )
