import importlib
import aiohttp
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User

# Import model via importlib (kebab-case filename)
_cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
CloudflareDomain = _cf_domain_model.CloudflareDomain

# Import schemas via importlib (kebab-case filename)
_cf_domain_schemas = importlib.import_module("app.schemas.cloudflare-domain-schemas")
CloudflareDomainCreate = _cf_domain_schemas.CloudflareDomainCreate
CloudflareDomainUpdate = _cf_domain_schemas.CloudflareDomainUpdate
CloudflareDomainResponse = _cf_domain_schemas.CloudflareDomainResponse

router = APIRouter(prefix="/admin/cloudflare-domains", tags=["admin-cloudflare-domains"])


@router.get("", response_model=List[CloudflareDomainResponse])
async def list_cloudflare_domains(
    current_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all Cloudflare domains (admin only)."""
    result = await session.execute(
        select(CloudflareDomain).order_by(CloudflareDomain.domain)
    )
    domains = result.scalars().all()
    return list(domains)


@router.post("", response_model=CloudflareDomainResponse, status_code=status.HTTP_201_CREATED)
async def create_cloudflare_domain(
    domain_data: CloudflareDomainCreate,
    current_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new Cloudflare domain configuration (admin only)."""
    # Check if domain already exists
    result = await session.execute(
        select(CloudflareDomain).where(CloudflareDomain.domain == domain_data.domain)
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain '{domain_data.domain}' đã tồn tại",
        )

    # Create new domain
    new_domain = CloudflareDomain(
        domain=domain_data.domain,
        cf_api_token=domain_data.cf_api_token,
        cf_zone_id=domain_data.cf_zone_id,
        cf_tunnel_id=domain_data.cf_tunnel_id,
        cf_tunnel_name=domain_data.cf_tunnel_name,
        cloudflared_config_path=domain_data.cloudflared_config_path,
        setup_notes=domain_data.setup_notes,
        is_active=True,
    )

    session.add(new_domain)
    await session.commit()
    await session.refresh(new_domain)

    return new_domain


@router.get("/{domain_id}", response_model=CloudflareDomainResponse)
async def get_cloudflare_domain(
    domain_id: int,
    current_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a single Cloudflare domain by ID (admin only)."""
    result = await session.execute(
        select(CloudflareDomain).where(CloudflareDomain.id == domain_id)
    )
    domain = result.scalar_one_or_none()

    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy domain",
        )

    return domain


@router.put("/{domain_id}", response_model=CloudflareDomainResponse)
async def update_cloudflare_domain(
    domain_id: int,
    domain_data: CloudflareDomainUpdate,
    current_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update a Cloudflare domain configuration (admin only)."""
    result = await session.execute(
        select(CloudflareDomain).where(CloudflareDomain.id == domain_id)
    )
    domain = result.scalar_one_or_none()

    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy domain",
        )

    # Check domain uniqueness if changing domain name
    if domain_data.domain and domain_data.domain != domain.domain:
        check_result = await session.execute(
            select(CloudflareDomain).where(CloudflareDomain.domain == domain_data.domain)
        )
        if check_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Domain '{domain_data.domain}' đã tồn tại",
            )
        domain.domain = domain_data.domain

    # Update fields if provided
    if domain_data.cf_api_token is not None:
        domain.cf_api_token = domain_data.cf_api_token
    if domain_data.cf_zone_id is not None:
        domain.cf_zone_id = domain_data.cf_zone_id
    if domain_data.cf_tunnel_id is not None:
        domain.cf_tunnel_id = domain_data.cf_tunnel_id
    if domain_data.cf_tunnel_name is not None:
        domain.cf_tunnel_name = domain_data.cf_tunnel_name
    if domain_data.cloudflared_config_path is not None:
        domain.cloudflared_config_path = domain_data.cloudflared_config_path
    if domain_data.setup_notes is not None:
        domain.setup_notes = domain_data.setup_notes
    if domain_data.is_active is not None:
        domain.is_active = domain_data.is_active

    await session.commit()
    await session.refresh(domain)

    return domain


@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cloudflare_domain(
    domain_id: int,
    current_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a Cloudflare domain (admin only). Only allowed if no VMs use it."""
    result = await session.execute(
        select(CloudflareDomain).where(CloudflareDomain.id == domain_id)
    )
    domain = result.scalar_one_or_none()

    if not domain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy domain",
        )

    # Check if any VMs are using this domain (via web_domain)
    from app.models.virtual_machine_model import VirtualMachine
    vms_result = await session.execute(
        select(VirtualMachine).where(
            VirtualMachine.web_domain.like(f"%.{domain.domain}")
        )
    )
    vms_using_domain = vms_result.scalars().all()

    if vms_using_domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể xóa domain vì có {len(vms_using_domain)} VM đang sử dụng",
        )

    await session.delete(domain)
    await session.commit()


@router.post("/test-connection")
async def test_cloudflare_connection(
    domain_data: CloudflareDomainCreate,
    current_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Test Cloudflare API connection and zone access (admin only)."""
    try:
        headers = {
            "Authorization": f"Bearer {domain_data.cf_api_token}",
            "Content-Type": "application/json",
        }
        url = f"https://api.cloudflare.com/client/v4/zones/{domain_data.cf_zone_id}"

        async with aiohttp.ClientSession() as client_session:
            async with client_session.get(url, headers=headers) as resp:
                data = await resp.json()

                if not data.get("success"):
                    errors = data.get("errors", [])
                    error_msg = errors[0].get("message") if errors else "Unknown error"
                    return {
                        "success": False,
                        "message": f"Cloudflare API error: {error_msg}",
                    }

                zone_info = data.get("result", {})
                zone_name = zone_info.get("name", "Unknown")

                return {
                    "success": True,
                    "message": f"Kết nối thành công! Zone: {zone_name}",
                    "zone_name": zone_name,
                    "zone_status": zone_info.get("status", "unknown"),
                }

    except aiohttp.ClientError as e:
        return {
            "success": False,
            "message": f"Lỗi kết nối: {str(e)}",
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Lỗi: {str(e)}",
        }
