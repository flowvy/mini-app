"""Legacy user import and scheduled FREE restoration tests."""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.config import Settings
from flowvy.models.entitlement_baseline import EntitlementBaseline
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.subscription import Subscription
from flowvy.models.user import User
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.services.entitlement_executor import EntitlementExecutor
from flowvy.services.legacy_user_import import (
    FREE_EXPIRES_AT,
    LEGACY_ACCESS_EVENT,
    LEGACY_RESTORE_EVENT,
    LegacyUserImportError,
    LegacyUserImportService,
    LegacyUserRecord,
)

SNAPSHOT_AT = datetime.datetime(2026, 8, 26, 21, 0, 3, tzinfo=datetime.UTC)


async def _profiles(session: AsyncSession) -> None:
    profiles = AccessProfileRepository(session)
    await profiles.create(
        name="FREE",
        validity_mode="lifetime",
        traffic_limit_bytes=30 * 1024**3,
        traffic_limit_strategy="MONTH",
        hwid_device_limit=1,
        tag="FREE",
        status="ACTIVE",
        internal_squad_uuids=[],
    )
    await profiles.create(
        name="BELIEVER",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=1024**4,
        traffic_limit_strategy="MONTH",
        hwid_device_limit=5,
        tag="BELIEVER",
        status="ACTIVE",
        internal_squad_uuids=[],
    )


def _record(
    telegram_id: int,
    *,
    tag: str,
    provider_id: int,
) -> LegacyUserRecord:
    return LegacyUserRecord(
        telegram_id=telegram_id,
        username=f"user_{telegram_id}",
        full_name=f"User {telegram_id}",
        remnawave_user_id=provider_id,
        remnawave_uuid=uuid.UUID(int=provider_id),
        status="ACTIVE",
        device_limit=5 if tag == "BELIEVER" else 1,
        expires_at=(
            SNAPSHOT_AT + datetime.timedelta(days=30) if tag == "BELIEVER" else FREE_EXPIRES_AT
        ),
        tag=tag,
    )


@pytest.mark.asyncio
async def test_import_is_dry_run_first_and_idempotent(session: AsyncSession) -> None:
    await _profiles(session)
    records = [
        _record(100001, tag="BELIEVER", provider_id=41),
        _record(100002, tag="FREE", provider_id=42),
    ]
    service = LegacyUserImportService(session)

    dry_run = await service.run(records, snapshot_at=SNAPSHOT_AT, apply=False)

    assert dry_run.users_to_create == 2
    assert dry_run.believer_users == 1
    assert dry_run.baselines_to_create == 1
    assert dry_run.grants_to_create == 1
    assert dry_run.restores_to_create == 1
    assert await session.scalar(select(func.count(User.id))) == 0

    applied = await service.run(records, snapshot_at=SNAPSHOT_AT, apply=True)

    assert applied.applied is True
    assert await session.scalar(select(func.count(User.id))) == 2
    assert await session.scalar(select(func.count(Subscription.id))) == 2
    baseline = await session.get(EntitlementBaseline, 100001)
    assert baseline is not None
    assert baseline.had_access is True
    assert baseline.expires_at == FREE_EXPIRES_AT
    operations = list(
        (
            await session.scalars(
                select(EntitlementOperation).where(EntitlementOperation.user_id == 100001),
            )
        ).all(),
    )
    grant = next(item for item in operations if item.event_name == LEGACY_ACCESS_EVENT)
    restore = next(item for item in operations if item.event_name == LEGACY_RESTORE_EVENT)
    assert grant.provider == "flowvy"
    assert grant.status == "applied"
    assert grant.target_expiry == records[0].expires_at
    assert restore.provider == "flowvy"
    assert restore.status == "pending"
    assert restore.root_operation_id == grant.id
    assert restore.base_expiry == records[0].expires_at
    assert restore.target_expiry == FREE_EXPIRES_AT
    assert restore.next_attempt_at == records[0].expires_at

    repeated = await service.run(records, snapshot_at=SNAPSHOT_AT, apply=True)

    assert repeated.users_to_create == 0
    assert repeated.subscriptions_to_create == 0
    assert repeated.subscriptions_to_update == 0
    assert repeated.baselines_to_create == 0
    assert repeated.grants_to_create == 0
    assert repeated.restores_to_create == 0
    assert await session.scalar(select(func.count(EntitlementOperation.id))) == 2


@pytest.mark.asyncio
async def test_import_rejects_conflicting_local_subscription_before_writes(
    session: AsyncSession,
) -> None:
    await _profiles(session)
    user = await UserRepository(session).create(
        id=100001,
        username="current",
        full_name="Current User",
    )
    await SubscriptionRepository(session).create(
        user_id=user.id,
        remnawave_user_id=999,
        remnawave_uuid=uuid.UUID(int=999),
        status="active",
        device_limit=1,
        expires_at=datetime.datetime(2099, 1, 1),
    )

    with pytest.raises(
        LegacyUserImportError,
        match="already has another Remnawave subscription",
    ):
        await LegacyUserImportService(session).run(
            [_record(100001, tag="BELIEVER", provider_id=41)],
            snapshot_at=SNAPSHOT_AT,
            apply=True,
        )

    assert await session.scalar(select(func.count(User.id))) == 1
    assert await session.scalar(select(func.count(EntitlementBaseline.user_id))) == 0
    assert await session.scalar(select(func.count(EntitlementOperation.id))) == 0


@pytest.mark.asyncio
async def test_import_requires_one_lifetime_free_profile(session: AsyncSession) -> None:
    profiles = AccessProfileRepository(session)
    await profiles.create(
        name="Temporary FREE",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        tag="FREE",
        status="ACTIVE",
        internal_squad_uuids=[],
    )
    await profiles.create(
        name="BELIEVER",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        tag="BELIEVER",
        status="ACTIVE",
        internal_squad_uuids=[],
    )

    with pytest.raises(LegacyUserImportError, match="FREE profile must be lifetime"):
        await LegacyUserImportService(session).run(
            [_record(100001, tag="BELIEVER", provider_id=41)],
            snapshot_at=SNAPSHOT_AT,
            apply=False,
        )


@pytest.mark.asyncio
async def test_due_legacy_restore_uses_the_frozen_free_baseline(engine: AsyncEngine) -> None:
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    snapshot_at = now - datetime.timedelta(days=2)
    expiry = now - datetime.timedelta(seconds=1)
    record = _record(100001, tag="BELIEVER", provider_id=41)
    record = LegacyUserRecord(
        telegram_id=record.telegram_id,
        username=record.username,
        full_name=record.full_name,
        remnawave_user_id=record.remnawave_user_id,
        remnawave_uuid=record.remnawave_uuid,
        status=record.status,
        device_limit=record.device_limit,
        expires_at=expiry,
        tag=record.tag,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session, session.begin():
        await _profiles(session)
        await LegacyUserImportService(session).run(
            [record],
            snapshot_at=snapshot_at,
            apply=True,
        )

    provider_user = _provider_user(record, status="EXPIRED", tag="BELIEVER", expiry=expiry)
    remnawave = AsyncMock()
    remnawave.get_user_by_id.return_value = provider_user

    async def update_access(_current: object, request: object) -> RemnawaveUserData:
        return _provider_user(
            record,
            status="ACTIVE",
            tag=request.tag,
            expiry=request.expire_at,
            traffic_limit_bytes=request.traffic_limit_bytes,
            device_limit=request.hwid_device_limit,
        )

    remnawave.update_user_access.side_effect = update_access
    executor = EntitlementExecutor(factory, remnawave, Settings(_env_file=None))

    assert await executor.process_next() is True

    request = remnawave.update_user_access.await_args.args[1]
    assert request.status == "ACTIVE"
    assert request.tag == "FREE"
    assert request.expire_at == FREE_EXPIRES_AT
    assert request.traffic_limit_bytes == 30 * 1024**3
    assert request.hwid_device_limit == 1
    async with factory() as session:
        restore = await EntitlementOperationRepository(session).get_by_semantic_key(
            "flowvy",
            f"legacy:restore:{record.remnawave_uuid}",
        )
        subscription = (await SubscriptionRepository(session).get_by_user_id(record.telegram_id))[
            0
        ]
    assert restore is not None and restore.status == "applied"
    assert subscription.expires_at == FREE_EXPIRES_AT.replace(tzinfo=None)


def _provider_user(
    record: LegacyUserRecord,
    *,
    status: str,
    tag: str | None,
    expiry: datetime.datetime,
    traffic_limit_bytes: int = 1024**4,
    device_limit: int | None = 5,
) -> RemnawaveUserData:
    return RemnawaveUserData.from_raw(
        {
            "id": record.remnawave_user_id,
            "uuid": str(record.remnawave_uuid),
            "shortUuid": "legacy",
            "username": f"tg_{record.telegram_id}",
            "status": status,
            "trafficLimitBytes": traffic_limit_bytes,
            "trafficLimitStrategy": "MONTH",
            "expireAt": expiry.isoformat(),
            "createdAt": SNAPSHOT_AT.isoformat(),
            "updatedAt": SNAPSHOT_AT.isoformat(),
            "subscriptionUrl": "https://panel.example.test/sub/legacy",
            "telegramId": record.telegram_id,
            "hwidDeviceLimit": device_limit,
            "tag": tag,
            "activeInternalSquads": [],
            "userTraffic": {"usedTrafficBytes": 0, "lifetimeUsedTrafficBytes": 0},
        },
    )
