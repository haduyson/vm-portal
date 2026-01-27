from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    admin_username: str
    action: str
    target_type: str
    target_id: Optional[int]
    details: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
