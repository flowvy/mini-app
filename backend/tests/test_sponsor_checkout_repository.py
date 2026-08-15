"""PostgreSQL contracts for sponsor checkout attribution."""

from __future__ import annotations

import datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.sponsor_checkout import SponsorCheckoutRepository
from flowvy.repositories.sponsor_offer import SponsorOfferRepository
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.tribute_webhooks import TributeWebhookInboxInput


async def _seed_checkout(session: AsyncSession) -> SponsorCheckoutRepository:
    await UserRepository(session).create(
        id=123,
        username="sponsor",
        full_name="Sponsor",
        is_active=True,
    )
    profile = await AccessProfileRepository(session).create(
        name="Sponsor access",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        status="ACTIVE",
        internal_squad_uuids=[],
        is_active=True,
    )
    rule = await CommerceRuleRepository(session).create(
        provider="tribute",
        name="Monthly sponsor",
        commerce_type="subscription",
        payment_mode="recurring",
        external_item_id="42",
        currency="RUB",
        calculation_type="provider_expiry",
        calculator={},
        access_profile_id=profile.id,
        grant_mode="replace",
        priority=100,
        is_enabled=True,
        created_by_id=None,
    )
    offer = await SponsorOfferRepository(session).create(
        provider="tribute",
        commerce_rule_id=rule.id,
        title="Monthly sponsor",
        description="Extended access",
        checkout_snapshot={
            "provider": "tribute",
            "commerce_type": "subscription",
            "payment_mode": "recurring",
            "external_item_id": "42",
            "checkout_url": "https://t.me/tribute/app?startapp=sub",
            "price_options": [
                {"price_major": "500", "currency": "RUB", "period": "monthly"},
            ],
            "requires_non_anonymous": False,
        },
        is_published=True,
        sort_order=10,
        created_by_id=None,
    )
    repo = SponsorCheckoutRepository(session)
    created_at = datetime.datetime(2026, 8, 14, 11, 59)
    await repo.create(
        user_id=123,
        offer_id=offer.id,
        provider="tribute",
        commerce_type="subscription",
        payment_mode="recurring",
        external_item_id="42",
        status="pending",
        offer_snapshot={
            "id": str(offer.id),
            "title": offer.title,
            "description": offer.description,
            "commerce_rule_id": str(rule.id),
            "is_published": True,
            "sort_order": 10,
            "provider": "tribute",
            "commerce_type": "subscription",
            "payment_mode": "recurring",
            "external_item_id": "42",
            "checkout_url": "https://t.me/tribute/app?startapp=sub",
            "price_options": [
                {"price_major": "500", "currency": "RUB", "period": "monthly"},
            ],
            "requires_non_anonymous": False,
            "availability": "ready",
        },
        expires_at=datetime.datetime(2026, 8, 14, 12, 30, tzinfo=datetime.UTC),
        created_at=created_at,
        updated_at=created_at,
    )
    return repo


@pytest.mark.asyncio
async def test_published_offer_can_be_unpublished_with_sql_null_snapshot(
    session: AsyncSession,
) -> None:
    await UserRepository(session).create(
        id=123,
        username="sponsor",
        full_name="Sponsor",
        is_active=True,
    )
    profile = await AccessProfileRepository(session).create(
        name="Sponsor access",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        status="ACTIVE",
        internal_squad_uuids=[],
        is_active=True,
    )
    rule = await CommerceRuleRepository(session).create(
        provider="tribute",
        name="Monthly sponsor",
        commerce_type="subscription",
        payment_mode="recurring",
        external_item_id="42",
        currency="RUB",
        calculation_type="provider_expiry",
        calculator={},
        access_profile_id=profile.id,
        grant_mode="replace",
        priority=100,
        is_enabled=True,
        created_by_id=123,
    )
    offers = SponsorOfferRepository(session)
    offer = await offers.create(
        provider="tribute",
        commerce_rule_id=rule.id,
        title="Monthly sponsor",
        description="Extended access",
        checkout_snapshot={
            "provider": "tribute",
            "commerce_type": "subscription",
            "payment_mode": "recurring",
            "external_item_id": "42",
            "checkout_url": "https://t.me/tribute/app?startapp=sub",
            "price_options": [
                {"price_major": "500", "currency": "RUB", "period": "monthly"},
            ],
            "requires_non_anonymous": False,
        },
        is_published=True,
        sort_order=10,
        created_by_id=123,
    )

    updated = await offers.update(
        offer,
        checkout_snapshot=None,
        is_published=False,
    )

    assert updated.is_published is False
    assert updated.checkout_snapshot is None


@pytest.mark.asyncio
async def test_signed_subscription_event_confirms_only_matching_pending_checkout(
    session: AsyncSession,
) -> None:
    checkout_repo = await _seed_checkout(session)
    now = datetime.datetime(2026, 8, 14, 12, 0, tzinfo=datetime.UTC)
    event = TributeWebhookInboxInput(
        delivery_key="a" * 64,
        event_name="new_subscription",
        event_family="subscription",
        processing_status="observed",
        provider_created_at=now,
        provider_sent_at=now,
        provider_expires_at=now + datetime.timedelta(days=30),
        is_anonymous=None,
        telegram_user_id=123,
        external_item_id="42",
        amount_minor=500,
        currency="RUB",
        payment_mode="recurring",
        provider_period="monthly",
        subscription_type="regular",
    )
    source = await TributeWebhookEventRepository(session).record_once(event)
    assert source is not None

    confirmed = await checkout_repo.confirm_matching(source, now)

    assert confirmed is not None
    assert confirmed.mismatch_reason is None
    assert confirmed.checkout.status == "confirmed"
    assert confirmed.checkout.provider_event_id == source.id
    assert confirmed.checkout.confirmed_at == now
    assert await checkout_repo.get_pending_for_user(123) is None


@pytest.mark.asyncio
async def test_unrelated_provider_item_does_not_confirm_checkout(session: AsyncSession) -> None:
    checkout_repo = await _seed_checkout(session)
    now = datetime.datetime(2026, 8, 14, 12, 0, tzinfo=datetime.UTC)
    event = TributeWebhookInboxInput(
        delivery_key="b" * 64,
        event_name="new_subscription",
        event_family="subscription",
        processing_status="observed",
        provider_created_at=now,
        provider_sent_at=now,
        provider_expires_at=now + datetime.timedelta(days=30),
        is_anonymous=None,
        telegram_user_id=123,
        external_item_id="99",
        amount_minor=500,
        currency="RUB",
        payment_mode="recurring",
        provider_period="monthly",
        subscription_type="regular",
    )
    source = await TributeWebhookEventRepository(session).record_once(event)
    assert source is not None

    assert await checkout_repo.confirm_matching(source, now) is None
    pending = await checkout_repo.get_pending_for_user(123)
    assert pending is not None
    assert pending.status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("amount_minor", "currency", "confirmed"),
    [
        (50_000, "RUB", True),
        (10_000, "RUB", False),
        (50_000, "USD", False),
    ],
)
async def test_donation_checkout_requires_its_expected_amount_and_currency(
    session: AsyncSession,
    amount_minor: int,
    currency: str,
    confirmed: bool,
) -> None:
    checkout_repo = await _seed_checkout(session)
    checkout = await checkout_repo.get_pending_for_user(123)
    assert checkout is not None
    checkout.commerce_type = "donation"
    checkout.payment_mode = "any"
    checkout.external_item_id = None
    checkout.offer_snapshot = {
        **checkout.offer_snapshot,
        "commerce_type": "donation",
        "payment_mode": "any",
        "external_item_id": None,
        "expected_amount_minor": 50_000,
        "expected_payment_mode": "one_time",
        "expected_provider_period": None,
        "price_options": [
            {"price_major": "500", "currency": "RUB", "period": None},
        ],
        "requires_non_anonymous": True,
    }
    await session.flush()
    now = datetime.datetime(2026, 8, 14, 12, 0, tzinfo=datetime.UTC)
    event = TributeWebhookInboxInput(
        delivery_key=("c" if confirmed else "d") * 64,
        event_name="new_donation",
        event_family="donation",
        processing_status="observed",
        provider_created_at=now,
        provider_sent_at=now,
        provider_expires_at=None,
        is_anonymous=False,
        telegram_user_id=123,
        external_item_id=None,
        amount_minor=amount_minor,
        currency=currency,
        payment_mode="one_time",
        provider_period=None,
        subscription_type=None,
    )
    source = await TributeWebhookEventRepository(session).record_once(event)
    assert source is not None

    result = await checkout_repo.confirm_matching(source, now)

    assert result is not None
    assert (result.mismatch_reason is None) is confirmed
    latest = await checkout_repo.latest_for_user(123)
    assert latest is not None
    assert latest.status == ("confirmed" if confirmed else "expired")


@pytest.mark.asyncio
async def test_donation_provider_request_id_is_not_compared_to_opaque_checkout_link(
    session: AsyncSession,
) -> None:
    checkout_repo = await _seed_checkout(session)
    checkout = await checkout_repo.get_pending_for_user(123)
    assert checkout is not None
    checkout.commerce_type = "donation"
    checkout.payment_mode = "any"
    checkout.external_item_id = None
    checkout.offer_snapshot = {
        **checkout.offer_snapshot,
        "commerce_type": "donation",
        "payment_mode": "any",
        "external_item_id": None,
        "expected_amount_minor": 50_000,
        "expected_payment_mode": "one_time",
        "expected_provider_period": None,
        "price_options": [{"price_major": "500", "currency": "RUB", "period": None}],
        "requires_non_anonymous": True,
    }
    await session.flush()
    event_time = checkout.created_at.replace(tzinfo=datetime.UTC) + datetime.timedelta(seconds=1)
    event = TributeWebhookInboxInput(
        delivery_key="e" * 64,
        event_name="new_donation",
        event_family="donation",
        processing_status="observed",
        provider_created_at=event_time,
        provider_sent_at=event_time,
        provider_expires_at=None,
        is_anonymous=False,
        telegram_user_id=123,
        external_item_id="provider-donation-request",
        amount_minor=50_000,
        currency="RUB",
        payment_mode="one_time",
        provider_period=None,
        subscription_type=None,
    )
    source = await TributeWebhookEventRepository(session).record_once(event)
    assert source is not None

    result = await checkout_repo.confirm_matching(source, event_time)

    assert result is not None
    assert result.mismatch_reason is None
    assert result.checkout.provider_event_id == source.id


@pytest.mark.asyncio
async def test_donation_event_created_before_checkout_cannot_confirm_it(
    session: AsyncSession,
) -> None:
    checkout_repo = await _seed_checkout(session)
    checkout = await checkout_repo.get_pending_for_user(123)
    assert checkout is not None
    checkout.commerce_type = "donation"
    checkout.payment_mode = "any"
    checkout.external_item_id = None
    checkout.offer_snapshot = {
        **checkout.offer_snapshot,
        "commerce_type": "donation",
        "payment_mode": "any",
        "external_item_id": None,
        "expected_amount_minor": 50_000,
        "expected_payment_mode": "one_time",
        "expected_provider_period": None,
        "price_options": [{"price_major": "500", "currency": "RUB", "period": None}],
        "requires_non_anonymous": True,
    }
    await session.flush()
    event_time = checkout.created_at.replace(tzinfo=datetime.UTC) - datetime.timedelta(seconds=1)
    event = TributeWebhookInboxInput(
        delivery_key="f" * 64,
        event_name="new_donation",
        event_family="donation",
        processing_status="observed",
        provider_created_at=event_time,
        provider_sent_at=event_time,
        provider_expires_at=None,
        is_anonymous=False,
        telegram_user_id=123,
        external_item_id="provider-donation-request",
        amount_minor=50_000,
        currency="RUB",
        payment_mode="one_time",
        provider_period=None,
        subscription_type=None,
    )
    source = await TributeWebhookEventRepository(session).record_once(event)
    assert source is not None

    assert await checkout_repo.confirm_matching(source, event_time) is None
    assert (await checkout_repo.get_pending_for_user(123)) is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("actual_mode", "actual_period", "matches"),
    [
        ("recurring", "monthly", True),
        ("recurring", "weekly", False),
        ("one_time", None, False),
    ],
)
async def test_donation_checkout_requires_the_exact_payment_schedule(
    session: AsyncSession,
    actual_mode: str,
    actual_period: str | None,
    matches: bool,
) -> None:
    checkout_repo = await _seed_checkout(session)
    checkout = await checkout_repo.get_pending_for_user(123)
    assert checkout is not None
    checkout.commerce_type = "donation"
    checkout.payment_mode = "recurring"
    checkout.external_item_id = None
    checkout.offer_snapshot = {
        **checkout.offer_snapshot,
        "commerce_type": "donation",
        "payment_mode": "any",
        "external_item_id": None,
        "expected_amount_minor": 50_000,
        "expected_payment_mode": "recurring",
        "expected_provider_period": "monthly",
        "price_options": [{"price_major": "500", "currency": "RUB", "period": "monthly"}],
        "requires_non_anonymous": True,
    }
    await session.flush()
    now = datetime.datetime(2026, 8, 14, 12, 0, tzinfo=datetime.UTC)
    event = TributeWebhookInboxInput(
        delivery_key=("1" if matches else "2" if actual_mode == "recurring" else "3") * 64,
        event_name="new_donation",
        event_family="donation",
        processing_status="observed",
        provider_created_at=now,
        provider_sent_at=now,
        provider_expires_at=None,
        is_anonymous=False,
        telegram_user_id=123,
        external_item_id=None,
        amount_minor=50_000,
        currency="RUB",
        payment_mode=actual_mode,
        provider_period=actual_period,
        subscription_type=None,
    )
    source = await TributeWebhookEventRepository(session).record_once(event)
    assert source is not None

    result = await checkout_repo.confirm_matching(source, now)

    assert result is not None
    assert (result.mismatch_reason is None) is matches
    assert result.checkout.status == ("confirmed" if matches else "expired")
