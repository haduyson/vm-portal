from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log_model import AuditLog


async def log_audit(
    session: AsyncSession,
    admin_id: int,
    action: str,
    target_type: str,
    target_id: int = None,
    details: str = None,
):
    """Helper function to log admin actions."""
    audit_log = AuditLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
    )
    session.add(audit_log)
    await session.commit()
