"""Deterministic planning and semantic idempotency tests for payment entitlements."""

from __future__ import annotations

import datetime
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.models.sponsor_checkout import SponsorCheckout
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.entitlement_operation_action import (
    EntitlementOperationActionRepository,
)
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.commerce import CommerceRuleInput
from flowvy.schemas.tribute_webhooks import TributeWebhookInboxInput
from flowvy.services.commerce import CommerceRuleService
from flowvy.services.entitlements import EntitlementJournalService, TributeEntitlementPlanner


def _event(
    delivery: str,
    *,
    name: str = "new_donation",
    family: str = "donation",
    telegram_user_id: int | None = 123,
    provider_expires_at: datetime.datetime | None = None,
    is_anonymous: bool | None = None,
    payment_mode: str | None = None,
    provider_period: str | None = None,
) -> TributeWebhookInboxInput:
    now = datetime.datetime.now(datetime.UTC)
    return TributeWebhookInboxInput(
        delivery_key=delivery,
        event_name=name,
        event_family=family,
        processing_status="observed",
        provider_created_at=now,
        provider_sent_at=now,
        provider_expires_at=provider_expires_at,
        is_anonymous=(False if family == "donation" else None)
        if is_anonymous is None
        else is_anonymous,
        telegram_user_id=telegram_user_id,
        external_item_id="123",
        amount_minor=50_000,
        currency="RUB",
        payment_mode=payment_mode
        or (
            "recurring" if family == "subscription" or name == "recurrent_donation" else "one_time"
        ),
        provider_period=provider_period,
    )


def _planner(session: AsyncSession) -> TributeEntitlementPlanner:
    return TributeEntitlementPlanner(
        EntitlementOperationRepository(session),
        CommerceRuleRepository(session),
        AccessProfileRepository(session),
        UserRepository(session),
        SubscriptionRepository(session),
    )


async def _source(session: AsyncSession, event: TributeWebhookInboxInput):
    source = await TributeWebhookEventRepository(session).record_once(event)
    assert source is not None
    return source


async def _seed_grant_contract(
    session: AsyncSession,
    *,
    commerce_type: str = "donation",
    with_provider_access: bool = True,
    payment_mode: str | None = None,
) -> uuid.UUID:
    await UserRepository(session).create(
        id=123,
        username="test",
        full_name="Test User",
    )
    if with_provider_access:
        await SubscriptionRepository(session).create(
            user_id=123,
            remnawave_user_id=42,
            status="active",
            expires_at=datetime.datetime.now() + datetime.timedelta(days=1),
        )
    profile = await AccessProfileRepository(session).create(
        name="Paid access",
        validity_mode="automation",
        validity_days=None,
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        status="ACTIVE",
        internal_squad_uuids=[],
        is_active=True,
    )
    await CommerceRuleService(
        CommerceRuleRepository(session),
        AccessProfileRepository(session),
    ).create_rule(
        CommerceRuleInput(
            name="Sponsor access",
            commerce_type=commerce_type,
            payment_mode=payment_mode
            or ("recurring" if commerce_type == "subscription" else "any"),
            external_item_id="123" if commerce_type == "subscription" else None,
            currency="RUB",
            calculation_type=("provider_expiry" if commerce_type == "subscription" else "fixed"),
            fixed_duration_days=None if commerce_type == "subscription" else 30,
            access_profile_id=profile.id,
            grant_mode="replace" if commerce_type == "subscription" else "extend",
        ),
        admin_id=None,
    )
    return profile.id


@pytest.mark.asyncio
async def test_first_paid_access_is_planned_without_an_existing_provider_link(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session, with_provider_access=False)
    event = _event("9" * 64)

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.status == "pending"
    assert operation.user_id == 123
    assert operation.telegram_user_id == 123
    assert operation.remnawave_user_id is None


@pytest.mark.asyncio
async def test_identified_donation_creates_one_deterministic_pending_plan(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session, commerce_type="donation")
    event = _event(
        "d" * 64,
        name="new_donation",
        family="donation",
    )

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.operation_kind == "grant"
    assert operation.status == "pending"
    assert operation.reason_code is None
    assert operation.semantic_key is not None
    assert operation.semantic_key.startswith("donation:event:")
    assert operation.duration_days == 30
    assert operation.target_expiry is None


@pytest.mark.asyncio
async def test_initial_recurring_donation_uses_the_recurring_donation_rule(
    session: AsyncSession,
) -> None:
    """A live-observed new_donation/monthly event is the first recurring payment."""
    await _seed_grant_contract(
        session,
        commerce_type="donation",
        payment_mode="recurring",
    )
    event = _event(
        "1" * 64,
        name="new_donation",
        family="donation",
        payment_mode="recurring",
        provider_period="monthly",
    )

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.status == "pending"
    assert operation.reason_code is None
    assert operation.duration_days == 30


@pytest.mark.asyncio
async def test_donation_offer_schedule_mismatch_is_review_only_without_grant(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session, commerce_type="donation")
    rule = (await CommerceRuleRepository(session).get_all())[0]
    event = _event(
        "4" * 64,
        name="new_donation",
        family="donation",
        payment_mode="recurring",
        provider_period="weekly",
    )
    checkout = SponsorCheckout(
        id=uuid.UUID("44444444-4444-4444-8444-444444444444"),
        user_id=123,
        offer_id=None,
        provider="tribute",
        commerce_type="donation",
        payment_mode="recurring",
        external_item_id=None,
        status="expired",
        offer_snapshot={"commerce_rule_id": str(rule.id)},
        expires_at=datetime.datetime.now(datetime.UTC),
    )

    operation = await _planner(session).plan(
        await _source(session, event),
        event,
        sponsor_checkout=checkout,
        sponsor_checkout_mismatch_reason="donation_offer_mismatch",
    )

    assert operation is not None
    assert operation.operation_kind == "grant"
    assert operation.status == "review"
    assert operation.reason_code == "donation_offer_mismatch"
    assert operation.duration_days is None


@pytest.mark.asyncio
async def test_recurring_donation_cancellation_is_resolved_audit_without_access_work(
    session: AsyncSession,
) -> None:
    event = _event(
        "0" * 64,
        name="cancelled_donation",
        family="donation",
        payment_mode="recurring",
        provider_period="monthly",
    )

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.operation_kind == "review"
    assert operation.status == "resolved"
    assert operation.reason_code == "cancellation_is_not_refund"
    assert operation.user_id is None
    assert operation.remnawave_user_id is None
    assert operation.target_expiry is None
    assert operation.semantic_key is not None
    assert operation.semantic_key.startswith("payment:cancellation:")


@pytest.mark.asyncio
async def test_anonymous_donation_requires_manual_review_without_grant(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session, commerce_type="donation")
    event = _event(
        "5" * 64,
        name="new_donation",
        family="donation",
        telegram_user_id=None,
        is_anonymous=True,
    )

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.operation_kind == "grant"
    assert operation.status == "review"
    assert operation.reason_code == "anonymous_donation"
    assert operation.semantic_key is not None


@pytest.mark.asyncio
async def test_subscription_uses_tribute_absolute_expiry_and_deduplicates_state(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session, commerce_type="subscription")
    expires_at = datetime.datetime.now(datetime.UTC).replace(microsecond=0) + datetime.timedelta(
        days=30,
    )
    first = _event(
        "6" * 64,
        name="new_subscription",
        family="subscription",
        provider_expires_at=expires_at,
    )
    second = _event(
        "7" * 64,
        name="renewed_subscription",
        family="subscription",
        provider_expires_at=expires_at,
    )

    operation = await _planner(session).plan(await _source(session, first), first)
    duplicate = await _planner(session).plan(await _source(session, second), second)

    assert operation is not None
    assert operation.operation_kind == "grant"
    assert operation.status == "pending"
    assert operation.duration_days is None
    assert operation.grant_mode == "replace"
    assert operation.target_expiry == expires_at
    assert operation.semantic_key.startswith("subscription:state:")
    assert duplicate is None


@pytest.mark.asyncio
async def test_unknown_local_identity_never_creates_a_user_or_grant(
    session: AsyncSession,
) -> None:
    event = _event("e" * 64, telegram_user_id=999)

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.status == "review"
    assert operation.reason_code == "user_not_found"
    assert await UserRepository(session).get_by_id(999) is None


@pytest.mark.asyncio
async def test_admin_journal_projection_excludes_snapshots_and_provider_payload(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session)
    event = _event("4" * 64)
    await _planner(session).plan(await _source(session, event), event)

    result = await EntitlementJournalService(
        EntitlementOperationRepository(session),
        EntitlementOperationActionRepository(session),
    ).list_recent(20)

    assert result.has_more is False
    assert len(result.operations) == 1
    payload = result.operations[0].model_dump()
    assert payload["status"] == "pending"
    assert payload["duration_days"] == 30
    assert "rule_snapshot" not in payload
    assert "profile_snapshot" not in payload
    assert "transaction_id" not in payload
