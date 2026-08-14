"""Deterministic planning and semantic idempotency tests for payment entitlements."""

from __future__ import annotations

import asyncio
import datetime
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
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
    name: str = "new_digital_product",
    family: str = "digital_product",
    purchase_id: str | None = "78901",
    telegram_user_id: int | None = 123,
) -> TributeWebhookInboxInput:
    now = datetime.datetime.now(datetime.UTC)
    return TributeWebhookInboxInput(
        delivery_key=delivery,
        event_name=name,
        event_family=family,
        processing_status="observed",
        provider_created_at=now,
        provider_sent_at=now,
        telegram_user_id=telegram_user_id,
        transaction_id="234567" if family == "digital_product" else None,
        purchase_id=purchase_id,
        external_item_id="456" if family == "digital_product" else "123",
        amount_minor=50_000,
        currency="RUB",
        payment_mode="one_time",
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


async def _seed_grant_contract(session: AsyncSession) -> uuid.UUID:
    await UserRepository(session).create(
        id=123,
        username="test",
        full_name="Test User",
    )
    await SubscriptionRepository(session).create(
        user_id=123,
        remnawave_user_id=42,
        status="active",
        expires_at=datetime.datetime.now() + datetime.timedelta(days=1),
    )
    profile = await AccessProfileRepository(session).create(
        name="Paid access",
        validity_mode="duration",
        validity_days=30,
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
            name="Product access",
            commerce_type="digital_product",
            payment_mode="one_time",
            external_item_id="456",
            currency="RUB",
            calculation_type="fixed",
            fixed_duration_days=30,
            access_profile_id=profile.id,
            grant_mode="extend",
        ),
        admin_id=None,
    )
    return profile.id


@pytest.mark.asyncio
async def test_documented_digital_purchase_creates_immutable_pending_plan(
    session: AsyncSession,
) -> None:
    profile_id = await _seed_grant_contract(session)
    event = _event("a" * 64)

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.semantic_key == "digital_product:purchase:78901"
    assert operation.operation_kind == "grant"
    assert operation.status == "pending"
    assert operation.user_id == 123
    assert operation.remnawave_user_id == 42
    assert operation.duration_days == 30
    assert operation.grant_mode == "extend"
    assert operation.access_profile_id == profile_id
    assert operation.rule_snapshot is not None
    assert operation.profile_snapshot is not None
    assert operation.profile_snapshot["traffic_limit_bytes"] == 0
    assert "telegram_username" not in operation.profile_snapshot
    assert operation.target_expiry is None


@pytest.mark.asyncio
async def test_two_distinct_deliveries_of_one_purchase_create_one_semantic_operation(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await _seed_grant_contract(session)
        first_event = _event("b" * 64)
        second_event = _event("c" * 64)
        first_source = await _source(session, first_event)
        second_source = await _source(session, second_event)
        await session.commit()

    async def plan(source_id: int, event: TributeWebhookInboxInput) -> bool:
        async with factory() as session:
            source = await TributeWebhookEventRepository(session).get_by_id(source_id)
            assert source is not None
            created = await _planner(session).plan(source, event)
            await session.commit()
            return created is not None

    created = await asyncio.gather(
        plan(first_source.id, first_event),
        plan(second_source.id, second_event),
    )

    assert sorted(created) == [False, True]
    async with factory() as session:
        count = await session.scalar(select(func.count()).select_from(EntitlementOperation))
    assert count == 1


@pytest.mark.asyncio
async def test_donation_is_journalled_without_unsafe_semantic_deduction(
    session: AsyncSession,
) -> None:
    event = _event(
        "d" * 64,
        name="new_donation",
        family="donation",
        purchase_id=None,
    )

    operation = await _planner(session).plan(await _source(session, event), event)

    assert operation is not None
    assert operation.operation_kind == "review"
    assert operation.status == "review"
    assert operation.reason_code == "semantic_identity_unverified"
    assert operation.semantic_key is None
    assert operation.target_expiry is None


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
async def test_refund_cancels_a_pending_grant_without_provider_work(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session)
    purchase = _event("f" * 64)
    grant = await _planner(session).plan(await _source(session, purchase), purchase)
    assert grant is not None
    refund = _event("1" * 64, name="digital_product_refunded")

    compensation = await _planner(session).plan(await _source(session, refund), refund)

    assert grant.status == "cancelled"
    assert grant.reason_code == "refunded_before_apply"
    assert compensation is not None
    assert compensation.operation_kind == "refund"
    assert compensation.status == "applied"
    assert compensation.reason_code == "grant_cancelled_before_apply"
    assert compensation.root_operation_id == grant.id


@pytest.mark.asyncio
async def test_refund_arriving_before_purchase_prevents_late_grant(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session)
    refund = _event("2" * 64, name="digital_product_refunded")
    compensation = await _planner(session).plan(await _source(session, refund), refund)
    assert compensation is not None
    assert compensation.reason_code == "refund_source_not_found"
    purchase = _event("3" * 64)

    grant = await _planner(session).plan(await _source(session, purchase), purchase)

    assert grant is not None
    assert grant.status == "cancelled"
    assert grant.reason_code == "purchase_already_refunded"
    assert compensation.status == "applied"
    assert compensation.reason_code == "grant_cancelled_before_apply"


@pytest.mark.asyncio
async def test_admin_journal_projection_excludes_snapshots_and_provider_payload(
    session: AsyncSession,
) -> None:
    await _seed_grant_contract(session)
    event = _event("4" * 64)
    await _planner(session).plan(await _source(session, event), event)

    result = await EntitlementJournalService(
        EntitlementOperationRepository(session),
    ).list_recent(20)

    assert result.has_more is False
    assert len(result.operations) == 1
    payload = result.operations[0].model_dump()
    assert payload["status"] == "pending"
    assert payload["duration_days"] == 30
    assert "rule_snapshot" not in payload
    assert "profile_snapshot" not in payload
    assert "transaction_id" not in payload
