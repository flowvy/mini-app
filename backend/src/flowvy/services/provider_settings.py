"""Business logic for provider settings."""

from __future__ import annotations

from redis.asyncio import Redis

from flowvy.config import Settings
from flowvy.localization import DEFAULT_LOCALE, dump_locale_map, normalize_locale_map
from flowvy.repositories.access_profile import AccessProfileRepository
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
from flowvy.services.sponsor import SponsorOfferError, SponsorOfferService
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
        profiles: AccessProfileRepository,
        offers: SponsorOfferService,
    ) -> None:
        self._repo = repo
        self._remnawave = remnawave
        self._kuma = kuma
        self._beszel = beszel
        self._tribute = tribute
        self._redis = redis
        self._config = config
        self._profiles = profiles
        self._offers = offers

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
            invite_share_media_type=row.invite_share_media_type,
            invite_share_media_file_id=row.invite_share_media_file_id,
            invite_share_media_file_name=row.invite_share_media_file_name,
            invite_share_preview_mode=row.invite_share_preview_mode,
            invite_share_allow_user_chats=row.invite_share_allow_user_chats,
            invite_share_allow_bot_chats=row.invite_share_allow_bot_chats,
            invite_share_allow_group_chats=row.invite_share_allow_group_chats,
            invite_share_allow_channel_chats=row.invite_share_allow_channel_chats,
            content_default_locale=getattr(row, "content_default_locale", DEFAULT_LOCALE),
            content_locales=content_locales,
            tribute_donation_url=row.tribute_donation_url,
            tribute_subscription_urls=row.tribute_subscription_urls,
            referral_reward_enabled=row.referral_reward_enabled,
            referral_reward_days=row.referral_reward_days,
            referral_reward_access_profile_id=row.referral_reward_access_profile_id,
            welcome_discount_enabled=row.welcome_discount_enabled,
            welcome_discount_offer_id=row.welcome_discount_offer_id,
            welcome_discount_url=row.welcome_discount_url,
            welcome_discount_percent=row.welcome_discount_percent,
            remnawave_version=version,
            updated_at=int(row.updated_at.timestamp()),
        )

    async def update(
        self,
        patch: ProviderSettingsPatch,
    ) -> ProviderSettingsResponse:
        """Apply partial update and return refreshed settings."""
        data = patch.model_dump(exclude_unset=True)
        await self._validate_referral_configuration(data)
        audience_fields = (
            "invite_share_allow_user_chats",
            "invite_share_allow_bot_chats",
            "invite_share_allow_group_chats",
            "invite_share_allow_channel_chats",
        )
        if any(field in data for field in audience_fields):
            current = await self._repo.get()
            if not any(data.get(field, getattr(current, field)) for field in audience_fields):
                raise ProviderSettingsError("At least one invite share audience is required")
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

    async def _validate_referral_configuration(self, data: dict[str, object]) -> None:
        referral_fields = {
            "referral_reward_enabled",
            "referral_reward_days",
            "referral_reward_access_profile_id",
            "welcome_discount_enabled",
            "welcome_discount_offer_id",
            "welcome_discount_url",
            "welcome_discount_percent",
        }
        if not referral_fields.intersection(data):
            return
        current = await self._repo.get()
        reward_enabled = bool(data.get("referral_reward_enabled", current.referral_reward_enabled))
        reward_days = data.get("referral_reward_days", current.referral_reward_days)
        reward_profile_id = data.get(
            "referral_reward_access_profile_id",
            current.referral_reward_access_profile_id,
        )
        if reward_enabled:
            if not isinstance(reward_days, int) or reward_profile_id is None:
                raise ProviderSettingsError("Referral reward days and access profile are required")
            profile = await self._profiles.get_active(reward_profile_id)  # type: ignore[arg-type]
            if profile is None or profile.validity_mode != "automation":
                raise ProviderSettingsError(
                    "Referral rewards require an active automation access profile"
                )
            if profile.status != "ACTIVE":
                raise ProviderSettingsError("Referral reward access profile is not grantable")

        discount_enabled = bool(
            data.get("welcome_discount_enabled", current.welcome_discount_enabled)
        )
        discount_offer_id = data.get(
            "welcome_discount_offer_id",
            current.welcome_discount_offer_id,
        )
        discount_url = data.get("welcome_discount_url", current.welcome_discount_url)
        discount_percent = data.get(
            "welcome_discount_percent",
            current.welcome_discount_percent,
        )
        if not discount_enabled:
            return
        if (
            discount_offer_id is None
            or not isinstance(discount_url, str)
            or not discount_url
            or not isinstance(discount_percent, int)
        ):
            raise ProviderSettingsError(
                "Welcome discount offer, percentage, and promo link are required"
            )
        try:
            offer = await self._offers.get_ready(discount_offer_id)  # type: ignore[arg-type]
        except SponsorOfferError as exc:
            raise ProviderSettingsError("Welcome discount offer is unavailable") from exc
        if offer.commerce_type != "subscription":
            raise ProviderSettingsError("Welcome discount requires a subscription offer")

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
