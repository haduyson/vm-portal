from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from app.database import Base


class VirtualMachine(Base):
    __tablename__ = "virtual_machines"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    proxmox_server_id = Column(
        Integer, ForeignKey("proxmox_servers.id"), nullable=True, index=True
    )
    vmid = Column(Integer, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    cores = Column(Integer, nullable=False)
    memory_mb = Column(Integer, nullable=False)
    disk_gb = Column(Integer, nullable=False)
    os_type = Column(String, default="ubuntu-24.04", nullable=False)
    status = Column(String, default="creating", nullable=False)
    ip_address = Column(String, nullable=True)
    ssh_domain = Column(String, nullable=True)
    web_domain = Column(String, nullable=True)  # HTTP subdomain for web access
    ssh_username = Column(String, nullable=True)
    ssh_password = Column(String, nullable=True)
    proxmox_node = Column(String, nullable=False)
    storage = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
