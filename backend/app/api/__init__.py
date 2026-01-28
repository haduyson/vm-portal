import importlib
from app.api.auth_endpoints import router as auth_router
from app.api.vm_endpoints import router as vm_router
from app.api.vm_endpoints import proxmox_servers_public_router
from app.api.vm_endpoints import os_templates_public_router
from app.api.health_endpoints import router as health_router
from app.api.admin_user_endpoints import router as admin_user_router
from app.api.admin_vm_endpoints import router as admin_vm_router
from app.api.admin_settings_endpoints import router as admin_settings_router
from app.api.admin_audit_endpoints import router as admin_audit_router
from app.api.public_settings_endpoints import router as public_settings_router
from app.api.vm_network_endpoints import router as vm_network_router

_admin_proxmox_mod = importlib.import_module("app.api.admin-proxmox-server-endpoints")
admin_proxmox_server_router = _admin_proxmox_mod.router

_admin_os_template_mod = importlib.import_module("app.api.admin-os-template-endpoints")
admin_os_template_router = _admin_os_template_mod.router

_vnc_ws_mod = importlib.import_module("app.api.vnc-websocket-proxy-endpoint")
vnc_websocket_router = _vnc_ws_mod.router

_admin_cf_domain_mod = importlib.import_module("app.api.admin-cloudflare-domain-endpoints")
admin_cloudflare_domain_router = _admin_cf_domain_mod.router

__all__ = [
    "auth_router",
    "vm_router",
    "health_router",
    "admin_user_router",
    "admin_vm_router",
    "admin_settings_router",
    "admin_audit_router",
    "public_settings_router",
    "vm_network_router",
    "admin_proxmox_server_router",
    "proxmox_servers_public_router",
    "os_templates_public_router",
    "admin_os_template_router",
    "vnc_websocket_router",
    "admin_cloudflare_domain_router",
]
