"""Business logic for provider settings."""

from __future__ import annotations

from redis.asyncio import Redis

from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.provider_settings import (
    KumaTestResponse,
    ProviderSettingsPatch,
    ProviderSettingsResponse,
)
from flowvy.services.kuma import KumaError, UptimeKumaClient
from flowvy.services.pulse import CACHE_KEY
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError

KUMA_FIELDS = frozenset({"kuma_enabled", "kuma_url", "kuma_slug"})


class ProviderSettingsError(ValueError):
    """Raised when merged provider settings are inconsistent."""


class ProviderSettingsService:
    """Manages provider settings CRUD and integration checks."""

    def __init__(
        self,
        repo: ProviderSettingsRepository,
        remnawave: RemnawaveClient,
        kuma: UptimeKumaClient,
        redis: Redis,
    ) -> None:
        self._repo = repo
        self._remnawave = remnawave
        self._kuma = kuma
        self._redis = redis

    async def get(self) -> ProviderSettingsResponse:
        """Return current settings with system info."""
        row = await self._repo.get()
        version = await self._get_remnawave_version()
        return ProviderSettingsResponse(
            kuma_enabled=row.kuma_enabled,
            kuma_url=row.kuma_url,
            kuma_slug=row.kuma_slug,
            app_name=row.app_name,
            logo_url=row.logo_url,
            welcome_text=row.welcome_text,
            welcome_media_url=row.welcome_media_url,
            welcome_media_type=row.welcome_media_type,
            welcome_media_file_id=row.welcome_media_file_id,
            welcome_media_file_name=row.welcome_media_file_name,
            welcome_button_text=row.welcome_button_text,
            remnawave_version=version,
            updated_at=int(row.updated_at.timestamp()),
        )

    async def update(
        self,
        patch: ProviderSettingsPatch,
    ) -> ProviderSettingsResponse:
        """Apply partial update and return refreshed settings."""
        data = patch.model_dump(exclude_unset=True)
        if KUMA_FIELDS.intersection(data):
            current = await self._repo.get()
            enabled = data.get("kuma_enabled", current.kuma_enabled)
            kuma_url = data.get("kuma_url", current.kuma_url)
            kuma_slug = data.get("kuma_slug", current.kuma_slug)
            if enabled and (not kuma_url or not kuma_slug):
                raise ProviderSettingsError("Kuma URL and slug are required when Pulse is enabled")
            if enabled:
                try:
                    await self._kuma.validate_target(kuma_url, kuma_slug)
                except KumaError as exc:
                    raise ProviderSettingsError(exc.detail) from exc
        await self._repo.update_partial(data)
        if KUMA_FIELDS.intersection(data):
            await self._redis.delete(CACHE_KEY)
        return await self.get()

    async def test_kuma(self) -> KumaTestResponse:
        """Test connection to Uptime Kuma status page."""
        row = await self._repo.get()
        if not row.kuma_url or not row.kuma_slug:
            return KumaTestResponse(ok=False, error="URL and slug are required")
        try:
            await self._kuma.get_status_page(row.kuma_url, row.kuma_slug)
            return KumaTestResponse(ok=True)
        except KumaError as exc:
            return KumaTestResponse(ok=False, error=exc.detail)

    async def _get_remnawave_version(self) -> str | None:
        """Fetch Remnawave version from /api/system/metadata."""
        try:
            data = await self._remnawave.get_metadata()
            return data.get("version")
        except (RemnawaveError, Exception):
            return None
