import random
import string
from typing import Tuple
import yaml


class CloudInitGenerator:
    """Generate cloud-init configuration for VMs."""

    @staticmethod
    def generate_credentials() -> Tuple[str, str]:
        """Generate SSH credentials with root as default username."""
        username = "root"
        password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
        return username, password

    @staticmethod
    def generate_user_data(vm_name: str, username: str, password: str) -> str:
        """Generate cloud-init user-data YAML configuration."""
        config = {
            "#cloud-config": None,
            "hostname": vm_name,
            "manage_etc_hosts": True,
            "disable_root": False,  # Enable root login
            "chpasswd": {
                "expire": False,
                "list": [f"root:{password}"],
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
                # Ensure SSH is configured for password auth and root login
                "mkdir -p /etc/ssh/sshd_config.d",
                "echo -e 'PasswordAuthentication yes\\nPermitRootLogin yes' > /etc/ssh/sshd_config.d/70-vpscloud.conf",
                # Also modify main config for older systems without sshd_config.d
                "sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config",
                "sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config",
                # Enable and restart SSH (try both ssh and sshd for different distros)
                "systemctl enable ssh || systemctl enable sshd || true",
                "systemctl restart ssh || systemctl restart sshd || true",
                # QEMU Guest Agent
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

    SNIPPETS_DIR = "/var/lib/vz/snippets"

    @classmethod
    def save_to_snippets(cls, vmid: int, user_data: str) -> str:
        """
        Save cloud-init configuration to Proxmox snippets directory.
        Returns the filename (without path).
        """
        import os
        filename = f"{vmid}-cloud-init.yml"
        filepath = os.path.join(cls.SNIPPETS_DIR, filename)

        os.makedirs(cls.SNIPPETS_DIR, exist_ok=True)
        with open(filepath, "w") as f:
            f.write(user_data)

        return filename

    @classmethod
    def delete_from_snippets(cls, vmid: int) -> bool:
        """Delete cloud-init snippet file for a VM."""
        import os
        filename = f"{vmid}-cloud-init.yml"
        filepath = os.path.join(cls.SNIPPETS_DIR, filename)

        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                return True
        except Exception:
            pass
        return False
