"""Provider-neutral sponsor offer catalog and validation."""

from __future__ import annotations

import uuid
from decimal import Decimal

from flowvy.localization import (
    DEFAULT_LOCALE,
    dump_locale_map,
    normalize_locale,
    normalize_locale_map,
    resolve_locale_map,
)
from flowvy.models.commerce_rule import CommerceRule
from flowvy.models.sponsor_offer import SponsorOffer
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.sponsor_offer import SponsorOfferRepository
from flowvy.schemas.commerce import (
    SponsorOfferBenefits,
    SponsorOfferCheckoutSnapshot,
    SponsorOfferInput,
    SponsorOfferLocale,
    SponsorOfferOptionsResponse,
    SponsorOfferPriceOption,
    SponsorOfferResponse,
)
from flowvy.services.commerce import (
    CommerceRuleError,
    commerce_rule_response,
    evaluate_commerce_rule,
)
from flowvy.services.commerce_catalog import (
    CommerceCatalogService,
    CommerceCatalogUnavailableError,
)
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError
from flowvy.services.sponsor_errors import (
    SponsorCheckoutConflictError,
    SponsorOfferDestinationMissingError,
    SponsorOfferError,
    SponsorOfferNotFoundError,
)
from flowvy.services.sponsor_state import TRIBUTE_MANAGEMENT_URL, SponsorStateService


def _minor_to_major(value: int) -> str:
    return format(Decimal(value).scaleb(-2), "f")


class SponsorOfferService:
    """Manage public offer presentation without creating provider orders."""

    def __init__(
        self,
        offers: SponsorOfferRepository,
        rules: CommerceRuleRepository,
        profiles: AccessProfileRepository,
        provider_settings: ProviderSettingsRepository,
        catalog: CommerceCatalogService,
        remnawave: RemnawaveClient | None = None,
    ) -> None:
        self._offers = offers
        self._rules = rules
        self._profiles = profiles
        self._provider_settings = provider_settings
        self._catalog = catalog
        self._remnawave = remnawave

    async def list_admin(self) -> list[SponsorOfferResponse]:
        default_locale = await self._default_locale()
        return [
            await self._response(offer, default_locale=default_locale)
            for offer in await self._offers.list_all()
        ]

    async def get_options(self) -> SponsorOfferOptionsResponse:
        if self._remnawave is None:
            raise SponsorOfferError("Remnawave tags are unavailable")
        try:
            tags = await self._remnawave.get_user_tags()
        except RemnawaveError as exc:
            raise SponsorOfferError("Remnawave tags are unavailable") from exc
        return SponsorOfferOptionsResponse(remnawave_tags=tags)

    async def list_published(self, locale: str | None = None) -> list[SponsorOfferResponse]:
        default_locale = await self._default_locale()
        responses = [
            await self._response(
                offer,
                default_locale=default_locale,
                locale=locale,
                include_locales=False,
            )
            for offer in await self._offers.list_all()
        ]
        return [
            response
            for response in responses
            if response.is_published and response.availability == "ready"
        ]

    async def create(
        self,
        payload: SponsorOfferInput,
        admin_id: int | None,
    ) -> SponsorOfferResponse:
        rule = await self._require_rule(payload.commerce_rule_id)
        self._validate_destination_shape(rule, payload)
        default_locale = await self._default_locale()
        content_locales = self._content_locales(payload, default_locale)
        await self._validate_excluded_tags(payload.excluded_remnawave_tags)
        snapshot = (
            await self._resolve_snapshot(rule, payload, current_offer_id=None)
            if payload.is_published
            else None
        )
        offer = await self._offers.create(
            provider=rule.provider,
            commerce_rule_id=rule.id,
            title=payload.title,
            description=payload.description,
            content_locales=dump_locale_map(content_locales),
            excluded_remnawave_tags=payload.excluded_remnawave_tags,
            checkout_url=payload.checkout_url,
            expected_amount_minor=payload.expected_amount_minor,
            expected_payment_mode=payload.expected_payment_mode,
            expected_provider_period=payload.expected_provider_period,
            checkout_snapshot=snapshot.model_dump(mode="json") if snapshot else None,
            is_published=payload.is_published,
            sort_order=payload.sort_order,
            created_by_id=admin_id,
        )
        return await self._response(offer, default_locale=default_locale)

    async def update(
        self,
        offer_id: uuid.UUID,
        payload: SponsorOfferInput,
    ) -> SponsorOfferResponse:
        offer = await self._offers.get_by_id(offer_id)
        if offer is None:
            raise SponsorOfferNotFoundError("Sponsor offer was not found")
        rule = await self._require_rule(payload.commerce_rule_id)
        self._validate_destination_shape(rule, payload)
        default_locale = await self._default_locale()
        content_locales = self._content_locales(
            payload,
            default_locale,
            existing=getattr(offer, "content_locales", None),
        )
        if payload.excluded_remnawave_tags != (offer.excluded_remnawave_tags or []):
            await self._validate_excluded_tags(payload.excluded_remnawave_tags)
        snapshot = (
            await self._resolve_snapshot(rule, payload, current_offer_id=offer.id)
            if payload.is_published
            else None
        )
        updated = await self._offers.update(
            offer,
            provider=rule.provider,
            commerce_rule_id=rule.id,
            title=payload.title,
            description=payload.description,
            content_locales=dump_locale_map(content_locales),
            excluded_remnawave_tags=payload.excluded_remnawave_tags,
            checkout_url=payload.checkout_url,
            expected_amount_minor=payload.expected_amount_minor,
            expected_payment_mode=payload.expected_payment_mode,
            expected_provider_period=payload.expected_provider_period,
            checkout_snapshot=snapshot.model_dump(mode="json") if snapshot else None,
            is_published=payload.is_published,
            sort_order=payload.sort_order,
        )
        return await self._response(updated, default_locale=default_locale)

    async def delete(self, offer_id: uuid.UUID) -> None:
        offer = await self._offers.get_by_id(offer_id)
        if offer is None:
            raise SponsorOfferNotFoundError("Sponsor offer was not found")
        await self._offers.delete(offer)

    async def get_ready(self, offer_id: uuid.UUID) -> SponsorOfferResponse:
        offer = await self._offers.get_by_id(offer_id)
        if offer is None:
            raise SponsorOfferNotFoundError("Sponsor offer was not found")
        response = await self._response(offer, default_locale=await self._default_locale())
        if not response.is_published or response.availability != "ready":
            raise SponsorOfferError("Sponsor offer is unavailable")
        return response

    async def _require_rule(self, rule_id: uuid.UUID) -> CommerceRule:
        rule = await self._rules.get_by_id(rule_id)
        if rule is None:
            raise SponsorOfferError("Commerce rule was not found")
        return rule

    @staticmethod
    def _validate_destination_shape(rule: CommerceRule, payload: SponsorOfferInput) -> None:
        has_url = payload.checkout_url is not None
        has_amount = payload.expected_amount_minor is not None
        has_mode = payload.expected_payment_mode is not None
        has_period = payload.expected_provider_period is not None
        if rule.commerce_type != "donation" and (has_url or has_amount or has_mode or has_period):
            raise SponsorOfferError("Only donation offers accept a custom checkout destination")
        if rule.commerce_type != "donation":
            return
        if not has_mode:
            raise SponsorOfferError("Donation offers require an expected payment mode")
        if has_url != has_amount:
            raise SponsorOfferError(
                "Donation link and expected amount must be configured together",
            )
        if rule.payment_mode != "any" and payload.expected_payment_mode != rule.payment_mode:
            raise SponsorOfferError("Donation offer schedule does not match its automation rule")

    async def _resolve_snapshot(
        self,
        rule: CommerceRule,
        payload: SponsorOfferInput,
        *,
        current_offer_id: uuid.UUID | None,
    ) -> SponsorOfferCheckoutSnapshot:
        if not rule.is_enabled:
            raise SponsorOfferError("Enable the commerce rule before publishing its offer")
        profile = await self._profiles.get_active(rule.access_profile_id)
        if profile is None:
            raise SponsorOfferError("Access profile is unavailable")

        response = commerce_rule_response(rule)
        settings = await self._provider_settings.get()
        price_options: list[SponsorOfferPriceOption]
        requires_non_anonymous = False

        if rule.commerce_type == "donation":
            if (
                payload.checkout_url is None
                or payload.expected_amount_minor is None
                or payload.expected_payment_mode is None
            ):
                raise SponsorOfferError("Donation link, amount, and schedule are required")
            preview = evaluate_commerce_rule(response, payload.expected_amount_minor)
            if not preview.matched or preview.duration_days is None:
                raise SponsorOfferError("Expected donation amount does not grant access")
            checkout_url = payload.checkout_url
            requires_non_anonymous = True
            price_options = [
                SponsorOfferPriceOption(
                    price_major=_minor_to_major(payload.expected_amount_minor),
                    currency=rule.currency,
                    period=payload.expected_provider_period,
                )
            ]
        else:
            await self._require_unique_published_subscription(rule, current_offer_id)
            try:
                catalog = await self._catalog.get_tribute()
            except CommerceCatalogUnavailableError as exc:
                raise SponsorOfferError("Tribute catalog is unavailable") from exc
            subscription = next(
                (
                    item
                    for item in catalog.subscriptions
                    if item.external_item_id == rule.external_item_id
                ),
                None,
            )
            if subscription is None or not subscription.periods:
                raise SponsorOfferError("Tribute subscription is unavailable")
            if subscription.currency != rule.currency:
                raise SponsorOfferError("Offer and commerce rule currencies do not match")
            checkout_url = settings.tribute_subscription_urls.get(
                subscription.external_item_id,
            )
            if checkout_url is None:
                raise SponsorOfferDestinationMissingError(
                    "Tribute subscription destination is not configured"
                )
            price_options = [
                SponsorOfferPriceOption(
                    price_major=period.price_major,
                    currency=subscription.currency,
                    period=period.period,
                )
                for period in subscription.periods
            ]

        return SponsorOfferCheckoutSnapshot(
            provider="tribute",
            commerce_type=rule.commerce_type,  # type: ignore[arg-type]
            payment_mode=rule.payment_mode,  # type: ignore[arg-type]
            external_item_id=rule.external_item_id,
            checkout_url=checkout_url,
            expected_amount_minor=(
                payload.expected_amount_minor if rule.commerce_type == "donation" else None
            ),
            expected_payment_mode=(
                payload.expected_payment_mode if rule.commerce_type == "donation" else None
            ),
            expected_provider_period=(
                payload.expected_provider_period if rule.commerce_type == "donation" else None
            ),
            price_options=price_options,
            requires_non_anonymous=requires_non_anonymous,
            benefits=SponsorOfferBenefits(
                traffic_limit_bytes=profile.traffic_limit_bytes,
                device_limit=profile.hwid_device_limit,
            ),
        )

    async def _require_unique_published_subscription(
        self,
        rule: CommerceRule,
        current_offer_id: uuid.UUID | None,
    ) -> None:
        """Keep one public card for one provider subscription and all its periods."""
        for offer in await self._offers.list_all():
            if offer.id == current_offer_id or not offer.is_published:
                continue
            existing_rule = await self._rules.get_by_id(offer.commerce_rule_id)
            if (
                existing_rule is not None
                and existing_rule.commerce_type == "subscription"
                and existing_rule.external_item_id == rule.external_item_id
            ):
                raise SponsorOfferError(
                    "This Tribute subscription is already published; "
                    "one offer includes all periods",
                )

    async def _default_locale(self) -> str:
        settings = await self._provider_settings.get()
        value = getattr(settings, "content_default_locale", DEFAULT_LOCALE)
        return normalize_locale(value if isinstance(value, str) else None)

    async def _validate_excluded_tags(self, requested: list[str]) -> None:
        if not requested:
            return
        if self._remnawave is None:
            raise SponsorOfferError("Remnawave tags are unavailable")
        try:
            available = set(await self._remnawave.get_user_tags())
        except RemnawaveError as exc:
            raise SponsorOfferError("Remnawave tags are unavailable") from exc
        if any(tag not in available for tag in requested):
            raise SponsorOfferError("One or more Remnawave tags are unavailable")

    @staticmethod
    def _content_locales(
        payload: SponsorOfferInput,
        default_locale: str,
        *,
        existing: object = None,
    ) -> dict[str, SponsorOfferLocale]:
        source = payload.content_locales
        if source is None:
            source = existing
        localized = normalize_locale_map(source or {}, SponsorOfferLocale)
        localized[default_locale] = SponsorOfferLocale(
            title=payload.title,
            description=payload.description,
        )
        return localized

    async def _response(
        self,
        offer: SponsorOffer,
        *,
        default_locale: str,
        locale: str | None = None,
        include_locales: bool = True,
    ) -> SponsorOfferResponse:
        rule = await self._rules.get_by_id(offer.commerce_rule_id)
        if rule is None:
            raise SponsorOfferError("Sponsor offer has no commerce rule")
        snapshot = (
            SponsorOfferCheckoutSnapshot.model_validate(offer.checkout_snapshot)
            if offer.checkout_snapshot is not None
            else None
        )
        draft_prices = (
            [
                SponsorOfferPriceOption(
                    price_major=_minor_to_major(offer.expected_amount_minor),
                    currency=rule.currency,
                    period=offer.expected_provider_period,
                ),
            ]
            if snapshot is None
            and offer.checkout_url is not None
            and offer.expected_amount_minor is not None
            else []
        )
        profile = await self._profiles.get_active(rule.access_profile_id)
        if not offer.is_published:
            availability = "draft"
        elif not rule.is_enabled:
            availability = "rule_disabled"
        elif profile is None:
            availability = "profile_unavailable"
        elif snapshot is None or not self._snapshot_matches_rule(rule, snapshot):
            availability = "configuration_changed"
        else:
            availability = "ready"
        content_locales = normalize_locale_map(
            getattr(offer, "content_locales", None) or {},
            SponsorOfferLocale,
        )
        localized = resolve_locale_map(
            content_locales,
            SponsorOfferLocale,
            locale,
            default_locale,
        )
        return SponsorOfferResponse(
            id=offer.id,
            provider="tribute",
            title=localized.title if localized is not None else offer.title,
            description=(localized.description if localized is not None else offer.description),
            content_locales=content_locales if include_locales else {},
            excluded_remnawave_tags=list(offer.excluded_remnawave_tags or []),
            commerce_rule_id=offer.commerce_rule_id,
            checkout_url=(snapshot.checkout_url if snapshot else offer.checkout_url),
            expected_amount_minor=(
                snapshot.expected_amount_minor if snapshot else offer.expected_amount_minor
            ),
            expected_payment_mode=(
                snapshot.expected_payment_mode if snapshot else offer.expected_payment_mode
            ),
            expected_provider_period=(
                snapshot.expected_provider_period if snapshot else offer.expected_provider_period
            ),
            is_published=offer.is_published,
            sort_order=offer.sort_order,
            commerce_type=rule.commerce_type,  # type: ignore[arg-type]
            payment_mode=rule.payment_mode,  # type: ignore[arg-type]
            external_item_id=rule.external_item_id,
            price_options=snapshot.price_options if snapshot else draft_prices,
            requires_non_anonymous=(snapshot.requires_non_anonymous if snapshot else False),
            benefits=(
                SponsorOfferBenefits(
                    traffic_limit_bytes=profile.traffic_limit_bytes,
                    device_limit=profile.hwid_device_limit,
                )
                if profile is not None
                else snapshot.benefits
                if snapshot is not None and snapshot.benefits is not None
                else SponsorOfferBenefits(traffic_limit_bytes=0, device_limit=None)
            ),
            availability=availability,  # type: ignore[arg-type]
        )

    @staticmethod
    def _snapshot_matches_rule(
        rule: CommerceRule,
        snapshot: SponsorOfferCheckoutSnapshot,
    ) -> bool:
        if (
            snapshot.provider != rule.provider
            or snapshot.commerce_type != rule.commerce_type
            or snapshot.payment_mode != rule.payment_mode
            or snapshot.external_item_id != rule.external_item_id
            or not snapshot.price_options
            or any(option.currency != rule.currency for option in snapshot.price_options)
        ):
            return False
        if rule.commerce_type != "donation":
            return True
        if (
            snapshot.expected_amount_minor is None
            or snapshot.expected_payment_mode is None
            or len(snapshot.price_options) != 1
        ):
            return False
        if rule.payment_mode != "any" and snapshot.expected_payment_mode != rule.payment_mode:
            return False
        if (
            snapshot.expected_payment_mode == "recurring"
            and snapshot.expected_provider_period is None
        ):
            return False
        if (
            snapshot.expected_payment_mode == "one_time"
            and snapshot.expected_provider_period is not None
        ):
            return False
        try:
            preview = evaluate_commerce_rule(
                commerce_rule_response(rule),
                snapshot.expected_amount_minor,
            )
        except CommerceRuleError:
            return False
        return preview.matched and preview.duration_days is not None


__all__ = [
    "TRIBUTE_MANAGEMENT_URL",
    "SponsorCheckoutConflictError",
    "SponsorOfferDestinationMissingError",
    "SponsorOfferError",
    "SponsorOfferNotFoundError",
    "SponsorOfferService",
    "SponsorStateService",
]
