from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSON
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    telegram_chat_id = Column(String, nullable=True)
    email = Column(String(255), nullable=True)
    is_email_verified = Column(Boolean, default=False, nullable=False)
    notification_preference = Column(String(20), default="telegram", nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    is_suspended = Column(Boolean, default=False, nullable=False)
    max_disk_gb = Column(Integer, nullable=True)  # null = unlimited
    max_ram_gb = Column(Integer, nullable=True)  # null = unlimited
    max_vms = Column(Integer, nullable=True)  # null = unlimited
    max_cpu_cores = Column(Integer, nullable=True)  # null = unlimited
    totp_secret = Column(String, nullable=True)  # null = 2FA not enabled
    temp_password_expires_at = Column(DateTime, nullable=True)  # null = no temp password
    feature_flags = Column(JSON, nullable=True)  # User-level feature toggles
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
