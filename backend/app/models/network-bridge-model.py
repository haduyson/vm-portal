"""Network bridge model for Proxmox server bridge configuration."""
from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


class NetworkBridge(Base):
    """Stores available network bridges per Proxmox server with VLAN config."""

    __tablename__ = "network_bridges"

    id = Column(Integer, primary_key=True, index=True)
    proxmox_server_id = Column(
        Integer, ForeignKey("proxmox_servers.id", ondelete="CASCADE"), nullable=False
    )
    bridge_name = Column(String(50), nullable=False)  # vmbr0, vmbr1, etc
    display_name = Column(String(100), nullable=True)  # Human-friendly name
    vlan_min = Column(Integer, nullable=True)  # NULL = no VLAN restriction
    vlan_max = Column(Integer, nullable=True)  # NULL = no VLAN restriction
    is_public_network = Column(Boolean, default=False, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    proxmox_server = relationship("ProxmoxServer", backref="network_bridges")

    __table_args__ = (
        UniqueConstraint(
            "proxmox_server_id", "bridge_name", name="uq_server_bridge_name"
        ),
    )
