"""Provider-neutral sponsor offers, redirect intents, and Home billing state."""

from __future__ import annotations

import datetime
import uuid
from collections.abc import Callable
from decimal import Decimal

from flowvy.config import Settings
from flowvy.localization import (
    DEFAULT_LOCALE,
    dump_locale_map,
    normalize_locale,
    normalize_locale_map,
    resolve_locale_map,
)
from flowvy.models.commerce_rule import CommerceRule
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.sponsor_checkout import SponsorCheckout
from flowvy.models.sponsor_offer import SponsorOffer
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.entitlement_baseline import EntitlementBaselineRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.sponsor_checkout import SponsorCheckoutRepository
from flowvy.repositories.sponsor_offer import SponsorOfferRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.commerce import (
    SponsorCheckoutResponse,
    SponsorOfferCheckoutSnapshot,
    SponsorOfferInput,
    SponsorOfferLocale,
    SponsorOfferPriceOption,
    SponsorOfferResponse,
    SponsorStateResponse,
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

TRIBUTE_MANAGEMENT_URL = "https://t.me/tribute"


class SponsorOfferError(ValueError):
    """Safe offer validation error."""

    code = "sponsor_offer_invalid"


class SponsorOfferNotFoundError(SponsorOfferError):
    """Requested offer is absent."""

    code = "sponsor_offer_not_found"


class SponsorOfferDestinationMissingError(SponsorOfferError):
    """The selected provider item has no configured checkout destination."""

    code = "tribute_subscription_destination_missing"


class SponsorCheckoutConflictError(ValueError):
    """A different unconfirmed checkout already owns this user's intent."""


def _minor_to_major(value: int) -> str:
    return format(Decimal(value).scaleb(-2), "f")


def _rule_commerce_type(operation: EntitlementOperation) -> str | None:
    snapshot = operation.rule_snapshot
    value = snapshot.get("commerce_type") if snapshot else None
    return value if isinstance(value, str) else None


class SponsorOfferService:
    """Manage public offer presentation without creating provider orders."""

    def __init__(
        self,
        offers: SponsorOfferRepository,
        rules: CommerceRuleRepository,
        profiles: AccessProfileRepository,
        provider_settings: ProviderSettingsRepository,
        catalog: CommerceCatalogService,
    ) -> None:
        self._offers = offers
        self._rules = rules
        self._profiles = profiles
        self._provider_settings = provider_settings
        self._catalog = catalog

    async def list_admin(self) -> list[SponsorOfferResponse]:
        default_locale = await self._default_locale()
        return [
            await self._response(offer, default_locale=default_locale)
            for offer in await self._offers.list_all()
        ]

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
        if await self._profiles.get_active(rule.access_profile_id) is None:
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
        if not offer.is_published:
            availability = "draft"
        elif not rule.is_enabled:
            availability = "rule_disabled"
        elif await self._profiles.get_active(rule.access_profile_id) is None:
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


class SponsorStateService:
    """Compute one fail-closed billing/access state from local durable facts."""

    def __init__(
        self,
        offers: SponsorOfferService,
        offer_repository: SponsorOfferRepository,
        checkouts: SponsorCheckoutRepository,
        operations: EntitlementOperationRepository,
        events: TributeWebhookEventRepository,
        baselines: EntitlementBaselineRepository,
        subscriptions: SubscriptionRepository,
        users: UserRepository,
        config: Settings,
        clock: Callable[[], datetime.datetime] | None = None,
    ) -> None:
        self._offers = offers
        self._offer_repository = offer_repository
        self._checkouts = checkouts
        self._operations = operations
        self._events = events
        self._baselines = baselines
        self._subscriptions = subscriptions
        self._users = users
        self._config = config
        self._clock = clock or (lambda: datetime.datetime.now(datetime.UTC))

    async def get_state(self, user_id: int, locale: str | None = None) -> SponsorStateResponse:
        now = self._clock()
        pending_checkout = await self._checkouts.expire_pending(user_id, now)
        published = await self._offers.list_published(locale)
        operations = await self._operations.list_for_user(user_id)
        active_grants = [
            operation
            for operation in await self._operations.uncompensated_applied_grants(user_id)
            if operation.target_expiry is not None and operation.target_expiry > now
        ]
        latest_subscription = await self._events.latest_subscription_for_user(user_id)
        latest_recurring_donation_payment = (
            await self._events.latest_recurring_donation_payment_for_user(user_id)
        )
        has_base, base_expiry = await self._base_access(user_id, now)

        current_grant = max(
            active_grants,
            key=lambda operation: operation.target_expiry or now,
            default=None,
        )
        recurring_donation_grant = next(
            (
                operation
                for operation in active_grants
                if latest_recurring_donation_payment is not None
                and operation.source_event_id == latest_recurring_donation_payment.id
            ),
            None,
        )
        attributed_checkout = None
        if current_grant is not None and current_grant.source_event_id is not None:
            source_event = await self._events.get_by_id(current_grant.source_event_id)
            if source_event is not None:
                checkout_match = await self._checkouts.confirm_matching(source_event, now)
                attributed_checkout = (
                    checkout_match.checkout
                    if checkout_match is not None and checkout_match.mismatch_reason is None
                    else None
                )
                if (
                    attributed_checkout is not None
                    and pending_checkout is not None
                    and attributed_checkout.id == pending_checkout.id
                ):
                    pending_checkout = None
            if attributed_checkout is None:
                attributed_checkout = await self._checkouts.get_by_provider_event_id(
                    current_grant.source_event_id,
                )
        current_offer = None
        if attributed_checkout is not None and attributed_checkout.offer_id is not None:
            current_offer = await self._offer_repository.get_by_id(attributed_checkout.offer_id)
        elif current_grant is not None and current_grant.rule_id is not None:
            current_offer = await self._offer_repository.get_by_rule_id(current_grant.rule_id)
        paid_expiry = current_grant.target_expiry if current_grant is not None else None
        access_level = "paid" if current_grant is not None else ("base" if has_base else "none")

        queued = next(
            (
                operation
                for operation in reversed(operations)
                if operation.operation_kind in {"grant", "refund"}
                and operation.status in {"pending", "processing", "retry"}
            ),
            None,
        )
        review = next(
            (
                operation
                for operation in reversed(operations)
                if operation.operation_kind in {"grant", "refund"} and operation.status == "review"
            ),
            None,
        )

        if queued is not None:
            status, action = "provisioning", "refresh"
        elif pending_checkout is not None:
            status, action = "checkout_pending", "continue_checkout"
        elif review is not None:
            status, action = "attention", "refresh"
        elif current_grant is not None and _rule_commerce_type(current_grant) == "subscription":
            cancelled = (
                latest_subscription is not None
                and latest_subscription.event_name == "cancelled_subscription"
                and latest_subscription.provider_expires_at is not None
                and latest_subscription.provider_expires_at > now
            )
            trial = (
                latest_subscription is not None
                and latest_subscription.subscription_type == "trial"
            )
            if cancelled:
                status, action = "recurring_cancelled_active", "resume_recurring"
            elif trial:
                status, action = "recurring_trial", "manage_subscription"
            else:
                status, action = "recurring_active", "manage_subscription"
        elif recurring_donation_grant is not None:
            status, action = "recurring_donation_active", "manage_auto_donation"
        elif current_grant is not None:
            status, action = "one_time_active", "renew"
        else:
            latest_grant = next(
                (
                    operation
                    for operation in reversed(operations)
                    if operation.operation_kind == "grant"
                ),
                None,
            )
            latest_refund = next(
                (
                    operation
                    for operation in reversed(operations)
                    if operation.operation_kind == "refund" and operation.status == "applied"
                ),
                None,
            )
            subscription_expired = (
                latest_subscription is not None
                and latest_subscription.provider_expires_at is not None
                and latest_subscription.provider_expires_at <= now
            )
            recurring_donation_expired = (
                latest_grant is not None
                and latest_recurring_donation_payment is not None
                and latest_grant.source_event_id == latest_recurring_donation_payment.id
            )
            if latest_refund is not None and (
                latest_grant is None
                or latest_refund.provider_created_at >= latest_grant.provider_created_at
            ):
                status, action = "refunded", "choose_offer"
            elif subscription_expired:
                status, action = "recurring_expired", "resume_recurring"
            elif recurring_donation_expired:
                status, action = "recurring_expired", "resume_recurring"
            elif latest_grant is not None:
                status, action = "one_time_expired", "renew"
            elif has_base:
                status, action = "base_access", "choose_offer"
            else:
                status, action = "no_access", "choose_offer"

        if not published and action in {"choose_offer", "renew", "resume_recurring"}:
            action = "none"
        return SponsorStateResponse(
            status=status,  # type: ignore[arg-type]
            access_level=access_level,  # type: ignore[arg-type]
            primary_action=action,  # type: ignore[arg-type]
            paid_expires_at=paid_expiry,
            base_expires_at=base_expiry,
            current_offer_id=current_offer.id if current_offer is not None else None,
            management_url=(
                TRIBUTE_MANAGEMENT_URL
                if action in {"manage_subscription", "manage_auto_donation"}
                else None
            ),
            pending_checkout=(
                self._checkout_response(pending_checkout) if pending_checkout is not None else None
            ),
            offers=published,
        )

    async def start_checkout(
        self,
        user_id: int,
        offer_id: uuid.UUID,
    ) -> SponsorCheckoutResponse:
        now = self._clock()
        user = await self._users.get_by_telegram_id_for_update(user_id)
        if user is None or not user.is_active:
            raise SponsorOfferError("Active user account required")
        pending = await self._checkouts.expire_pending(user_id, now)
        if pending is not None:
            if pending.offer_id == offer_id:
                return self._checkout_response(pending)
            raise SponsorCheckoutConflictError("Another payment is still awaiting confirmation")

        offer = await self._offers.get_ready(offer_id)
        if offer.commerce_type == "subscription":
            active_subscription = next(
                (
                    operation
                    for operation in await self._operations.uncompensated_applied_grants(user_id)
                    if operation.target_expiry is not None
                    and operation.target_expiry > now
                    and _rule_commerce_type(operation) == "subscription"
                ),
                None,
            )
            if active_subscription is not None:
                raise SponsorCheckoutConflictError(
                    "Another subscription can start after the current paid period ends",
                )
        if offer.checkout_url is None:
            raise SponsorOfferError("Sponsor offer has no checkout destination")
        expires_at = now + datetime.timedelta(
            minutes=self._config.sponsor_checkout_pending_minutes,
        )
        checkout = await self._checkouts.create(
            user_id=user_id,
            offer_id=offer.id,
            provider=offer.provider,
            commerce_type=offer.commerce_type,
            payment_mode=(
                offer.expected_payment_mode or offer.payment_mode
                if offer.commerce_type == "donation"
                else offer.payment_mode
            ),
            external_item_id=offer.external_item_id,
            status="pending",
            offer_snapshot=offer.model_dump(mode="json"),
            expires_at=expires_at,
        )
        return self._checkout_response(checkout)

    async def abandon_checkout(self, user_id: int, checkout_id: uuid.UUID) -> None:
        """Abandon only Flowvy's local redirect intent; a late signed event still wins."""
        user = await self._users.get_by_telegram_id_for_update(user_id)
        if user is None or not user.is_active:
            raise SponsorOfferError("Active user account required")
        await self._checkouts.abandon_pending(user_id, checkout_id)

    async def _base_access(
        self,
        user_id: int,
        now: datetime.datetime,
    ) -> tuple[bool, datetime.datetime | None]:
        baseline = await self._baselines.get_by_id(user_id)
        if baseline is not None:
            active = baseline.had_access and (
                baseline.expires_at is None or baseline.expires_at > now
            )
            return active, baseline.expires_at if active else None
        for subscription in await self._subscriptions.get_by_user_id(user_id):
            expiry = (
                subscription.expires_at.replace(tzinfo=datetime.UTC)
                if subscription.expires_at is not None
                else None
            )
            if subscription.status == "active" and (expiry is None or expiry > now):
                return True, expiry
        return False, None

    @staticmethod
    def _checkout_response(checkout: SponsorCheckout) -> SponsorCheckoutResponse:
        snapshot = SponsorOfferResponse.model_validate(checkout.offer_snapshot)
        if snapshot.checkout_url is None:
            raise SponsorOfferError("Stored checkout destination is unavailable")
        return SponsorCheckoutResponse(
            id=checkout.id,
            offer_id=checkout.offer_id,
            status=checkout.status,  # type: ignore[arg-type]
            checkout_url=snapshot.checkout_url,
            expires_at=checkout.expires_at,
        )


__all__ = [
    "TRIBUTE_MANAGEMENT_URL",
    "SponsorCheckoutConflictError",
    "SponsorOfferDestinationMissingError",
    "SponsorOfferError",
    "SponsorOfferNotFoundError",
    "SponsorOfferService",
    "SponsorStateService",
]
