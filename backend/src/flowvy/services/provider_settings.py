"""Business logic for provider settings."""

from __future__ import annotations

from redis.asyncio import Redis

from flowvy.config import Settings
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.provider_settings import (
    BeszelTestResponse,
    KumaTestResponse,
    ProviderSettingsPatch,
    ProviderSettingsResponse,
    TributeTestResponse,
)
from flowvy.services.beszel import BeszelClient, BeszelError
from flowvy.services.kuma import KumaError, UptimeKumaClient
from flowvy.services.pulse import CACHE_KEY
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError
from flowvy.services.tribute import TributeClient, TributeError

PULSE_FIELDS = frozenset({"pulse_provider", "kuma_url", "kuma_slug", "beszel_url"})


class ProviderSettingsError(ValueError):
    """Raised when merged provider settings are inconsistent."""


class ProviderSettingsService:
    """Manages provider settings CRUD and integration checks."""

    def __init__(
        self,
        repo: ProviderSettingsRepository,
        remnawave: RemnawaveClient,
        kuma: UptimeKumaClient,
        beszel: BeszelClient,
        tribute: TributeClient,
        redis: Redis,
        config: Settings,
    ) -> None:
        self._repo = repo
        self._remnawave = remnawave
        self._kuma = kuma
        self._beszel = beszel
        self._tribute = tribute
        self._redis = redis
        self._config = config

    async def get(self) -> ProviderSettingsResponse:
        """Return current settings with system info."""
        row = await self._repo.get()
        version = await self._get_remnawave_version()
        return ProviderSettingsResponse(
            pulse_provider=row.pulse_provider,
            kuma_url=row.kuma_url,
            kuma_slug=row.kuma_slug,
            beszel_url=row.beszel_url,
            beszel_credentials_configured=self._beszel.credentials_configured,
            tribute_credentials_configured=self._tribute.credentials_configured,
            tribute_entitlement_execution_enabled=(
                self._config.tribute_entitlement_execution_enabled
            ),
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
        if PULSE_FIELDS.intersection(data):
            current = await self._repo.get()
            provider = data.get("pulse_provider", current.pulse_provider)
            kuma_url = data.get("kuma_url", current.kuma_url)
            kuma_slug = data.get("kuma_slug", current.kuma_slug)
            beszel_url = data.get("beszel_url", current.beszel_url)
            if provider == "kuma" and (not kuma_url or not kuma_slug):
                raise ProviderSettingsError("Kuma URL and slug are required when Pulse is enabled")
            if provider == "kuma":
                try:
                    await self._kuma.validate_target(kuma_url, kuma_slug)
                except KumaError as exc:
                    raise ProviderSettingsError(exc.detail) from exc
            if provider == "beszel" and not beszel_url:
                raise ProviderSettingsError("Beszel URL is required when Pulse uses Beszel")
            if provider == "beszel" and not self._beszel.credentials_configured:
                raise ProviderSettingsError("Beszel credentials are not configured")
            if provider == "beszel":
                try:
                    await self._beszel.validate_target(beszel_url)
                except BeszelError as exc:
                    raise ProviderSettingsError(exc.detail) from exc
        await self._repo.update_partial(data)
        if PULSE_FIELDS.intersection(data):
            await self._redis.delete(CACHE_KEY)
        return await self.get()

    async def test_kuma(self) -> KumaTestResponse:
        """Test connection to Uptime Kuma status page."""
        row = await self._repo.get()
        return await self.test_kuma_candidate(row.kuma_url, row.kuma_slug)

    async def test_kuma_candidate(
        self,
        url: str | None,
        slug: str | None,
    ) -> KumaTestResponse:
        """Test an unsaved Kuma target without changing provider settings."""
        if not url or not slug:
            return KumaTestResponse(ok=False, error="URL and slug are required")
        try:
            await self._kuma.get_status_page(url, slug)
            return KumaTestResponse(ok=True)
        except KumaError as exc:
            return KumaTestResponse(ok=False, error=exc.detail)

    async def test_beszel(self) -> BeszelTestResponse:
        """Test authentication and read access to the saved Beszel Hub."""
        row = await self._repo.get()
        return await self.test_beszel_candidate(row.beszel_url)

    async def test_beszel_candidate(self, url: str | None) -> BeszelTestResponse:
        """Test an unsaved Beszel target without changing provider settings."""
        if not url:
            return BeszelTestResponse(ok=False, error="URL is required")
        try:
            await self._beszel.test_connection(url)
            return BeszelTestResponse(ok=True)
        except BeszelError as exc:
            return BeszelTestResponse(ok=False, error=exc.detail)

    async def test_tribute(self) -> TributeTestResponse:
        """Validate server-side Tribute API access without creating a payment."""
        try:
            await self._tribute.test_connection()
            return TributeTestResponse(ok=True)
        except TributeError as exc:
            return TributeTestResponse(ok=False, error=exc.detail)

    async def _get_remnawave_version(self) -> str | None:
        """Fetch Remnawave version from /api/system/metadata."""
        try:
            data = await self._remnawave.get_metadata()
            return data.get("version")
        except (RemnawaveError, Exception):
            return None
