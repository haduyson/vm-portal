from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.models.audit_log_model import AuditLog
from app.schemas.audit_log_schemas import AuditLogResponse

router = APIRouter(prefix="/admin", tags=["admin-audit"])


@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get audit logs (admin only)."""
    result = await session.execute(
        select(AuditLog, User.username)
        .join(User, AuditLog.admin_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
    )

    rows = result.all()
    return [
        AuditLogResponse(
            id=log.id,
            admin_username=username,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            details=log.details,
            created_at=log.created_at,
        )
        for log, username in rows
    ]
