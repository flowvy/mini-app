"""Tests for SubscriptionRepository."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.models.subscription import SubscriptionStatus
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository


async def _create_user(session: AsyncSession, user_id: int = 200001) -> None:
    """Helper: insert a user so FK constraints are satisfied."""
    repo = UserRepository(session)
    await repo.create(id=user_id, full_name="SubUser")


async def test_create_subscription(session: AsyncSession) -> None:
    """Create a subscription linked to a user."""
    await _create_user(session)
    repo = SubscriptionRepository(session)

    sub = await repo.create(user_id=200001, status=SubscriptionStatus.ACTIVE)
    assert sub.user_id == 200001
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.id is not None


async def test_get_by_user_id(session: AsyncSession) -> None:
    """Fetch all subscriptions for a user."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    await repo.create(user_id=200001)
    await repo.create(user_id=200001)

    subs = await repo.get_by_user_id(200001)
    assert len(subs) == 2


async def test_get_by_remnawave_uuid(session: AsyncSession) -> None:
    """Find subscription by Remnawave external UUID."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    rw_uuid = uuid.uuid4()
    await repo.create(user_id=200001, remnawave_uuid=rw_uuid)

    found = await repo.get_by_remnawave_uuid(rw_uuid)
    assert found is not None
    assert found.remnawave_uuid == rw_uuid

    missing = await repo.get_by_remnawave_uuid(uuid.uuid4())
    assert missing is None


async def test_get_by_remnawave_user_id(session: AsyncSession) -> None:
    """Find subscription by the stable numeric Remnawave identity."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    await repo.create(user_id=200001, remnawave_user_id=314)

    found = await repo.get_by_remnawave_user_id(314)

    assert found is not None
    assert found.remnawave_user_id == 314
    assert await repo.get_by_remnawave_user_id(2718) is None


async def test_upsert_attaches_numeric_id_to_legacy_uuid_record(
    session: AsyncSession,
) -> None:
    """A 2.x cache row gains its numeric identity without losing the UUID."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    legacy_uuid = uuid.uuid4()
    legacy = await repo.create(user_id=200001, remnawave_uuid=legacy_uuid)

    updated = await repo.upsert_from_remnawave(
        user_id=200001,
        remnawave_user_id=314,
        remnawave_uuid=str(legacy_uuid),
        status="ACTIVE",
        device_limit=3,
        expires_at=None,
    )

    assert updated.id == legacy.id
    assert updated.remnawave_user_id == 314
    assert updated.remnawave_uuid == legacy_uuid


async def test_upsert_3_x_claims_only_unambiguous_local_record(
    session: AsyncSession,
) -> None:
    """A UUID-less 3.x response upgrades one clear legacy cache row in place."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    legacy_uuid = uuid.uuid4()
    legacy = await repo.create(user_id=200001, remnawave_uuid=legacy_uuid)

    updated = await repo.upsert_from_remnawave(
        user_id=200001,
        remnawave_user_id=314,
        remnawave_uuid=None,
        status="ACTIVE",
        device_limit=3,
        expires_at=None,
    )

    assert updated.id == legacy.id
    assert updated.remnawave_user_id == 314
    assert updated.remnawave_uuid == legacy_uuid


async def test_upsert_rejects_conflicting_provider_identities(
    session: AsyncSession,
) -> None:
    """Numeric and UUID identities must never silently merge two rows."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    first_uuid = uuid.uuid4()
    second_uuid = uuid.uuid4()
    await repo.create(
        user_id=200001,
        remnawave_user_id=314,
        remnawave_uuid=first_uuid,
    )
    await repo.create(user_id=200001, remnawave_uuid=second_uuid)

    with pytest.raises(ValueError, match="Conflicting Remnawave"):
        await repo.upsert_from_remnawave(
            user_id=200001,
            remnawave_user_id=314,
            remnawave_uuid=str(second_uuid),
            status="ACTIVE",
            device_limit=3,
            expires_at=None,
        )


async def test_get_active_by_user_id(session: AsyncSession) -> None:
    """Return only active subscriptions."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    await repo.create(user_id=200001, status=SubscriptionStatus.ACTIVE)
    await repo.create(user_id=200001, status=SubscriptionStatus.EXPIRED)
    await repo.create(user_id=200001, status=SubscriptionStatus.ACTIVE)

    active = await repo.get_active_by_user_id(200001)
    assert len(active) == 2
    assert all(s.status == SubscriptionStatus.ACTIVE for s in active)


async def test_update_subscription_status(session: AsyncSession) -> None:
    """Change subscription status."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    sub = await repo.create(user_id=200001)

    updated = await repo.update(sub, status=SubscriptionStatus.SUSPENDED)
    assert updated.status == SubscriptionStatus.SUSPENDED


async def test_delete_subscription(session: AsyncSession) -> None:
    """Delete a subscription."""
    await _create_user(session)
    repo = SubscriptionRepository(session)
    sub = await repo.create(user_id=200001)
    sub_id = sub.id

    await repo.delete(sub)
    assert await repo.get_by_id(sub_id) is None
