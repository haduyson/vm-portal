from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Boolean, Text
from app.database import Base


class CloudflareDomain(Base):
    __tablename__ = "cloudflare_domains"

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, unique=True, nullable=False)  # e.g. "hasonmedia.com"
    cf_api_token = Column(String, nullable=False)
    cf_zone_id = Column(String, nullable=False)
    cf_tunnel_id = Column(String, nullable=False)
    cf_tunnel_name = Column(String, default="vpscloud")
    cloudflared_config_path = Column(String, default="/etc/cloudflared/config.yml")
    setup_notes = Column(Text, nullable=True)  # admin notes
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
