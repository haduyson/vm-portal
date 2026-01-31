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

_admin_cf_setup_mod = importlib.import_module("app.api.admin-cloudflare-setup-wizard-endpoints")
admin_cloudflare_setup_router = _admin_cf_setup_mod.router

_ssh_console_ws_mod = importlib.import_module("app.api.ssh-console-websocket-endpoint")
ssh_console_websocket_router = _ssh_console_ws_mod.router

_admin_vm_landing_config_mod = importlib.import_module("app.api.admin-vm-landing-config-endpoints")
admin_vm_landing_config_router = _admin_vm_landing_config_mod.router

_admin_network_bridge_mod = importlib.import_module("app.api.admin-network-bridge-endpoints")
admin_network_bridge_router = _admin_network_bridge_mod.router
network_bridges_public_router = _admin_network_bridge_mod.public_router

_user_ip_pool_mod = importlib.import_module("app.api.user-ip-pool-endpoints")
user_ip_pool_router = _user_ip_pool_mod.router

_admin_feature_flags_mod = importlib.import_module("app.api.admin-feature-flags-endpoints")
admin_feature_flags_router = _admin_feature_flags_mod.router

_admin_notif_templates_mod = importlib.import_module("app.api.admin-notification-templates-endpoints")
admin_notification_templates_router = _admin_notif_templates_mod.router

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
    "admin_cloudflare_setup_router",
    "ssh_console_websocket_router",
    "admin_vm_landing_config_router",
    "admin_network_bridge_router",
    "network_bridges_public_router",
    "user_ip_pool_router",
    "admin_feature_flags_router",
    "admin_notification_templates_router",
]
