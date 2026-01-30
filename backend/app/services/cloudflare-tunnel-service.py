import re
import yaml
import aiohttp
from typing import Optional, List, Dict, Any
from app.config import settings


class CloudflareTunnelService:
    """Manage Cloudflare Tunnel DNS records and tunnel ingress config via API."""

    def __init__(
        self,
        api_token: Optional[str] = None,
        zone_id: Optional[str] = None,
        tunnel_id: Optional[str] = None,
        tunnel_name: Optional[str] = None,
        base_domain: Optional[str] = None,
        config_path: Optional[str] = None,
        account_id: Optional[str] = None,
    ):
        self.api_token = api_token or settings.CF_API_TOKEN
        self.zone_id = zone_id or settings.CF_ZONE_ID
        self.tunnel_id = tunnel_id or settings.CF_TUNNEL_ID
        self.tunnel_name = tunnel_name or settings.CF_TUNNEL_NAME
        self.base_domain = base_domain or settings.CF_BASE_DOMAIN
        self.config_path = config_path or settings.CF_CLOUDFLARED_CONFIG_PATH
        self.account_id = account_id  # Will be fetched from zone if not provided
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

    async def _create_dns_cname(self, subdomain: str, comment: str = None) -> dict:
        """Create CNAME DNS record pointing to tunnel."""
        full_domain = self._full_domain(subdomain)
        tunnel_target = f"{self.tunnel_id}.cfargotunnel.com"
        url = f"{self._cf_api}/zones/{self.zone_id}/dns_records"
        payload = {
            "type": "CNAME",
            "name": full_domain,
            "content": tunnel_target,
            "proxied": True,
            "comment": comment or f"VM tunnel - {subdomain}",
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

    async def _get_account_id(self) -> str:
        """Get Cloudflare account ID from zone info."""
        if self.account_id:
            return self.account_id
        url = f"{self._cf_api}/zones/{self.zone_id}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=self._headers) as resp:
                data = await resp.json()
                if not data.get("success"):
                    raise Exception(f"Failed to get zone info: {data.get('errors')}")
                self.account_id = data["result"]["account"]["id"]
                return self.account_id

    async def _get_tunnel_config(self) -> Dict[str, Any]:
        """Get current tunnel configuration from Cloudflare API."""
        account_id = await self._get_account_id()
        url = f"{self._cf_api}/accounts/{account_id}/cfd_tunnel/{self.tunnel_id}/configurations"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=self._headers) as resp:
                data = await resp.json()
                if not data.get("success"):
                    raise Exception(f"Failed to get tunnel config: {data.get('errors')}")
                return data["result"]["config"]

    async def _update_tunnel_config(self, config: Dict[str, Any]) -> bool:
        """Update tunnel configuration via Cloudflare API."""
        account_id = await self._get_account_id()
        url = f"{self._cf_api}/accounts/{account_id}/cfd_tunnel/{self.tunnel_id}/configurations"
        payload = {"config": config}
        async with aiohttp.ClientSession() as session:
            async with session.put(url, headers=self._headers, json=payload) as resp:
                data = await resp.json()
                if not data.get("success"):
                    raise Exception(f"Failed to update tunnel config: {data.get('errors')}")
                print(f"Tunnel config updated to version {data['result']['version']}")
                return True

    async def _add_ingress_to_tunnel(self, hostname: str, service_url: str):
        """Add ingress entry to tunnel config via API."""
        config = await self._get_tunnel_config()
        ingress = config.get("ingress", [])

        # Remove existing entry for this hostname if any
        ingress = [e for e in ingress if e.get("hostname") != hostname]

        # Find catch-all (entry without hostname) and insert before it
        new_entry = {"hostname": hostname, "service": service_url}
        catch_all_idx = next((i for i, e in enumerate(ingress) if "hostname" not in e), len(ingress))
        ingress.insert(catch_all_idx, new_entry)

        # Ensure catch-all exists
        if not any("hostname" not in e for e in ingress):
            ingress.append({"service": "http_status:404"})

        config["ingress"] = ingress
        await self._update_tunnel_config(config)

    async def _remove_ingress_from_tunnel(self, hostname: str):
        """Remove ingress entry from tunnel config via API."""
        config = await self._get_tunnel_config()
        ingress = config.get("ingress", [])

        # Remove entry with matching hostname
        config["ingress"] = [e for e in ingress if e.get("hostname") != hostname]

        # Ensure catch-all exists
        if not any("hostname" not in e for e in config["ingress"]):
            config["ingress"].append({"service": "http_status:404"})

        await self._update_tunnel_config(config)

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

    def _add_ingress_entry(self, subdomain: str, target_ip: str, service_type: str = "ssh"):
        """Add ingress entry to cloudflared config.
        service_type: 'ssh' or 'http'
        """
        config = self._read_config()
        ingress = config.get("ingress", [])
        full_domain = self._full_domain(subdomain)

        # Remove existing entry for this hostname if any
        ingress = [
            entry for entry in ingress
            if entry.get("hostname") != full_domain
        ]

        # Build service URL based on type
        if service_type == "http":
            service_url = f"http://{target_ip}:80"
        else:
            service_url = f"ssh://{target_ip}:22"

        # Insert before the catch-all (last entry)
        new_entry = {
            "hostname": full_domain,
            "service": service_url,
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
        """Full setup: create DNS CNAME + add SSH ingress via API."""
        full_domain = self._full_domain(subdomain)
        await self._create_dns_cname(subdomain, f"VM SSH tunnel - {subdomain}")
        await self._add_ingress_to_tunnel(full_domain, f"ssh://{target_ip}:22")

    async def add_http_ingress(self, subdomain: str, target_ip: str):
        """Full setup: create DNS CNAME + add HTTP ingress via API."""
        full_domain = self._full_domain(subdomain)
        await self._create_dns_cname(subdomain, f"VM Web - {subdomain}")
        await self._add_ingress_to_tunnel(full_domain, f"http://{target_ip}:80")

    async def remove_ssh_ingress(self, subdomain: str):
        """Full teardown: remove ingress via API + delete DNS."""
        full_domain = self._full_domain(subdomain)
        await self._remove_ingress_from_tunnel(full_domain)
        await self._delete_dns_cname(subdomain)

    # Keep local config methods for backward compatibility but they're not used with remote management
    async def reload_cloudflared(self):
        """Restart cloudflared service (not needed with remote management)."""
        # With remote management, cloudflared automatically picks up config changes
        # This is kept for backward compatibility but is essentially a no-op now
        pass
