from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.database import create_tables, AsyncSessionLocal
# Import all models to register them with Base before create_tables()
from app.models import User, VirtualMachine, AuditLog, SystemSetting, RefreshToken, ProxmoxServer, OsTemplate, CloudflareDomain  # noqa: F401
from app.core.security import hash_password
from app.config import settings
from app.api import (
    auth_router,
    vm_router,
    health_router,
    admin_user_router,
    admin_vm_router,
    admin_settings_router,
    admin_audit_router,
    public_settings_router,
    vm_network_router,
    admin_proxmox_server_router,
    proxmox_servers_public_router,
    os_templates_public_router,
    admin_os_template_router,
    vnc_websocket_router,
    admin_cloudflare_domain_router,
    admin_cloudflare_setup_router,
    ssh_console_websocket_router,
    admin_vm_landing_config_router,
    admin_network_bridge_router,
    network_bridges_public_router,
    user_ip_pool_router,
    admin_feature_flags_router,
    admin_notification_templates_router,
)


async def create_default_admin():
    """Create default admin user if not exists."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.username == settings.DEFAULT_ADMIN_USERNAME)
        )
        existing_user = result.scalar_one_or_none()

        if not existing_user:
            admin_user = User(
                username=settings.DEFAULT_ADMIN_USERNAME,
                hashed_password=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
                is_admin=True,
                is_suspended=False
            )
            session.add(admin_user)
            await session.commit()
            print(f"Default admin user '{settings.DEFAULT_ADMIN_USERNAME}' created successfully")
        else:
            print(f"Admin user '{settings.DEFAULT_ADMIN_USERNAME}' already exists")


async def recover_stuck_vms():
    """Recover VMs stuck in creating/installing status after restart."""
    import asyncio
    from app.services.proxmox_client import create_proxmox_service_for_vm

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VirtualMachine).where(
                VirtualMachine.status.in_(["creating", "installing"])
            )
        )
        stuck_vms = result.scalars().all()

        if not stuck_vms:
            return

        print(f"Found {len(stuck_vms)} stuck VMs, checking Proxmox status...")
        for vm in stuck_vms:
            try:
                proxmox = await create_proxmox_service_for_vm(vm, session)
                pve_status = await proxmox.get_vm_status(vm.vmid)
                real_status = pve_status.get("status")

                if real_status == "running":
                    vm.status = "running"
                    print(f"  VM {vm.vmid} ({vm.name}): recovered to running")
                elif real_status == "stopped":
                    vm.status = "stopped"
                    print(f"  VM {vm.vmid} ({vm.name}): recovered to stopped")
                else:
                    vm.status = "error"
                    print(f"  VM {vm.vmid} ({vm.name}): marked as error (proxmox: {real_status})")
            except Exception as e:
                vm.status = "error"
                print(f"  VM {vm.vmid} ({vm.name}): marked as error ({e})")

        await session.commit()
        print(f"Recovered {len(stuck_vms)} stuck VMs")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("Creating database tables...")
    await create_tables()
    print("Database tables created successfully")

    print("Checking default admin user...")
    await create_default_admin()

    print("Recovering stuck VMs...")
    await recover_stuck_vms()

    yield

    print("Shutting down application...")


# Create FastAPI application
app = FastAPI(
    title="VM Portal API",
    description="Internal Vietnamese VM Provisioning Portal",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,  # Disable auto redirect to avoid mixed content issues
)

# Configure CORS - SEC-003: Restrict to specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# Include routers with /api prefix
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(vm_router, prefix="/api")
app.include_router(vm_network_router, prefix="/api")
app.include_router(public_settings_router, prefix="/api")
app.include_router(admin_user_router, prefix="/api")
app.include_router(admin_vm_router, prefix="/api")
app.include_router(admin_settings_router, prefix="/api")
app.include_router(admin_audit_router, prefix="/api")
app.include_router(admin_proxmox_server_router, prefix="/api")
app.include_router(proxmox_servers_public_router, prefix="/api")
app.include_router(os_templates_public_router, prefix="/api")
app.include_router(admin_os_template_router, prefix="/api")
app.include_router(vnc_websocket_router, prefix="/api")
app.include_router(admin_cloudflare_domain_router, prefix="/api")
app.include_router(admin_cloudflare_setup_router, prefix="/api")
app.include_router(ssh_console_websocket_router, prefix="/api")
app.include_router(admin_vm_landing_config_router, prefix="/api")
app.include_router(admin_network_bridge_router, prefix="/api")
app.include_router(network_bridges_public_router, prefix="/api")
app.include_router(user_ip_pool_router, prefix="/api")
app.include_router(admin_feature_flags_router, prefix="/api")
app.include_router(admin_notification_templates_router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "VM Portal API",
        "version": "1.0.0",
        "docs": "/docs",
    }
