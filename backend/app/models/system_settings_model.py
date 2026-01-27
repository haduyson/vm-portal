from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base


class SystemSetting(Base):
    """System-wide configuration settings stored in database."""
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(String, nullable=True)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
