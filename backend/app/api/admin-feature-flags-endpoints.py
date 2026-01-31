"""Admin endpoints for managing global and user-level feature flags."""
import importlib
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin_user
from app.database import get_session
from app.models.user_model import User
from app.api.admin_shared_helpers import log_audit

_ff_service = importlib.import_module("app.services.feature-flag-resolution-service")
FeatureFlagService = _ff_service.FeatureFlagService
FEATURE_DEFAULTS = _ff_service.FEATURE_DEFAULTS

_ff_schemas = importlib.import_module("app.schemas.feature-flag-schemas")
FeatureFlagsUpdate = _ff_schemas.FeatureFlagsUpdate
FeatureFlagsResponse = _ff_schemas.FeatureFlagsResponse
GlobalFlagsResponse = _ff_schemas.GlobalFlagsResponse

router = APIRouter(prefix="/admin/feature-flags", tags=["admin-feature-flags"])


@router.get("/global", response_model=GlobalFlagsResponse)
async def get_global_flags(
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get global feature flag settings (admin only)."""
    stored_flags = await FeatureFlagService.get_global_flags(session)
    # Merge with defaults to show all flags
    all_flags = {**FEATURE_DEFAULTS, **stored_flags}
    return GlobalFlagsResponse(flags=all_flags)


@router.put("/global", response_model=GlobalFlagsResponse)
async def update_global_flags(
    data: FeatureFlagsUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update global feature flags (admin only)."""
    current = await FeatureFlagService.get_global_flags(session)
    updated = {**current}

    changes = []
    for key, value in data.model_dump(exclude_none=True).items():
        updated[key] = value
        changes.append(f"{key}={value}")

    await FeatureFlagService.set_global_flags(session, updated)

    if changes:
        await log_audit(
            session, admin.id, "update_global_feature_flags", "system", None,
            ", ".join(changes)
        )

    all_flags = {**FEATURE_DEFAULTS, **updated}
    return GlobalFlagsResponse(flags=all_flags)


@router.get("/users/{user_id}", response_model=FeatureFlagsResponse)
async def get_user_flags(
    user_id: int,
    _admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Get user-level feature flags with resolved values (admin only)."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    global_flags = await FeatureFlagService.get_global_flags(session)
    user_flags = user.feature_flags or {}

    resolved = FeatureFlagService.resolve_all_flags(global_flags, user_flags)
    sources = FeatureFlagService.get_all_sources(global_flags, user_flags)

    return FeatureFlagsResponse(flags=resolved, sources=sources)


@router.put("/users/{user_id}", response_model=FeatureFlagsResponse)
async def update_user_flags(
    user_id: int,
    data: FeatureFlagsUpdate,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update user-level feature flags (admin only)."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    current = user.feature_flags or {}
    changes = []

    for key, value in data.model_dump(exclude_none=True).items():
        current[key] = value
        changes.append(f"{key}={value}")

    user.feature_flags = current
    await session.commit()

    if changes:
        await log_audit(
            session, admin.id, "update_user_feature_flags", "user", user_id,
            ", ".join(changes)
        )

    global_flags = await FeatureFlagService.get_global_flags(session)
    resolved = FeatureFlagService.resolve_all_flags(global_flags, current)
    sources = FeatureFlagService.get_all_sources(global_flags, current)

    return FeatureFlagsResponse(flags=resolved, sources=sources)


@router.delete("/users/{user_id}/{feature}")
async def reset_user_flag(
    user_id: int,
    feature: str,
    admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove user-level override for a feature, inheriting from global (admin only)."""
    if feature not in FEATURE_DEFAULTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown feature: {feature}"
        )

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    current = user.feature_flags or {}
    if feature in current:
        del current[feature]
        user.feature_flags = current
        await session.commit()

        await log_audit(
            session, admin.id, "reset_user_feature_flag", "user", user_id,
            f"Reset {feature} to inherit from global"
        )

    return {"message": f"{feature} reset to inherit from global"}
