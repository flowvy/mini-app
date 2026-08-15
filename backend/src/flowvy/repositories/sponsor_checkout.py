"""Local sponsor-checkout persistence and provider-event attribution."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass

from sqlalchemy import select

from flowvy.models.sponsor_checkout import SponsorCheckout
from flowvy.models.tribute_webhook_event import TributeWebhookEvent
from flowvy.repositories.base import BaseRepository


@dataclass(frozen=True, slots=True)
class SponsorCheckoutMatch:
    """One local checkout attribution result without provider payload details."""

    checkout: SponsorCheckout
    mismatch_reason: str | None = None


def _as_utc(value: datetime.datetime) -> datetime.datetime:
    """Normalize shared naive audit timestamps and provider-aware timestamps."""
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.UTC)
    return value.astimezone(datetime.UTC)


class SponsorCheckoutRepository(BaseRepository[SponsorCheckout]):
    """Serialize one pending checkout per user and link only authenticated stored events."""

    model = SponsorCheckout

    async def get_pending_for_user(
        self,
        user_id: int,
        *,
        for_update: bool = False,
    ) -> SponsorCheckout | None:
        stmt = select(SponsorCheckout).where(
            SponsorCheckout.user_id == user_id,
            SponsorCheckout.status == "pending",
        )
        if for_update:
            stmt = stmt.with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def expire_pending(self, user_id: int, now: datetime.datetime) -> SponsorCheckout | None:
        checkout = await self.get_pending_for_user(user_id, for_update=True)
        if checkout is not None and checkout.expires_at <= now:
            checkout.status = "expired"
            await self._session.flush()
            return None
        return checkout

    async def abandon_pending(self, user_id: int, checkout_id: uuid.UUID) -> bool:
        """Stop waiting for one owned redirect attempt without touching the provider."""
        stmt = (
            select(SponsorCheckout)
            .where(
                SponsorCheckout.id == checkout_id,
                SponsorCheckout.user_id == user_id,
                SponsorCheckout.status == "pending",
            )
            .with_for_update()
        )
        checkout = (await self._session.execute(stmt)).scalar_one_or_none()
        if checkout is None:
            return False
        checkout.status = "expired"
        await self._session.flush()
        return True

    async def latest_for_user(self, user_id: int) -> SponsorCheckout | None:
        stmt = (
            select(SponsorCheckout)
            .where(SponsorCheckout.user_id == user_id)
            .order_by(SponsorCheckout.created_at.desc())
            .limit(1)
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def get_by_provider_event_id(self, event_id: int) -> SponsorCheckout | None:
        stmt = select(SponsorCheckout).where(SponsorCheckout.provider_event_id == event_id)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def confirm_matching(
        self,
        source: TributeWebhookEvent,
        now: datetime.datetime,
    ) -> SponsorCheckoutMatch | None:
        """Attach the newest compatible redirect attempt to an authenticated provider event."""
        if source.telegram_user_id is None:
            return None
        stmt = select(SponsorCheckout).where(
            SponsorCheckout.user_id == source.telegram_user_id,
            SponsorCheckout.provider == "tribute",
            SponsorCheckout.commerce_type == source.event_family,
            SponsorCheckout.status.in_(("pending", "expired")),
        )
        if source.event_family != "donation":
            if source.external_item_id is None:
                return None
            stmt = stmt.where(SponsorCheckout.external_item_id == source.external_item_id)
        if source.event_family != "donation" and source.payment_mode is not None:
            stmt = stmt.where(
                SponsorCheckout.payment_mode.in_((source.payment_mode, "any")),
            )
        checkout = (
            await self._session.execute(
                stmt.order_by(SponsorCheckout.created_at.desc()).with_for_update().limit(1),
            )
        ).scalar_one_or_none()
        if checkout is None:
            return None
        checkout_created_at = _as_utc(checkout.created_at)
        if (
            _as_utc(source.received_at) < checkout_created_at
            or _as_utc(source.provider_created_at) < checkout_created_at
        ):
            return None
        if checkout.commerce_type == "donation":
            expected_amount = checkout.offer_snapshot.get("expected_amount_minor")
            expected_payment_mode = checkout.offer_snapshot.get("expected_payment_mode")
            expected_provider_period = checkout.offer_snapshot.get("expected_provider_period")
            price_options = checkout.offer_snapshot.get("price_options")
            requires_non_anonymous = checkout.offer_snapshot.get("requires_non_anonymous")
            expected_currency = None
            if isinstance(price_options, list) and price_options:
                first_price = price_options[0]
                if isinstance(first_price, dict):
                    expected_currency = first_price.get("currency")
            schedule_matches = (
                expected_payment_mode in {"one_time", "recurring"}
                and source.payment_mode == expected_payment_mode
                and (
                    expected_provider_period is None
                    if expected_payment_mode == "one_time"
                    else expected_provider_period
                    in {"weekly", "monthly", "quarterly", "halfyearly", "yearly"}
                    and source.provider_period == expected_provider_period
                )
            )
            if (
                (requires_non_anonymous is True and source.is_anonymous is not False)
                or not isinstance(expected_amount, int)
                or source.amount_minor != expected_amount
                or source.currency != expected_currency
                or not schedule_matches
            ):
                checkout.status = "expired"
                await self._session.flush()
                return SponsorCheckoutMatch(
                    checkout=checkout,
                    mismatch_reason="donation_offer_mismatch",
                )
        checkout.status = "confirmed"
        checkout.provider_event_id = source.id
        checkout.confirmed_at = now
        await self._session.flush()
        return SponsorCheckoutMatch(checkout=checkout)


__all__ = ["SponsorCheckoutMatch", "SponsorCheckoutRepository"]
