"""Failure and concurrency tests for the durable entitlement executor."""

from __future__ import annotations

import asyncio
import datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.config import Settings
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.registration import AccessProfileInput
from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.services.entitlement_executor import EntitlementExecutor
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "remnawave_url": "https://panel.example.com",
        "remnawave_api_token": "test-token",
        "tribute_entitlement_execution_enabled": True,
        "tribute_entitlement_worker_interval_seconds": 1,
        "tribute_entitlement_lease_seconds": 30,
        "tribute_entitlement_max_attempts": 3,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def _provider_user(expiry: datetime.datetime, *, telegram_id: int = 123) -> RemnawaveUserData:
    return RemnawaveUserData.from_raw(
        {
            "id": 42,
            "uuid": "550e8400-e29b-41d4-a716-446655440000",
            "shortUuid": "abc123",
            "username": "tg_123",
            "status": "ACTIVE",
            "trafficLimitBytes": 0,
            "trafficLimitStrategy": "NO_RESET",
            "expireAt": expiry.isoformat(),
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-08-01T00:00:00Z",
            "telegramId": telegram_id,
            "hwidDeviceLimit": 2,
            "subscriptionUrl": "https://panel.example.com/sub/abc123",
            "activeInternalSquads": [],
            "userTraffic": {
                "usedTrafficBytes": 0,
                "lifetimeUsedTrafficBytes": 0,
            },
        },
    )


def _profile_snapshot() -> dict[str, object]:
    return AccessProfileInput(
        name="Paid access",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        hwid_device_limit=2,
        status="ACTIVE",
        internal_squad_uuids=[],
    ).model_dump(mode="json")


async def _seed_subject(session: AsyncSession) -> None:
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


async def _pending_grant(
    session: AsyncSession,
    semantic_key: str = "digital_product:purchase:1",
):
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    return await EntitlementOperationRepository(session).create(
        provider="tribute",
        semantic_key=semantic_key,
        event_name="new_digital_product",
        operation_kind="grant",
        status="pending",
        provider_created_at=now,
        telegram_user_id=123,
        user_id=123,
        remnawave_user_id=42,
        purchase_id=semantic_key.rsplit(":", 1)[-1],
        external_item_id="456",
        amount_minor=50_000,
        currency="RUB",
        duration_days=30,
        grant_mode="extend",
        profile_snapshot=_profile_snapshot(),
    )


def _remnawave(current: RemnawaveUserData) -> AsyncMock:
    client = AsyncMock(spec=RemnawaveClient)
    client.get_user_by_id = AsyncMock(return_value=current)

    async def update(_user, request):
        return current.model_copy(
            update={
                "expire_at": request.expire_at,
                "status": "ACTIVE",
                "traffic_limit_bytes": request.traffic_limit_bytes or 0,
            },
        )

    client.update_user_access = AsyncMock(side_effect=update)
    return client


@pytest.mark.asyncio
async def test_grant_persists_absolute_target_then_applies_and_reconciles_local_state(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    current_expiry = datetime.datetime.now(datetime.UTC).replace(
        microsecond=0
    ) + datetime.timedelta(
        days=2,
    )
    async with factory() as session:
        await _seed_subject(session)
        operation = await _pending_grant(session)
        operation_id = operation.id
        await session.commit()
    provider = _remnawave(_provider_user(current_expiry))

    processed = await EntitlementExecutor(factory, provider, _settings()).process_next()

    assert processed is True
    async with factory() as session:
        stored = await EntitlementOperationRepository(session).get_by_id(operation_id)
        subscription = await SubscriptionRepository(session).get_by_remnawave_user_id(42)
    assert stored is not None
    assert stored.status == "applied"
    assert stored.base_expiry == current_expiry
    assert stored.target_expiry == current_expiry + datetime.timedelta(days=30)
    assert stored.provider_expiry == stored.target_expiry
    assert stored.attempt_count == 1
    assert subscription is not None
    assert subscription.expires_at == stored.target_expiry.replace(tzinfo=None)
    request = provider.update_user_access.await_args.args[1]
    assert request.expire_at == stored.target_expiry
    assert request.status == "ACTIVE"
    assert request.hwid_device_limit == 2


@pytest.mark.asyncio
async def test_timeout_retry_reconciles_existing_target_without_second_mutation(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    current_expiry = datetime.datetime.now(datetime.UTC).replace(
        microsecond=0
    ) + datetime.timedelta(
        days=1,
    )
    async with factory() as session:
        await _seed_subject(session)
        operation_id = (await _pending_grant(session)).id
        await session.commit()
    provider = _remnawave(_provider_user(current_expiry))
    provider.update_user_access = AsyncMock(
        side_effect=RemnawaveError(504, "Provider request timed out", retryable=True),
    )
    executor = EntitlementExecutor(factory, provider, _settings())

    assert await executor.process_next() is True
    async with factory() as session, session.begin():
        operation = await EntitlementOperationRepository(session).get_locked(operation_id)
        assert operation is not None
        assert operation.status == "retry"
        target = operation.target_expiry
        assert target is not None
        operation.next_attempt_at = datetime.datetime.now(datetime.UTC)

    provider.get_user_by_id = AsyncMock(return_value=_provider_user(target))
    provider.update_user_access.reset_mock()
    provider.update_user_access.side_effect = None

    assert await executor.process_next() is True
    async with factory() as session:
        operation = await EntitlementOperationRepository(session).get_by_id(operation_id)
    assert operation is not None
    assert operation.status == "applied"
    assert operation.attempt_count == 2
    provider.update_user_access.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_identity_mismatch_fails_closed_without_mutation(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await _seed_subject(session)
        operation_id = (await _pending_grant(session)).id
        await session.commit()
    provider = _remnawave(
        _provider_user(
            datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1), telegram_id=999
        ),
    )

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        operation = await EntitlementOperationRepository(session).get_by_id(operation_id)
    assert operation is not None
    assert operation.status == "review"
    assert operation.reason_code == "provider_identity_mismatch"
    provider.update_user_access.assert_not_awaited()


@pytest.mark.asyncio
async def test_refund_replays_later_grants_and_never_removes_their_contribution(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    baseline = now + datetime.timedelta(days=10)
    original_target = baseline + datetime.timedelta(days=30)
    later_target = original_target + datetime.timedelta(days=30)
    async with factory() as session:
        await _seed_subject(session)
        operations = EntitlementOperationRepository(session)
        original = await operations.create(
            provider="tribute",
            semantic_key="digital_product:purchase:1",
            event_name="new_digital_product",
            operation_kind="grant",
            status="applied",
            provider_created_at=now,
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            purchase_id="1",
            duration_days=30,
            grant_mode="extend",
            base_expiry=baseline,
            calculation_at=now,
            target_expiry=original_target,
            provider_expiry=original_target,
            applied_at=now,
        )
        await operations.create(
            provider="tribute",
            semantic_key="digital_product:purchase:2",
            event_name="new_digital_product",
            operation_kind="grant",
            status="applied",
            provider_created_at=now + datetime.timedelta(seconds=1),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            purchase_id="2",
            duration_days=30,
            grant_mode="extend",
            base_expiry=original_target,
            calculation_at=now,
            target_expiry=later_target,
            provider_expiry=later_target,
            applied_at=now,
        )
        refund = await operations.create(
            provider="tribute",
            semantic_key="digital_product:refund:1",
            event_name="digital_product_refunded",
            operation_kind="refund",
            status="pending",
            root_operation_id=original.id,
            provider_created_at=now + datetime.timedelta(seconds=2),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            purchase_id="1",
        )
        refund_id = refund.id
        await session.commit()
    provider = _remnawave(_provider_user(later_target))

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        refund = await EntitlementOperationRepository(session).get_by_id(refund_id)
    assert refund is not None
    assert refund.status == "applied"
    assert refund.target_expiry == baseline + datetime.timedelta(days=30)
    request = provider.update_user_access.await_args.args[1]
    assert request.expire_at == refund.target_expiry
    assert request.status is None
    assert request.active_internal_squads is None


@pytest.mark.asyncio
async def test_refund_does_not_replay_a_later_grant_already_compensated(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    baseline = now + datetime.timedelta(days=10)
    original_target = baseline + datetime.timedelta(days=30)
    later_target = original_target + datetime.timedelta(days=30)
    async with factory() as session:
        await _seed_subject(session)
        operations = EntitlementOperationRepository(session)
        original = await operations.create(
            provider="tribute",
            semantic_key="digital_product:purchase:1",
            event_name="new_digital_product",
            operation_kind="grant",
            status="applied",
            provider_created_at=now,
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            purchase_id="1",
            duration_days=30,
            grant_mode="extend",
            base_expiry=baseline,
            calculation_at=now,
            target_expiry=original_target,
            provider_expiry=original_target,
            applied_at=now,
        )
        later = await operations.create(
            provider="tribute",
            semantic_key="digital_product:purchase:2",
            event_name="new_digital_product",
            operation_kind="grant",
            status="applied",
            provider_created_at=now + datetime.timedelta(seconds=1),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            purchase_id="2",
            duration_days=30,
            grant_mode="extend",
            base_expiry=original_target,
            calculation_at=now,
            target_expiry=later_target,
            provider_expiry=later_target,
            applied_at=now,
        )
        await operations.create(
            provider="tribute",
            semantic_key="digital_product:refund:2",
            event_name="digital_product_refunded",
            operation_kind="refund",
            status="applied",
            root_operation_id=later.id,
            provider_created_at=now + datetime.timedelta(seconds=2),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            purchase_id="2",
            base_expiry=later_target,
            calculation_at=now,
            target_expiry=original_target,
            provider_expiry=original_target,
            applied_at=now,
        )
        refund = await operations.create(
            provider="tribute",
            semantic_key="digital_product:refund:1",
            event_name="digital_product_refunded",
            operation_kind="refund",
            status="pending",
            root_operation_id=original.id,
            provider_created_at=now + datetime.timedelta(seconds=3),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            purchase_id="1",
        )
        refund_id = refund.id
        await session.commit()
    provider = _remnawave(_provider_user(original_target))

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        refund = await EntitlementOperationRepository(session).get_by_id(refund_id)
    assert refund is not None
    assert refund.status == "applied"
    assert refund.target_expiry == baseline
    request = provider.update_user_access.await_args.args[1]
    assert request.expire_at == baseline


@pytest.mark.asyncio
async def test_processing_user_unique_guard_prevents_parallel_provider_calls(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    current = _provider_user(datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1))
    async with factory() as session:
        await _seed_subject(session)
        await _pending_grant(session, "digital_product:purchase:1")
        await _pending_grant(session, "digital_product:purchase:2")
        await session.commit()
    entered = asyncio.Event()
    release = asyncio.Event()
    provider = _remnawave(current)

    async def blocked_get(_user_id: int) -> RemnawaveUserData:
        entered.set()
        await release.wait()
        return current

    provider.get_user_by_id = AsyncMock(side_effect=blocked_get)
    first = EntitlementExecutor(factory, provider, _settings())
    second = EntitlementExecutor(factory, provider, _settings())
    first_task = asyncio.create_task(first.process_next())
    await entered.wait()

    assert await second.process_next() is False
    release.set()
    assert await first_task is True
    assert provider.get_user_by_id.await_count == 1


@pytest.mark.asyncio
async def test_simultaneous_claims_for_one_user_do_not_hit_the_unique_guard(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as seed:
        await _seed_subject(seed)
        await _pending_grant(seed, "digital_product:purchase:1")
        await _pending_grant(seed, "digital_product:purchase:2")
        await seed.commit()

    now = datetime.datetime.now(datetime.UTC)
    async with factory() as first_session, factory() as second_session:
        async with first_session.begin():
            first = await EntitlementOperationRepository(first_session).claim_next(now)
            assert first is not None
            async with second_session.begin():
                second = await EntitlementOperationRepository(second_session).claim_next(now)

    assert second is None


def test_executor_is_disabled_by_default_and_requires_a_complete_remnawave_target() -> None:
    assert Settings(_env_file=None).tribute_entitlement_execution_enabled is False
    with pytest.raises(ValueError, match="REMNAWAVE_URL"):
        Settings(_env_file=None, tribute_entitlement_execution_enabled=True)
