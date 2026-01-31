"""Network configuration generator for Proxmox VMs."""


def generate_net0_config(
    bridge_name: str,
    vlan_tags: list[int] | None = None,
    mac_address: str | None = None,
) -> str:
    """Generate Proxmox net0 parameter string.

    Args:
        bridge_name: Network bridge name (e.g., vmbr0)
        vlan_tags: List of VLAN tags. Single = access mode, multiple = trunk mode
        mac_address: Optional MAC address (auto-generated if None)

    Returns:
        net0 config string for Proxmox API (e.g., "virtio,bridge=vmbr0,tag=100")

    Examples:
        >>> generate_net0_config("vmbr0")
        'virtio,bridge=vmbr0'
        >>> generate_net0_config("vmbr0", [100])
        'virtio,bridge=vmbr0,tag=100'
        >>> generate_net0_config("vmbr0", [10, 20, 30])
        'virtio,bridge=vmbr0,trunks=10;20;30'
    """
    # Base config
    if mac_address:
        base = f"virtio={mac_address},bridge={bridge_name}"
    else:
        base = f"virtio,bridge={bridge_name}"

    # No VLANs - simple bridge connection
    if not vlan_tags:
        return base

    # Single VLAN - access mode (untagged traffic on this VLAN)
    if len(vlan_tags) == 1:
        return f"{base},tag={vlan_tags[0]}"

    # Multiple VLANs - trunk mode (tagged traffic for all VLANs)
    # Proxmox uses semicolon separator for trunks parameter
    trunks = ";".join(map(str, vlan_tags))
    return f"{base},trunks={trunks}"


def generate_ipconfig0(
    ip_address: str | None = None,
    subnet_mask: str = "255.255.255.0",
    gateway: str | None = None,
) -> str:
    """Generate cloud-init ipconfig0 parameter.

    Args:
        ip_address: Static IP or None for DHCP
        subnet_mask: Subnet mask (default 255.255.255.0 = /24)
        gateway: Gateway IP or None

    Returns:
        ipconfig0 config string for Proxmox cloud-init
    """
    if not ip_address:
        return "ip=dhcp"

    # Convert subnet mask to CIDR notation
    cidr = _netmask_to_cidr(subnet_mask)
    config = f"ip={ip_address}/{cidr}"

    if gateway:
        config += f",gw={gateway}"

    return config


def _netmask_to_cidr(netmask: str) -> int:
    """Convert subnet mask to CIDR notation."""
    netmask_map = {
        "255.255.255.255": 32,
        "255.255.255.254": 31,
        "255.255.255.252": 30,
        "255.255.255.248": 29,
        "255.255.255.240": 28,
        "255.255.255.224": 27,
        "255.255.255.192": 26,
        "255.255.255.128": 25,
        "255.255.255.0": 24,
        "255.255.254.0": 23,
        "255.255.252.0": 22,
        "255.255.248.0": 21,
        "255.255.240.0": 20,
        "255.255.224.0": 19,
        "255.255.192.0": 18,
        "255.255.128.0": 17,
        "255.255.0.0": 16,
        "255.254.0.0": 15,
        "255.252.0.0": 14,
        "255.248.0.0": 13,
        "255.240.0.0": 12,
        "255.224.0.0": 11,
        "255.192.0.0": 10,
        "255.128.0.0": 9,
        "255.0.0.0": 8,
    }
    return netmask_map.get(netmask, 24)
