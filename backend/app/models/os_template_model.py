from sqlalchemy import Boolean, Column, Integer, String
from app.database import Base


class OsTemplate(Base):
    """OS template options for VM creation."""
    __tablename__ = "os_templates"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    os_type_key = Column(String, unique=True, nullable=False, index=True)
    description = Column(String, nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
