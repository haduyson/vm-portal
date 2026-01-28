import asyncio
import base64
import secrets
import importlib
import json
from typing import Optional
import aiohttp
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User

# Import CloudflareDomain model via importlib
_cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
CloudflareDomain = _cf_domain_model.CloudflareDomain

router = APIRouter(prefix="/admin/cloudflare-setup", tags=["admin-cloudflare-setup"])

CF_API = "https://api.cloudflare.com/client/v4"


# Pydantic models for request/response
class TestConnectionRequest(BaseModel):
    api_token: str = Field(..., min_length=1)
    account_id: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)


class TestConnectionResponse(BaseModel):
    success: bool
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    account_name: Optional[str] = None
    permissions: list[str] = []
    missing_permissions: list[str] = []
    error: Optional[str] = None


class CheckCloudflaredResponse(BaseModel):
    installed: bool
    version: Optional[str] = None


class CreateTunnelRequest(BaseModel):
    api_token: str = Field(..., min_length=1)
    account_id: str = Field(..., min_length=1)
    tunnel_name: str = Field(default="vpscloud")


class CreateTunnelResponse(BaseModel):
    success: bool
    tunnel_id: Optional[str] = None
    tunnel_name: Optional[str] = None
    credentials_content: Optional[str] = None
    credentials_file_written: bool = False
    error: Optional[str] = None


class CreateDNSRequest(BaseModel):
    api_token: str = Field(..., min_length=1)
    zone_id: str = Field(..., min_length=1)
    tunnel_id: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)
    proxmox_subdomain: str = Field(default="dc")
    portal_subdomain: str = Field(default="vpscloud")


class CreateDNSResponse(BaseModel):
    success: bool
    records_created: list[str] = []
    errors: list[str] = []


class GenerateConfigRequest(BaseModel):
    tunnel_id: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)
    proxmox_subdomain: str = Field(default="dc")
    portal_subdomain: str = Field(default="vpscloud")
    config_path: str = Field(default="/etc/cloudflared/config.yml")


class GenerateConfigResponse(BaseModel):
    success: bool
    config_content: str
    written_to_file: bool
    error: Optional[str] = None


class StartServiceResponse(BaseModel):
    success: bool
    status: Optional[str] = None
    error: Optional[str] = None


class FinalizeRequest(BaseModel):
    domain: str = Field(..., min_length=1)
    cf_api_token: str = Field(..., min_length=1)
    cf_zone_id: str = Field(..., min_length=1)
    cf_tunnel_id: str = Field(..., min_length=1)
    cf_tunnel_name: str = Field(default="vpscloud")
    cloudflared_config_path: str = Field(default="/etc/cloudflared/config.yml")


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    request: TestConnectionRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Step 1+2: Test CF API connection, verify permissions, get zone info."""
    try:
        headers = {
            "Authorization": f"Bearer {request.api_token}",
            "Content-Type": "application/json",
        }
        detected_perms: list[str] = []
        missing_perms: list[str] = []
        zone_id = None
        zone_name = None
        account_name = None

        async with aiohttp.ClientSession() as session:
            # 1. Verify token is valid
            verify_url = f"{CF_API}/user/tokens/verify"
            async with session.get(verify_url, headers=headers) as resp:
                verify_data = await resp.json()
                if not verify_data.get("success"):
                    return TestConnectionResponse(
                        success=False,
                        error="API Token không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại token.",
                    )
                detected_perms.append("Token hợp lệ")

            # 2. Get zone info by domain name
            zone_url = f"{CF_API}/zones?name={request.domain}"
            async with session.get(zone_url, headers=headers) as resp:
                zone_data = await resp.json()
                if not zone_data.get("success"):
                    errors = zone_data.get("errors", [])
                    error_msg = errors[0].get("message") if errors else "Unknown error"
                    return TestConnectionResponse(
                        success=False,
                        error=f"Zone lookup thất bại: {error_msg}",
                    )
                zones = zone_data.get("result", [])
                if not zones:
                    return TestConnectionResponse(
                        success=False,
                        error=f"Domain '{request.domain}' không tìm thấy trong tài khoản Cloudflare",
                    )
                zone_info = zones[0]
                zone_id = zone_info.get("id")
                zone_name = zone_info.get("name")
                # Extract token permissions from zone response
                zone_perms = zone_info.get("permissions", [])
                if "#zone:read" in zone_perms:
                    detected_perms.append("Zone:Read")
                if "#dns_records:read" in zone_perms:
                    detected_perms.append("DNS:Read")
                if "#dns_records:edit" in zone_perms:
                    detected_perms.append("DNS:Edit")

            # 3. Verify account access (optional — only for display)
            account_url = f"{CF_API}/accounts/{request.account_id}"
            async with session.get(account_url, headers=headers) as resp:
                account_data = await resp.json()
                if account_data.get("success"):
                    account_info = account_data.get("result", {})
                    account_name = account_info.get("name", "Unknown")
                    detected_perms.append("Account:Read")
                else:
                    # Not critical — just can't show account name
                    missing_perms.append("Account:Read (tùy chọn)")

            # 4. Check Cloudflare Tunnel permission (required)
            tunnel_url = f"{CF_API}/accounts/{request.account_id}/cfd_tunnel?is_deleted=false&per_page=1"
            async with session.get(tunnel_url, headers=headers) as resp:
                tunnel_data = await resp.json()
                if tunnel_data.get("success"):
                    detected_perms.append("Cloudflare Tunnel:Read")
                else:
                    missing_perms.append("Cloudflare Tunnel:Edit")

        # Determine overall result — only block on critical missing permissions
        critical_missing = [p for p in missing_perms if "tùy chọn" not in p]
        if critical_missing:
            perm_list = ", ".join(critical_missing)
            return TestConnectionResponse(
                success=False,
                zone_id=zone_id,
                zone_name=zone_name,
                account_name=account_name,
                permissions=detected_perms,
                missing_permissions=missing_perms,
                error=(
                    f"Token thiếu quyền bắt buộc: {perm_list}. "
                    "Vui lòng tạo API Token mới tại https://dash.cloudflare.com/profile/api-tokens "
                    "với các quyền: Account > Cloudflare Tunnel > Edit, "
                    "Zone > DNS > Edit, Zone > Zone > Read."
                ),
            )

        return TestConnectionResponse(
            success=True,
            zone_id=zone_id,
            zone_name=zone_name,
            account_name=account_name,
            permissions=detected_perms,
        )

    except aiohttp.ClientError as e:
        return TestConnectionResponse(success=False, error=f"Lỗi kết nối: {str(e)}")
    except Exception as e:
        return TestConnectionResponse(success=False, error=f"Lỗi: {str(e)}")


@router.get("/check-cloudflared", response_model=CheckCloudflaredResponse)
async def check_cloudflared(
    current_user: User = Depends(get_current_admin_user),
):
    """Step 3: Check if cloudflared is installed."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "cloudflared", "version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()

        if proc.returncode == 0:
            version = stdout.decode().strip()
            return CheckCloudflaredResponse(installed=True, version=version)
        else:
            return CheckCloudflaredResponse(installed=False)

    except FileNotFoundError:
        return CheckCloudflaredResponse(installed=False)
    except Exception:
        return CheckCloudflaredResponse(installed=False)


@router.post("/create-tunnel", response_model=CreateTunnelResponse)
async def create_tunnel(
    request: CreateTunnelRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Step 4: Create tunnel via CF API."""
    try:
        # Generate tunnel secret
        tunnel_secret_bytes = secrets.token_bytes(32)
        tunnel_secret_b64 = base64.b64encode(tunnel_secret_bytes).decode()

        headers = {
            "Authorization": f"Bearer {request.api_token}",
            "Content-Type": "application/json",
        }

        tunnel_payload = {
            "name": request.tunnel_name,
            "tunnel_secret": tunnel_secret_b64,
            "config_src": "local"
        }

        async with aiohttp.ClientSession() as session:
            tunnel_url = f"{CF_API}/accounts/{request.account_id}/cfd_tunnel"
            async with session.post(tunnel_url, headers=headers, json=tunnel_payload) as resp:
                resp_data = await resp.json()

                if not resp_data.get("success"):
                    errors = resp_data.get("errors", [])
                    error_msg = errors[0].get("message") if errors else "Unknown error"

                    # Check if tunnel already exists
                    if resp.status == 409 or "already exists" in error_msg.lower():
                        return CreateTunnelResponse(
                            success=False,
                            error=f"Tunnel '{request.tunnel_name}' đã tồn tại. Vui lòng chọn tên khác hoặc xóa tunnel cũ."
                        )

                    return CreateTunnelResponse(
                        success=False,
                        error=f"Failed to create tunnel: {error_msg}"
                    )

                tunnel_info = resp_data.get("result", {})
                tunnel_id = tunnel_info.get("id")
                tunnel_name = tunnel_info.get("name")

        # Generate credentials file content
        credentials = {
            "AccountTag": request.account_id,
            "TunnelSecret": tunnel_secret_b64,
            "TunnelID": tunnel_id
        }
        credentials_content = json.dumps(credentials, indent=2)

        # Try to write credentials file
        credentials_written = False
        try:
            import os
            os.makedirs("/etc/cloudflared", mode=0o755, exist_ok=True)
            credentials_path = f"/etc/cloudflared/{tunnel_id}.json"
            with open(credentials_path, "w") as f:
                f.write(credentials_content)
            os.chmod(credentials_path, 0o600)
            credentials_written = True
        except Exception:
            # File write failed - return content for manual save
            pass

        return CreateTunnelResponse(
            success=True,
            tunnel_id=tunnel_id,
            tunnel_name=tunnel_name,
            credentials_content=credentials_content,
            credentials_file_written=credentials_written
        )

    except aiohttp.ClientError as e:
        return CreateTunnelResponse(success=False, error=f"Connection error: {str(e)}")
    except Exception as e:
        return CreateTunnelResponse(success=False, error=f"Unexpected error: {str(e)}")


@router.post("/create-dns", response_model=CreateDNSResponse)
async def create_dns(
    request: CreateDNSRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Step 5: Create DNS CNAME records."""
    headers = {
        "Authorization": f"Bearer {request.api_token}",
        "Content-Type": "application/json",
    }

    records_created = []
    errors = []

    # DNS records to create
    dns_records = [
        {
            "name": f"{request.proxmox_subdomain}.{request.domain}",
            "target": f"{request.tunnel_id}.cfargotunnel.com",
            "label": "Proxmox UI"
        },
        {
            "name": f"{request.portal_subdomain}.{request.domain}",
            "target": f"{request.tunnel_id}.cfargotunnel.com",
            "label": "VM Portal"
        }
    ]

    try:
        async with aiohttp.ClientSession() as session:
            for record in dns_records:
                # Check if record already exists
                check_url = f"{CF_API}/zones/{request.zone_id}/dns_records?name={record['name']}"
                async with session.get(check_url, headers=headers) as resp:
                    check_data = await resp.json()
                    existing_records = check_data.get("result", [])

                    if existing_records:
                        records_created.append(f"{record['name']} (already exists)")
                        continue

                # Create DNS record
                dns_payload = {
                    "type": "CNAME",
                    "name": record["name"],
                    "content": record["target"],
                    "proxied": True,
                    "comment": f"Auto-created by VM Portal for {record['label']}"
                }

                create_url = f"{CF_API}/zones/{request.zone_id}/dns_records"
                async with session.post(create_url, headers=headers, json=dns_payload) as resp:
                    create_data = await resp.json()

                    if create_data.get("success"):
                        records_created.append(record["name"])
                    else:
                        error_msgs = create_data.get("errors", [])
                        error_msg = error_msgs[0].get("message") if error_msgs else "Unknown error"
                        errors.append(f"{record['name']}: {error_msg}")

        return CreateDNSResponse(
            success=len(errors) == 0,
            records_created=records_created,
            errors=errors
        )

    except Exception as e:
        return CreateDNSResponse(
            success=False,
            records_created=records_created,
            errors=[f"Unexpected error: {str(e)}"]
        )


@router.post("/generate-config", response_model=GenerateConfigResponse)
async def generate_config(
    request: GenerateConfigRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Step 6: Generate cloudflared config file."""
    config_content = f"""tunnel: {request.tunnel_id}
credentials-file: /etc/cloudflared/{request.tunnel_id}.json

ingress:
  - hostname: {request.proxmox_subdomain}.{request.domain}
    service: https://localhost:8006
    originRequest:
      noTLSVerify: true
  - hostname: {request.portal_subdomain}.{request.domain}
    service: http://localhost:80
  - service: http_status:404
"""

    # Try to write config file
    written = False
    error_msg = None
    try:
        import os
        os.makedirs("/etc/cloudflared", mode=0o755, exist_ok=True)
        with open(request.config_path, "w") as f:
            f.write(config_content)
        os.chmod(request.config_path, 0o644)
        written = True
    except Exception as e:
        error_msg = str(e)

    return GenerateConfigResponse(
        success=True,
        config_content=config_content,
        written_to_file=written,
        error=error_msg if not written else None
    )


@router.post("/start-service", response_model=StartServiceResponse)
async def start_service(
    current_user: User = Depends(get_current_admin_user),
):
    """Step 7: Start cloudflared service."""
    try:
        # Try to install service
        proc1 = await asyncio.create_subprocess_exec(
            "cloudflared", "service", "install",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc1.communicate()

        # Enable service
        proc2 = await asyncio.create_subprocess_exec(
            "systemctl", "enable", "cloudflared",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc2.communicate()

        # Start service
        proc3 = await asyncio.create_subprocess_exec(
            "systemctl", "start", "cloudflared",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc3.communicate()

        # Check status
        proc4 = await asyncio.create_subprocess_exec(
            "systemctl", "is-active", "cloudflared",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc4.communicate()
        service_status = stdout.decode().strip()

        if service_status == "active":
            return StartServiceResponse(
                success=True,
                status=service_status
            )
        else:
            return StartServiceResponse(
                success=False,
                status=service_status,
                error="Service không ở trạng thái active. Vui lòng kiểm tra logs: journalctl -u cloudflared"
            )

    except Exception as e:
        return StartServiceResponse(
            success=False,
            error=f"Lỗi khi khởi chạy service: {str(e)}"
        )


@router.post("/finalize")
async def finalize(
    request: FinalizeRequest,
    current_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Step 8: Save domain to database."""
    try:
        # Check if domain already exists
        result = await session.execute(
            select(CloudflareDomain).where(CloudflareDomain.domain == request.domain)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing domain
            existing.cf_api_token = request.cf_api_token
            existing.cf_zone_id = request.cf_zone_id
            existing.cf_tunnel_id = request.cf_tunnel_id
            existing.cf_tunnel_name = request.cf_tunnel_name
            existing.cloudflared_config_path = request.cloudflared_config_path
            existing.is_active = True
            domain_record = existing
        else:
            # Create new domain
            domain_record = CloudflareDomain(
                domain=request.domain,
                cf_api_token=request.cf_api_token,
                cf_zone_id=request.cf_zone_id,
                cf_tunnel_id=request.cf_tunnel_id,
                cf_tunnel_name=request.cf_tunnel_name,
                cloudflared_config_path=request.cloudflared_config_path,
                is_active=True
            )
            session.add(domain_record)

        await session.commit()
        await session.refresh(domain_record)

        return {
            "success": True,
            "message": "Cấu hình đã được lưu thành công",
            "domain_id": domain_record.id,
            "domain": domain_record.domain
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Lỗi khi lưu vào database: {str(e)}"
        }
