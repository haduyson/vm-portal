"""3-level feature flag resolution: VM > User > Global > Default."""
import json
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession


# Default values for all features
FEATURE_DEFAULTS = {
    "cloudflare_tunnel_enabled": True,
    "public_ip_enabled": True,
    "email_notifications_enabled": True,
    "telegram_notifications_enabled": True,
}


class FeatureFlagService:
    """3-level feature flag resolution: VM > User > Global > Default."""

    @staticmethod
    async def get_global_flags(session: AsyncSession) -> dict:
        """Get global feature flags from system settings."""
        from app.services.system_settings_service import get_setting

        flags_json = await get_setting(session, "global_feature_flags")
        if flags_json:
            try:
                return json.loads(flags_json)
            except json.JSONDecodeError:
                pass
        return {}

    @staticmethod
    async def set_global_flags(session: AsyncSession, flags: dict) -> None:
        """Set global feature flags."""
        from app.services.system_settings_service import set_setting

        await set_setting(session, "global_feature_flags", json.dumps(flags))

    @staticmethod
    def resolve_flag(
        feature: str,
        global_flags: Optional[dict] = None,
        user_flags: Optional[dict] = None,
        vm_flags: Optional[dict] = None,
    ) -> bool:
        """Resolve feature flag value. VM > User > Global > Default."""
        # Level 3: VM override
        if vm_flags and feature in vm_flags:
            return bool(vm_flags[feature])

        # Level 2: User override
        if user_flags and feature in user_flags:
            return bool(user_flags[feature])

        # Level 1: Global setting
        if global_flags and feature in global_flags:
            return bool(global_flags[feature])

        # Default
        return FEATURE_DEFAULTS.get(feature, True)

    @staticmethod
    def resolve_all_flags(
        global_flags: Optional[dict] = None,
        user_flags: Optional[dict] = None,
        vm_flags: Optional[dict] = None,
    ) -> dict:
        """Resolve all feature flags."""
        result = {}
        for feature in FEATURE_DEFAULTS:
            result[feature] = FeatureFlagService.resolve_flag(
                feature, global_flags, user_flags, vm_flags
            )
        return result

    @staticmethod
    def get_flag_source(
        feature: str,
        global_flags: Optional[dict] = None,
        user_flags: Optional[dict] = None,
        vm_flags: Optional[dict] = None,
    ) -> str:
        """Get which level sets the flag value (for UI display)."""
        if vm_flags and feature in vm_flags:
            return "vm"
        if user_flags and feature in user_flags:
            return "user"
        if global_flags and feature in global_flags:
            return "global"
        return "default"

    @staticmethod
    def get_all_sources(
        global_flags: Optional[dict] = None,
        user_flags: Optional[dict] = None,
        vm_flags: Optional[dict] = None,
    ) -> dict:
        """Get sources for all feature flags."""
        return {
            feature: FeatureFlagService.get_flag_source(
                feature, global_flags, user_flags, vm_flags
            )
            for feature in FEATURE_DEFAULTS
        }

    @staticmethod
    async def check_feature(
        session: AsyncSession,
        feature: str,
        user=None,
        vm=None,
    ) -> bool:
        """Convenience method to check a single feature."""
        global_flags = await FeatureFlagService.get_global_flags(session)
        user_flags = getattr(user, "feature_flags", None) if user else None
        vm_flags = getattr(vm, "feature_flags", None) if vm else None
        return FeatureFlagService.resolve_flag(feature, global_flags, user_flags, vm_flags)

    @staticmethod
    def get_defaults() -> dict:
        """Return default feature flag values."""
        return FEATURE_DEFAULTS.copy()
