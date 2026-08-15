"""Failure and concurrency tests for the durable entitlement executor."""

from __future__ import annotations

import asyncio
import datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.config import Settings
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.repositories.entitlement_baseline import EntitlementBaselineRepository
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


def _provider_user(
    expiry: datetime.datetime,
    *,
    telegram_id: int = 123,
    **overrides: object,
) -> RemnawaveUserData:
    raw = {
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
    }
    raw.update(overrides)
    return RemnawaveUserData.from_raw(
        raw,
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


async def _seed_baseline(session: AsyncSession, expires_at: datetime.datetime) -> None:
    await EntitlementBaselineRepository(session).create(
        user_id=123,
        had_access=True,
        remnawave_user_id=42,
        profile_snapshot=_profile_snapshot(),
        expires_at=expires_at,
    )


async def _pending_grant(
    session: AsyncSession,
    semantic_key: str = "payment:grant:1",
):
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    return await EntitlementOperationRepository(session).create(
        provider="tribute",
        semantic_key=semantic_key,
        event_name="entitlement_grant",
        operation_kind="grant",
        status="pending",
        provider_created_at=now,
        telegram_user_id=123,
        user_id=123,
        remnawave_user_id=42,
        provider_reference_id=semantic_key.rsplit(":", 1)[-1],
        external_item_id="456",
        amount_minor=50_000,
        currency="RUB",
        duration_days=30,
        grant_mode="extend",
        profile_snapshot=_profile_snapshot(),
    )


async def _pending_subscription_sync(
    session: AsyncSession,
    target_expiry: datetime.datetime,
):
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    return await EntitlementOperationRepository(session).create(
        provider="tribute",
        semantic_key="subscription:state:test",
        event_name="renewed_subscription",
        operation_kind="grant",
        status="pending",
        provider_created_at=now,
        telegram_user_id=123,
        user_id=123,
        remnawave_user_id=42,
        external_item_id="12",
        amount_minor=500,
        currency="RUB",
        duration_days=None,
        grant_mode="replace",
        target_expiry=target_expiry,
        profile_snapshot=_profile_snapshot(),
    )


def _remnawave(current: RemnawaveUserData) -> AsyncMock:
    client = AsyncMock(spec=RemnawaveClient)
    client.get_user_by_id = AsyncMock(return_value=current)

    async def update(_user, request):
        values: dict[str, object] = {"expire_at": request.expire_at}
        for field in (
            "status",
            "traffic_limit_bytes",
            "traffic_limit_strategy",
            "description",
            "tag",
            "hwid_device_limit",
            "external_squad_uuid",
        ):
            if field in request.model_fields_set:
                value = getattr(request, field)
                values[field] = str(value) if field == "external_squad_uuid" and value else value
        if "active_internal_squads" in request.model_fields_set:
            values["active_internal_squads"] = []
        return current.model_copy(update=values)

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
    assert stored.calculation_at is not None
    assert stored.target_expiry == stored.calculation_at + datetime.timedelta(days=30)
    assert stored.provider_expiry == stored.target_expiry
    assert stored.attempt_count == 1
    assert subscription is not None
    assert subscription.expires_at == stored.target_expiry.replace(tzinfo=None)
    request = provider.update_user_access.await_args.args[1]
    assert request.expire_at == stored.target_expiry
    assert request.status == "ACTIVE"
    assert request.hwid_device_limit == 2


@pytest.mark.asyncio
async def test_subscription_applies_provider_expiry_without_adding_local_days(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    current_expiry = now + datetime.timedelta(days=2)
    tribute_expiry = now + datetime.timedelta(days=30)
    async with factory() as session:
        await _seed_subject(session)
        operation_id = (await _pending_subscription_sync(session, tribute_expiry)).id
        await session.commit()
    provider = _remnawave(_provider_user(current_expiry))

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        stored = await EntitlementOperationRepository(session).get_by_id(operation_id)
    assert stored is not None
    assert stored.status == "applied"
    assert stored.duration_days is None
    assert stored.base_expiry == current_expiry
    assert stored.target_expiry == tribute_expiry
    request = provider.update_user_access.await_args.args[1]
    assert request.expire_at == tribute_expiry


@pytest.mark.asyncio
async def test_subscription_normalizes_fractional_provider_expiry_to_remnawave_precision(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    current_expiry = now + datetime.timedelta(days=2)
    tribute_expiry = now.replace(microsecond=554_180) + datetime.timedelta(days=30)
    expected_expiry = tribute_expiry.replace(microsecond=554_000)
    async with factory() as session:
        await _seed_subject(session)
        operation_id = (await _pending_subscription_sync(session, tribute_expiry)).id
        await session.commit()
    provider = _remnawave(_provider_user(current_expiry))

    async def update_with_remnawave_precision(_user, request):
        return _provider_user(
            request.expire_at.replace(
                microsecond=(request.expire_at.microsecond // 1000) * 1000,
            )
        )

    provider.update_user_access = AsyncMock(side_effect=update_with_remnawave_precision)

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        stored = await EntitlementOperationRepository(session).get_by_id(operation_id)
    assert stored is not None
    assert stored.status == "applied"
    assert stored.reason_code is None
    assert stored.target_expiry == expected_expiry
    assert stored.provider_expiry == expected_expiry
    request = provider.update_user_access.await_args.args[1]
    assert request.expire_at == expected_expiry


@pytest.mark.asyncio
async def test_subscription_overlays_longer_base_access_and_schedules_its_restoration(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    tribute_expiry = now + datetime.timedelta(days=30)
    current_expiry = tribute_expiry + datetime.timedelta(days=10)
    async with factory() as session:
        await _seed_subject(session)
        operation_id = (await _pending_subscription_sync(session, tribute_expiry)).id
        await session.commit()
    provider = _remnawave(_provider_user(current_expiry))

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        stored = await EntitlementOperationRepository(session).get_by_id(operation_id)
        restores = list(
            (
                await session.scalars(
                    select(EntitlementOperation).where(
                        EntitlementOperation.operation_kind == "restore"
                    )
                )
            ).all()
        )
    assert stored is not None
    assert stored.status == "applied"
    assert stored.target_expiry == tribute_expiry
    assert len(restores) == 1
    assert restores[0].target_expiry == current_expiry
    assert restores[0].next_attempt_at == tribute_expiry


@pytest.mark.asyncio
async def test_first_paid_access_creates_provider_user_and_local_link(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await UserRepository(session).create(
            id=123,
            username="test",
            full_name="Test User",
        )
        operation = await _pending_grant(session)
        operation.remnawave_user_id = None
        operation_id = operation.id
        await session.commit()
    provider = AsyncMock(spec=RemnawaveClient)
    provider.get_user_by_telegram_id = AsyncMock(return_value=None)

    async def create(request):
        return _provider_user(request.expire_at)

    provider.create_user = AsyncMock(side_effect=create)
    provider.update_user_access = AsyncMock()

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        stored = await EntitlementOperationRepository(session).get_by_id(operation_id)
        baseline = await EntitlementBaselineRepository(session).get_by_id(123)
        subscription = await SubscriptionRepository(session).get_by_remnawave_user_id(42)
        restores = list(
            (
                await session.scalars(
                    select(EntitlementOperation).where(
                        EntitlementOperation.operation_kind == "restore"
                    )
                )
            ).all()
        )
    assert stored is not None and stored.status == "applied"
    assert stored.remnawave_user_id == 42
    assert baseline is not None and baseline.had_access is False
    assert subscription is not None and subscription.user_id == 123
    assert len(restores) == 1
    assert stored.target_expiry is not None
    restore_id = restores[0].id
    provider.create_user.assert_awaited_once()
    provider.update_user_access.assert_not_awaited()

    paid_user = _provider_user(stored.target_expiry)
    provider.get_user_by_id = AsyncMock(return_value=paid_user)

    async def disable(_user, request):
        return paid_user.model_copy(
            update={"status": request.status, "expire_at": request.expire_at},
        )

    provider.update_user_access = AsyncMock(side_effect=disable)
    async with factory() as session, session.begin():
        restore = await EntitlementOperationRepository(session).get_locked(restore_id)
        assert restore is not None
        restore.next_attempt_at = datetime.datetime.now(datetime.UTC)

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True
    async with factory() as session:
        restore = await EntitlementOperationRepository(session).get_by_id(restore_id)
    assert restore is not None and restore.status == "applied"
    disable_request = provider.update_user_access.await_args.args[1]
    assert disable_request.status == "DISABLED"


@pytest.mark.asyncio
async def test_paid_overlay_restores_the_full_base_profile_at_expiry(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    base_expiry = now + datetime.timedelta(days=365)
    paid_expiry = now + datetime.timedelta(days=30)
    base_user = _provider_user(
        base_expiry,
        description="Base access",
        tag="BASE",
        hwidDeviceLimit=1,
    )
    async with factory() as session:
        await _seed_subject(session)
        await _pending_subscription_sync(session, paid_expiry)
        await session.commit()
    provider = _remnawave(base_user)
    executor = EntitlementExecutor(factory, provider, _settings())

    assert await executor.process_next() is True
    async with factory() as session, session.begin():
        restore = (
            await session.scalars(
                select(EntitlementOperation).where(
                    EntitlementOperation.operation_kind == "restore"
                )
            )
        ).one()
        restore.next_attempt_at = now
        restore_id = restore.id

    provider.get_user_by_id = AsyncMock(return_value=_provider_user(paid_expiry))
    assert await executor.process_next() is True

    async with factory() as session:
        restore = await EntitlementOperationRepository(session).get_by_id(restore_id)
    assert restore is not None and restore.status == "applied"
    request = provider.update_user_access.await_args_list[-1].args[1]
    assert request.expire_at == base_expiry
    assert request.description == "Base access"
    assert request.tag == "BASE"
    assert request.hwid_device_limit == 1


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
        await _seed_baseline(session, baseline)
        operations = EntitlementOperationRepository(session)
        original = await operations.create(
            provider="tribute",
            semantic_key="payment:grant:1",
            event_name="entitlement_grant",
            operation_kind="grant",
            status="applied",
            provider_created_at=now,
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            provider_reference_id="1",
            duration_days=30,
            grant_mode="extend",
            base_expiry=baseline,
            calculation_at=now,
            target_expiry=original_target,
            provider_expiry=original_target,
            profile_snapshot=_profile_snapshot(),
            applied_at=now,
        )
        await operations.create(
            provider="tribute",
            semantic_key="payment:grant:2",
            event_name="entitlement_grant",
            operation_kind="grant",
            status="applied",
            provider_created_at=now + datetime.timedelta(seconds=1),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            provider_reference_id="2",
            duration_days=30,
            grant_mode="extend",
            base_expiry=original_target,
            calculation_at=now,
            target_expiry=later_target,
            provider_expiry=later_target,
            profile_snapshot=_profile_snapshot(),
            applied_at=now + datetime.timedelta(seconds=1),
        )
        refund = await operations.create(
            provider="tribute",
            semantic_key="payment:refund:1",
            event_name="entitlement_refund",
            operation_kind="refund",
            status="pending",
            root_operation_id=original.id,
            provider_created_at=now + datetime.timedelta(seconds=2),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            provider_reference_id="1",
        )
        refund_id = refund.id
        await session.commit()
    provider = _remnawave(_provider_user(later_target))

    assert await EntitlementExecutor(factory, provider, _settings()).process_next() is True

    async with factory() as session:
        refund = await EntitlementOperationRepository(session).get_by_id(refund_id)
    assert refund is not None
    assert refund.status == "applied"
    assert refund.calculation_at is not None
    assert refund.target_expiry == now + datetime.timedelta(days=30)
    request = provider.update_user_access.await_args.args[1]
    assert request.expire_at == refund.target_expiry
    assert request.status == "ACTIVE"
    assert request.active_internal_squads == []


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
        await _seed_baseline(session, baseline)
        operations = EntitlementOperationRepository(session)
        original = await operations.create(
            provider="tribute",
            semantic_key="payment:grant:1",
            event_name="entitlement_grant",
            operation_kind="grant",
            status="applied",
            provider_created_at=now,
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            provider_reference_id="1",
            duration_days=30,
            grant_mode="extend",
            base_expiry=baseline,
            calculation_at=now,
            target_expiry=original_target,
            provider_expiry=original_target,
            profile_snapshot=_profile_snapshot(),
            applied_at=now,
        )
        later = await operations.create(
            provider="tribute",
            semantic_key="payment:grant:2",
            event_name="entitlement_grant",
            operation_kind="grant",
            status="applied",
            provider_created_at=now + datetime.timedelta(seconds=1),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            provider_reference_id="2",
            duration_days=30,
            grant_mode="extend",
            base_expiry=original_target,
            calculation_at=now,
            target_expiry=later_target,
            provider_expiry=later_target,
            profile_snapshot=_profile_snapshot(),
            applied_at=now + datetime.timedelta(seconds=1),
        )
        await operations.create(
            provider="tribute",
            semantic_key="payment:refund:2",
            event_name="entitlement_refund",
            operation_kind="refund",
            status="applied",
            root_operation_id=later.id,
            provider_created_at=now + datetime.timedelta(seconds=2),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            provider_reference_id="2",
            base_expiry=later_target,
            calculation_at=now,
            target_expiry=original_target,
            provider_expiry=original_target,
            applied_at=now + datetime.timedelta(seconds=2),
        )
        refund = await operations.create(
            provider="tribute",
            semantic_key="payment:refund:1",
            event_name="entitlement_refund",
            operation_kind="refund",
            status="pending",
            root_operation_id=original.id,
            provider_created_at=now + datetime.timedelta(seconds=3),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            provider_reference_id="1",
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
        await _pending_grant(session, "payment:grant:1")
        await _pending_grant(session, "payment:grant:2")
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
        await _pending_grant(seed, "payment:grant:1")
        await _pending_grant(seed, "payment:grant:2")
        await seed.commit()

    now = datetime.datetime.now(datetime.UTC)
    async with factory() as first_session, factory() as second_session:
        async with first_session.begin():
            first = await EntitlementOperationRepository(first_session).claim_next(now)
            assert first is not None
            async with second_session.begin():
                second = await EntitlementOperationRepository(second_session).claim_next(now)

    assert second is None


@pytest.mark.asyncio
async def test_due_restore_waits_for_new_paid_work_for_the_same_user(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    async with factory() as session:
        await _seed_subject(session)
        grant = await _pending_grant(session)
        await EntitlementOperationRepository(session).create(
            provider="tribute",
            semantic_key="effective_access:restore:test",
            event_name="effective_access_restore",
            operation_kind="restore",
            status="pending",
            root_operation_id=grant.id,
            provider_created_at=now - datetime.timedelta(days=30),
            telegram_user_id=123,
            user_id=123,
            remnawave_user_id=42,
            base_expiry=now,
            next_attempt_at=now,
        )
        await session.commit()

    async with factory() as session, session.begin():
        claimed = await EntitlementOperationRepository(session).claim_next(now)

    assert claimed is not None
    assert claimed.operation_kind == "grant"


def test_executor_is_disabled_by_default_and_requires_a_complete_remnawave_target() -> None:
    settings = Settings(_env_file=None)
    assert settings.tribute_entitlement_execution_enabled is False
    assert settings.tribute_identified_donation_automation_enabled is False
    with pytest.raises(ValueError, match="REMNAWAVE_URL"):
        Settings(_env_file=None, tribute_entitlement_execution_enabled=True)
