from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from app.database import Base


class ProxmoxServer(Base):
    __tablename__ = "proxmox_servers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, default=8006, nullable=False)
    user = Column(String, default="root@pam", nullable=False)
    token_name = Column(String, nullable=False)
    token_value = Column(String, nullable=False)
    # Password for PVE ticket auth (required for VNC console WebSocket)
    password = Column(String, nullable=True)
    node = Column(String, nullable=False)
    # Comma-separated storage names excluded from user VM creation
    excluded_storages = Column(String, nullable=True, default="")
    # Template VM ID for cloud-init based provisioning (clone source)
    cloud_init_template_vmid = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
