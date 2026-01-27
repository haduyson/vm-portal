import random
import string
from typing import Tuple
import yaml


class CloudInitGenerator:
    """Generate cloud-init configuration for VMs."""

    @staticmethod
    def generate_credentials() -> Tuple[str, str]:
        """Generate random SSH username and password."""
        username = f"vm-user-{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}"
        password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
        return username, password

    @staticmethod
    def generate_user_data(vm_name: str, username: str, password: str) -> str:
        """Generate cloud-init user-data YAML configuration."""
        config = {
            "#cloud-config": None,
            "hostname": vm_name,
            "manage_etc_hosts": True,
            "users": [
                {
                    "name": username,
                    "sudo": "ALL=(ALL) NOPASSWD:ALL",
                    "shell": "/bin/bash",
                    "lock_passwd": False,
                }
            ],
            "password": password,
            "chpasswd": {
                "expire": False,
                "list": [f"{username}:{password}"],
            },
            "ssh_pwauth": True,
            "package_update": True,
            "packages": [
                "openssh-server",
                "curl",
                "wget",
                "qemu-guest-agent",
            ],
            "runcmd": [
                "systemctl enable ssh",
                "systemctl start ssh",
                "systemctl enable qemu-guest-agent",
                "systemctl start qemu-guest-agent",
            ],
        }

        # Convert to YAML with cloud-config header
        yaml_content = "#cloud-config\n"
        # Remove the None value from #cloud-config key
        config_without_header = {k: v for k, v in config.items() if k != "#cloud-config"}
        yaml_content += yaml.dump(config_without_header, default_flow_style=False, allow_unicode=True)

        return yaml_content

    @staticmethod
    def save_to_snippets(vmid: int, user_data: str) -> str:
        """
        Save cloud-init configuration to Proxmox snippets directory.
        Returns the filename.

        Note: In production, this should write to /var/lib/vz/snippets/
        via SSH or Proxmox API. For Docker, mount the directory.
        """
        filename = f"{vmid}-cloud-init.yml"
        # TODO: Implement actual file writing to Proxmox host
        # For now, return the filename that should be created
        return filename
