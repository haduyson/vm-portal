from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.settings_schemas import PublicFeaturesResponse
from app.services.system_settings_service import get_setting

router = APIRouter(prefix="/settings", tags=["public-settings"])


@router.get("/public-features", response_model=PublicFeaturesResponse)
async def get_public_features(
    session: AsyncSession = Depends(get_session),
):
    """Get publicly visible feature flags (no auth required)."""
    novnc = await get_setting(session, "feature_novnc_console")
    tfa = await get_setting(session, "feature_2fa_required")

    return PublicFeaturesResponse(
        feature_novnc_console=(novnc or "false").lower() == "true",
        feature_2fa_required=(tfa or "false").lower() == "true",
    )
