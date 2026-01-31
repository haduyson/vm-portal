import importlib
from app.models.user_model import User
from app.models.virtual_machine_model import VirtualMachine
from app.models.audit_log_model import AuditLog
from app.models.system_settings_model import SystemSetting
from app.models.refresh_token_model import RefreshToken
from app.models.proxmox_server_model import ProxmoxServer
from app.models.os_template_model import OsTemplate

# Import kebab-case models via importlib
_cf_domain_model = importlib.import_module("app.models.cloudflare-domain-model")
CloudflareDomain = _cf_domain_model.CloudflareDomain

_network_bridge_model = importlib.import_module("app.models.network-bridge-model")
NetworkBridge = _network_bridge_model.NetworkBridge

_user_ip_address_model = importlib.import_module("app.models.user-ip-address-model")
UserIpAddress = _user_ip_address_model.UserIpAddress

__all__ = [
    "User",
    "VirtualMachine",
    "AuditLog",
    "SystemSetting",
    "RefreshToken",
    "ProxmoxServer",
    "OsTemplate",
    "CloudflareDomain",
    "NetworkBridge",
    "UserIpAddress",
]
