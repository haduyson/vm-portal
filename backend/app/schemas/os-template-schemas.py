from typing import Optional
from pydantic import BaseModel


class OsTemplateResponse(BaseModel):
    id: int
    label: str
    os_type_key: str
    description: Optional[str] = None
    is_enabled: bool
    sort_order: int

    class Config:
        from_attributes = True


class OsTemplateUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None
    label: Optional[str] = None
    description: Optional[str] = None


class OsTemplateCreate(BaseModel):
    label: str
    os_type_key: str
    description: Optional[str] = None
    is_enabled: bool = True
    sort_order: int = 0
