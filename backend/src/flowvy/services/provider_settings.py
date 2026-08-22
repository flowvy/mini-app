"""Business logic for provider settings."""

from __future__ import annotations

from redis.asyncio import Redis

from flowvy.config import Settings
from flowvy.localization import DEFAULT_LOCALE, dump_locale_map, normalize_locale_map
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.operator_content import OperatorContentLocale
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
BOT_INVITE_MEDIA_FIELDS = frozenset(
    {"bot_invite_media_type", "bot_invite_media_file_id", "bot_invite_media_file_name"}
)


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
        content_locales = normalize_locale_map(
            getattr(row, "content_locales", {}),
            OperatorContentLocale,
        )
        return ProviderSettingsResponse(
            pulse_provider=row.pulse_provider,
            kuma_url=row.kuma_url,
            kuma_slug=row.kuma_slug,
            beszel_url=row.beszel_url,
            beszel_credentials_configured=self._beszel.credentials_configured,
            tribute_credentials_configured=self._tribute.credentials_configured,
            app_name=row.app_name,
            logo_url=row.logo_url,
            welcome_text=row.welcome_text,
            welcome_media_url=row.welcome_media_url,
            welcome_media_type=row.welcome_media_type,
            welcome_media_file_id=row.welcome_media_file_id,
            welcome_media_file_name=row.welcome_media_file_name,
            welcome_button_text=row.welcome_button_text,
            bot_invite_media_type=getattr(row, "bot_invite_media_type", None),
            bot_invite_media_file_id=getattr(row, "bot_invite_media_file_id", None),
            bot_invite_media_file_name=getattr(row, "bot_invite_media_file_name", None),
            content_default_locale=getattr(row, "content_default_locale", DEFAULT_LOCALE),
            content_locales=content_locales,
            tribute_donation_url=row.tribute_donation_url,
            tribute_subscription_urls=row.tribute_subscription_urls,
            remnawave_version=version,
            updated_at=int(row.updated_at.timestamp()),
        )

    async def update(
        self,
        patch: ProviderSettingsPatch,
    ) -> ProviderSettingsResponse:
        """Apply partial update and return refreshed settings."""
        data = patch.model_dump(exclude_unset=True)
        if "content_locales" in data:
            content_locales = normalize_locale_map(
                data["content_locales"] or {},
                OperatorContentLocale,
            )
            data["content_locales"] = dump_locale_map(content_locales)
            current = await self._repo.get()
            default_locale = data.get(
                "content_default_locale",
                getattr(current, "content_default_locale", DEFAULT_LOCALE),
            )
            default_content = content_locales.get(default_locale)
            if default_content is not None:
                data["welcome_text"] = default_content.welcome_text
                data["welcome_button_text"] = default_content.welcome_button_text
        elif {"welcome_text", "welcome_button_text"}.intersection(data):
            current = await self._repo.get()
            default_locale = getattr(current, "content_default_locale", DEFAULT_LOCALE)
            content_locales = normalize_locale_map(
                getattr(current, "content_locales", {}),
                OperatorContentLocale,
            )
            default_content = content_locales.get(default_locale, OperatorContentLocale())
            updates = {
                key: data[key] for key in ("welcome_text", "welcome_button_text") if key in data
            }
            content_locales[default_locale] = default_content.model_copy(update=updates)
            data["content_locales"] = dump_locale_map(content_locales)
        if BOT_INVITE_MEDIA_FIELDS.intersection(data):
            current = await self._repo.get()
            media_file_id = data.get(
                "bot_invite_media_file_id",
                getattr(current, "bot_invite_media_file_id", None),
            )
            media_type = data.get(
                "bot_invite_media_type",
                getattr(current, "bot_invite_media_type", None),
            )
            if media_file_id is None:
                data["bot_invite_media_type"] = None
                data["bot_invite_media_file_name"] = None
            elif media_type not in {"photo", "animation"}:
                raise ProviderSettingsError("Bot invite media type is required")
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
