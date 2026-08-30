"""User sponsor billing state and checkout orchestration."""

from __future__ import annotations

import datetime
import re
import uuid
from collections.abc import Callable
from typing import TYPE_CHECKING

from flowvy.config import Settings
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.sponsor_checkout import SponsorCheckout
from flowvy.models.tribute_webhook_event import TributeWebhookEvent
from flowvy.models.user import User
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
    SponsorOfferPublicResponse,
    SponsorOfferResponse,
    SponsorStateResponse,
)
from flowvy.schemas.provider_settings import normalize_payment_destination
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError
from flowvy.services.sponsor_errors import SponsorCheckoutConflictError, SponsorOfferError

if TYPE_CHECKING:
    from flowvy.services.sponsor import SponsorOfferService

TRIBUTE_MANAGEMENT_URL = "https://t.me/tribute"
_LEGACY_ACCESS_EVENT = "legacy_access_import"


def _is_paid_access_grant(operation: EntitlementOperation) -> bool:
    """Include explicit legacy access without fabricating a Tribute payment."""
    return operation.provider == "tribute" or (
        operation.provider == "flowvy" and operation.event_name == _LEGACY_ACCESS_EVENT
    )


def _rule_commerce_type(operation: EntitlementOperation) -> str | None:
    snapshot = operation.rule_snapshot
    value = snapshot.get("commerce_type") if snapshot else None
    return value if isinstance(value, str) else None


def _pending_state(
    operations: list[EntitlementOperation],
    pending_checkout: SponsorCheckout | None,
) -> tuple[str, str] | None:
    queued = next(
        (
            operation
            for operation in reversed(operations)
            if operation.operation_kind in {"grant", "refund"}
            and operation.provider == "tribute"
            and operation.status in {"pending", "processing", "retry"}
        ),
        None,
    )
    if queued is not None:
        return "provisioning", "refresh"
    if pending_checkout is not None:
        return "checkout_pending", "continue_checkout"
    review = next(
        (
            operation
            for operation in reversed(operations)
            if operation.provider == "tribute"
            and operation.operation_kind in {"grant", "refund"}
            and operation.status == "review"
        ),
        None,
    )
    return ("attention", "refresh") if review is not None else None


def _active_grant_state(
    current_grant: EntitlementOperation,
    latest_subscription: TributeWebhookEvent | None,
    recurring_donation_grant: EntitlementOperation | None,
    now: datetime.datetime,
) -> tuple[str, str]:
    if _rule_commerce_type(current_grant) == "subscription":
        cancelled = (
            latest_subscription is not None
            and latest_subscription.event_name == "cancelled_subscription"
            and latest_subscription.provider_expires_at is not None
            and latest_subscription.provider_expires_at > now
        )
        if cancelled:
            return "recurring_cancelled_active", "resume_recurring"
        if latest_subscription is not None and latest_subscription.subscription_type == "trial":
            return "recurring_trial", "manage_subscription"
        return "recurring_active", "manage_subscription"
    if recurring_donation_grant is not None:
        return "recurring_donation_active", "manage_auto_donation"
    return "one_time_active", "renew"


def _inactive_state(
    operations: list[EntitlementOperation],
    latest_subscription: TributeWebhookEvent | None,
    latest_recurring_donation_payment: TributeWebhookEvent | None,
    has_base: bool,
    now: datetime.datetime,
) -> tuple[str, str]:
    latest_grant = next(
        (
            operation
            for operation in reversed(operations)
            if _is_paid_access_grant(operation) and operation.operation_kind == "grant"
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
    if latest_refund is not None and (
        latest_grant is None
        or latest_refund.provider_created_at >= latest_grant.provider_created_at
    ):
        return "refunded", "choose_offer"
    if (
        latest_subscription is not None
        and latest_subscription.provider_expires_at is not None
        and latest_subscription.provider_expires_at <= now
    ):
        return "recurring_expired", "resume_recurring"
    if (
        latest_grant is not None
        and latest_recurring_donation_payment is not None
        and latest_grant.source_event_id == latest_recurring_donation_payment.id
    ):
        return "recurring_expired", "resume_recurring"
    if latest_grant is not None:
        return "one_time_expired", "renew"
    if has_base:
        return "base_access", "choose_offer"
    return "no_access", "choose_offer"


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
        provider_settings: ProviderSettingsRepository,
        config: Settings,
        remnawave: RemnawaveClient | None = None,
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
        self._provider_settings = provider_settings
        self._config = config
        self._remnawave = remnawave
        self._clock = clock or (lambda: datetime.datetime.now(datetime.UTC))

    async def get_state(self, user_id: int, locale: str | None = None) -> SponsorStateResponse:
        now = self._clock()
        pending_checkout = await self._checkouts.expire_pending(user_id, now)
        published = await self._offers.list_published(locale)
        published = await self._eligible_offers(user_id, published)
        welcome_discount = await self._welcome_discount_details(user_id)
        if welcome_discount is not None:
            welcome_discount_offer_id, welcome_discount_percent, _ = welcome_discount
            published = [
                offer.model_copy(
                    update={
                        "welcome_discount": offer.id == welcome_discount_offer_id,
                        "welcome_discount_percent": (
                            welcome_discount_percent
                            if offer.id == welcome_discount_offer_id
                            else None
                        ),
                    }
                )
                for offer in published
            ]
        operations = await self._operations.list_for_user(user_id)
        active_grants = [
            operation
            for operation in await self._operations.uncompensated_applied_grants(user_id)
            if _is_paid_access_grant(operation)
            and operation.target_expiry is not None
            and operation.target_expiry > now
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

        state = _pending_state(operations, pending_checkout)
        if state is not None:
            status, action = state
        elif current_grant is not None:
            status, action = _active_grant_state(
                current_grant,
                latest_subscription,
                recurring_donation_grant,
                now,
            )
        else:
            status, action = _inactive_state(
                operations,
                latest_subscription,
                latest_recurring_donation_payment,
                has_base,
                now,
            )

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
            offers=[self._public_offer(offer) for offer in published],
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
        offer = await self._offers.get_ready(offer_id)
        if not await self._offer_is_eligible(user_id, offer):
            raise SponsorOfferError("Sponsor offer is unavailable")
        if pending is not None:
            if pending.offer_id == offer_id:
                return self._checkout_response(pending)
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
        if pending is not None:
            await self._checkouts.abandon_pending(user_id, pending.id)
        if offer.checkout_url is None:
            raise SponsorOfferError("Sponsor offer has no checkout destination")
        welcome_discount = await self._welcome_discount_checkout(user, offer)
        checkout_offer = (
            offer.model_copy(
                update={
                    "checkout_url": welcome_discount[0],
                    "welcome_discount": True,
                    "welcome_discount_percent": welcome_discount[1],
                }
            )
            if welcome_discount is not None
            else offer
        )
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
            offer_snapshot=checkout_offer.model_dump(mode="json"),
            expires_at=expires_at,
        )
        return self._checkout_response(checkout)

    async def _welcome_discount_details(
        self,
        user_id: int,
    ) -> tuple[uuid.UUID, int, str] | None:
        user = await self._users.get_by_telegram_id(user_id)
        if user is None:
            return None
        settings = await self._provider_settings.get()
        if (
            not settings.welcome_discount_enabled
            or settings.welcome_discount_offer_id is None
            or settings.welcome_discount_url is None
            or settings.welcome_discount_percent is None
            or user.invited_by_id is None
            or await self._operations.has_applied_tribute_grant(user.id)
        ):
            return None
        try:
            normalize_payment_destination(settings.welcome_discount_url)
        except ValueError:
            return None
        if not 1 <= settings.welcome_discount_percent <= 99:
            return None
        return (
            settings.welcome_discount_offer_id,
            settings.welcome_discount_percent,
            normalize_payment_destination(settings.welcome_discount_url),
        )

    async def _eligible_offers(
        self,
        user_id: int,
        offers: list[SponsorOfferResponse],
    ) -> list[SponsorOfferResponse]:
        if not any(offer.excluded_remnawave_tags for offer in offers):
            return offers
        user_tag = await self._current_user_tag(user_id)
        return [
            offer
            for offer in offers
            if not offer.excluded_remnawave_tags
            or (user_tag is not None and user_tag not in offer.excluded_remnawave_tags)
        ]

    async def _offer_is_eligible(self, user_id: int, offer: SponsorOfferResponse) -> bool:
        if not offer.excluded_remnawave_tags:
            return True
        user_tag = await self._current_user_tag(user_id)
        return user_tag is not None and user_tag not in offer.excluded_remnawave_tags

    async def _current_user_tag(self, user_id: int) -> str | None:
        if self._remnawave is None:
            return None
        try:
            user = await self._remnawave.get_user_by_telegram_id(user_id)
        except RemnawaveError:
            return None
        if user is None or user.tag is None:
            return ""
        normalized = user.tag.strip().upper()
        if re.fullmatch(r"[A-Z0-9_]{1,16}", normalized) is None:
            return None
        return normalized

    @staticmethod
    def _public_offer(offer: SponsorOfferResponse) -> SponsorOfferPublicResponse:
        return SponsorOfferPublicResponse.model_validate(
            offer.model_dump(exclude={"content_locales", "excluded_remnawave_tags"})
        )

    async def _welcome_discount_checkout(
        self,
        user: User,
        offer: SponsorOfferResponse,
    ) -> tuple[str, int] | None:
        details = await self._welcome_discount_details(user.id)
        if details is None or details[0] != offer.id or offer.commerce_type != "subscription":
            return None
        return details[2], details[1]

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


__all__ = ["TRIBUTE_MANAGEMENT_URL", "SponsorStateService"]
