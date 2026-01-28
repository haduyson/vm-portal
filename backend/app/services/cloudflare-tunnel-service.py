import re
import yaml
import aiohttp
from typing import Optional
from app.config import settings


class CloudflareTunnelService:
    """Manage Cloudflare Tunnel DNS records and cloudflared ingress config."""

    def __init__(
        self,
        api_token: Optional[str] = None,
        zone_id: Optional[str] = None,
        tunnel_id: Optional[str] = None,
        tunnel_name: Optional[str] = None,
        base_domain: Optional[str] = None,
        config_path: Optional[str] = None,
    ):
        self.api_token = api_token or settings.CF_API_TOKEN
        self.zone_id = zone_id or settings.CF_ZONE_ID
        self.tunnel_id = tunnel_id or settings.CF_TUNNEL_ID
        self.tunnel_name = tunnel_name or settings.CF_TUNNEL_NAME
        self.base_domain = base_domain or settings.CF_BASE_DOMAIN
        self.config_path = config_path or settings.CF_CLOUDFLARED_CONFIG_PATH
        self._headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        self._cf_api = "https://api.cloudflare.com/client/v4"

    def _full_domain(self, subdomain: str) -> str:
        return f"{subdomain}.{self.base_domain}"

    SUBDOMAIN_PATTERN = re.compile(r'^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$')
    RESERVED_SUBDOMAINS = frozenset({
        "www", "api", "admin", "mail", "smtp", "imap", "pop",
        "ftp", "ssh", "vpn", "dns", "ns1", "ns2", "mx",
        "dc", "vpscloud", "portal", "app", "dashboard",
        "test", "staging", "dev", "prod", "cdn", "static",
    })

    @classmethod
    def validate_subdomain(cls, subdomain: str) -> tuple[bool, str]:
        """Validate subdomain format and check reserved names.
        Returns (valid, error_message).
        """
        if not cls.SUBDOMAIN_PATTERN.match(subdomain):
            return False, "Định dạng không hợp lệ (3-30 ký tự, chữ thường, số, gạch ngang)"
        if subdomain in cls.RESERVED_SUBDOMAINS:
            return False, f"Subdomain '{subdomain}' là tên hệ thống đã được đặt trước"
        return True, ""

    async def is_subdomain_available(self, subdomain: str) -> bool:
        """Check if subdomain is available (no existing DNS record)."""
        full_domain = self._full_domain(subdomain)
        url = (
            f"{self._cf_api}/zones/{self.zone_id}/dns_records"
            f"?type=CNAME&name={full_domain}"
        )
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=self._headers) as resp:
                data = await resp.json()
                if not data.get("success"):
                    raise Exception(f"Cloudflare API error: {data.get('errors')}")
                return len(data.get("result", [])) == 0

    async def _create_dns_cname(self, subdomain: str) -> dict:
        """Create CNAME DNS record pointing to tunnel."""
        full_domain = self._full_domain(subdomain)
        tunnel_target = f"{self.tunnel_id}.cfargotunnel.com"
        url = f"{self._cf_api}/zones/{self.zone_id}/dns_records"
        payload = {
            "type": "CNAME",
            "name": full_domain,
            "content": tunnel_target,
            "proxied": True,
            "comment": f"VM SSH tunnel - {subdomain}",
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=self._headers, json=payload) as resp:
                data = await resp.json()
                if not data.get("success"):
                    raise Exception(f"Failed to create DNS: {data.get('errors')}")
                return data.get("result", {})

    async def _delete_dns_cname(self, subdomain: str) -> bool:
        """Delete CNAME DNS record for subdomain."""
        full_domain = self._full_domain(subdomain)
        # First find the record ID
        list_url = (
            f"{self._cf_api}/zones/{self.zone_id}/dns_records"
            f"?type=CNAME&name={full_domain}"
        )
        async with aiohttp.ClientSession() as session:
            async with session.get(list_url, headers=self._headers) as resp:
                data = await resp.json()
                records = data.get("result", [])
                if not records:
                    return True  # Already gone

            record_id = records[0]["id"]
            del_url = f"{self._cf_api}/zones/{self.zone_id}/dns_records/{record_id}"
            async with session.delete(del_url, headers=self._headers) as resp:
                data = await resp.json()
                return data.get("success", False)

    def _read_config(self) -> dict:
        """Read cloudflared config.yml."""
        try:
            with open(self.config_path, "r") as f:
                return yaml.safe_load(f) or {}
        except FileNotFoundError:
            return {
                "tunnel": self.tunnel_id,
                "credentials-file": f"/root/.cloudflared/{self.tunnel_id}.json",
                "ingress": [{"service": "http_status:404"}],
            }

    def _write_config(self, config: dict):
        """Write cloudflared config.yml."""
        with open(self.config_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)

    def _add_ingress_entry(self, subdomain: str, target_ip: str):
        """Add SSH ingress entry to cloudflared config."""
        config = self._read_config()
        ingress = config.get("ingress", [])
        full_domain = self._full_domain(subdomain)

        # Remove existing entry for this hostname if any
        ingress = [
            entry for entry in ingress
            if entry.get("hostname") != full_domain
        ]

        # Insert before the catch-all (last entry)
        new_entry = {
            "hostname": full_domain,
            "service": f"ssh://{target_ip}:22",
        }
        if ingress and "hostname" not in ingress[-1]:
            # Last entry is catch-all, insert before it
            ingress.insert(-1, new_entry)
        else:
            ingress.append(new_entry)
            ingress.append({"service": "http_status:404"})

        config["ingress"] = ingress
        self._write_config(config)

    def _remove_ingress_entry(self, subdomain: str):
        """Remove SSH ingress entry from cloudflared config."""
        config = self._read_config()
        ingress = config.get("ingress", [])
        full_domain = self._full_domain(subdomain)

        config["ingress"] = [
            entry for entry in ingress
            if entry.get("hostname") != full_domain
        ]

        # Ensure catch-all exists
        if not config["ingress"] or "hostname" in config["ingress"][-1]:
            config["ingress"].append({"service": "http_status:404"})

        self._write_config(config)

    async def add_ssh_ingress(self, subdomain: str, target_ip: str):
        """Full setup: create DNS CNAME + add ingress + reload."""
        await self._create_dns_cname(subdomain)
        self._add_ingress_entry(subdomain, target_ip)
        await self.reload_cloudflared()

    async def remove_ssh_ingress(self, subdomain: str):
        """Full teardown: remove ingress + delete DNS + reload."""
        self._remove_ingress_entry(subdomain)
        await self._delete_dns_cname(subdomain)
        await self.reload_cloudflared()

    async def reload_cloudflared(self):
        """Restart cloudflared service to pick up config changes."""
        import asyncio
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "restart", "cloudflared",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            print(f"Warning: cloudflared restart failed: {stderr.decode()}")
