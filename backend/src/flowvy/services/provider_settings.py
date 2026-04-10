"""Business logic for provider settings."""

from __future__ import annotations

import httpx

from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.provider_settings import (
    KumaTestResponse,
    ProviderSettingsPatch,
    ProviderSettingsResponse,
)
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError


class ProviderSettingsService:
    """Manages provider settings CRUD and integration checks."""

    def __init__(
        self,
        repo: ProviderSettingsRepository,
        remnawave: RemnawaveClient,
    ) -> None:
        self._repo = repo
        self._remnawave = remnawave

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
        await self._repo.update_partial(data)
        return await self.get()

    async def test_kuma(self) -> KumaTestResponse:
        """Test connection to Uptime Kuma status page."""
        row = await self._repo.get()
        if not row.kuma_url or not row.kuma_slug:
            return KumaTestResponse(ok=False, error="URL and slug are required")
        url = f"{row.kuma_url.rstrip('/')}/api/status-page/{row.kuma_slug}"
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(5.0),
            ) as client:
                resp = await client.get(url)
            if resp.status_code != 200:
                return KumaTestResponse(
                    ok=False,
                    error=f"HTTP {resp.status_code}",
                )
            resp.json()
            return KumaTestResponse(ok=True)
        except httpx.TimeoutException:
            return KumaTestResponse(ok=False, error="Connection timed out")
        except httpx.ConnectError:
            return KumaTestResponse(ok=False, error="Connection refused")
        except Exception as exc:
            return KumaTestResponse(ok=False, error=str(exc))

    async def _get_remnawave_version(self) -> str | None:
        """Fetch Remnawave version from /api/system/metadata."""
        try:
            data = await self._remnawave.get_metadata()
            return data.get("version")
        except (RemnawaveError, Exception):
            return None
