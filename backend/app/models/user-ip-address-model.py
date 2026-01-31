"""User IP address model for tracking user-owned IPs."""
from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship
from app.database import Base


class UserIpAddress(Base):
    """Tracks user-owned public IP addresses for static VM assignment."""

    __tablename__ = "user_ip_addresses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ip_address = Column(String(45), unique=True, nullable=False)  # IPv4 or IPv6
    network_bridge_id = Column(
        Integer, ForeignKey("network_bridges.id", ondelete="CASCADE"), nullable=False
    )
    vm_id = Column(
        Integer, ForeignKey("virtual_machines.id", ondelete="SET NULL"), nullable=True
    )
    subnet_mask = Column(String(20), default="255.255.255.0", nullable=False)
    gateway = Column(String(45), nullable=True)
    is_retained = Column(Boolean, default=False, nullable=False)  # Keep after VM delete
    acquired_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="ip_addresses")
    network_bridge = relationship("NetworkBridge", backref="ip_addresses")
    virtual_machine = relationship("VirtualMachine", backref="assigned_ip")
