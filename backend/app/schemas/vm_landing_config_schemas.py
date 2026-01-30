from pydantic import BaseModel
from typing import Optional


class VmLandingConfig(BaseModel):
    """VM Landing Page Configuration Schema"""
    title: str = "VM CLOUD - HASONTECH"
    logo_url: str = "/static/logo-hasontech.png"
    company_name: str = "CÔNG TY TNHH MỘT THÀNH VIÊN CÔNG NGHỆ HÀ SƠN"
    address: str = "300 Xô Viết Nghệ Tĩnh, P. Cẩm Lệ, TP. Đà Nẵng"
    phone: str = "(0236) 3.507.507"
    email: str = "lienhe@hasontech.vn"
    website: str = "hasontech.vn"
    primary_color: str = "#667eea"
    bg_color: str = "#ffffff"
    message: str = ""


class VmLandingConfigUpdate(BaseModel):
    """VM Landing Page Configuration Update Schema"""
    title: Optional[str] = None
    logo_url: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    primary_color: Optional[str] = None
    bg_color: Optional[str] = None
    message: Optional[str] = None
