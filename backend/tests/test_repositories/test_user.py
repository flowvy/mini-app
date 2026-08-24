"""Tests for UserRepository."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.models.user import UserRole
from flowvy.repositories.user import UserRepository


async def test_create_user(session: AsyncSession) -> None:
    """Create a user and verify all persisted fields."""
    repo = UserRepository(session)
    user = await repo.create(id=100001, full_name="Alice", username="alice")

    assert user.id == 100001
    assert user.full_name == "Alice"
    assert user.username == "alice"
    assert user.role == UserRole.USER
    assert user.is_active is True
    assert user.created_at is not None


async def test_get_by_telegram_id(session: AsyncSession) -> None:
    """Fetch user by Telegram ID (primary key alias)."""
    repo = UserRepository(session)
    await repo.create(id=100002, full_name="Bob")

    found = await repo.get_by_telegram_id(100002)
    assert found is not None
    assert found.full_name == "Bob"

    missing = await repo.get_by_telegram_id(999999)
    assert missing is None


async def test_get_admins(session: AsyncSession) -> None:
    """Filter users by admin role."""
    repo = UserRepository(session)
    await repo.create(id=100003, full_name="Regular")
    await repo.create(id=100004, full_name="Admin1", role=UserRole.ADMIN)
    await repo.create(id=100005, full_name="Admin2", role=UserRole.ADMIN)

    admins = await repo.get_admins()
    assert len(admins) == 2
    assert all(u.role == UserRole.ADMIN for u in admins)


async def test_get_active_admins_intersects_role_state_and_environment(
    session: AsyncSession,
) -> None:
    repo = UserRepository(session)
    await repo.create(id=100_010, full_name="Allowed", role=UserRole.ADMIN)
    await repo.create(
        id=100_011,
        full_name="Inactive",
        role=UserRole.ADMIN,
        is_active=False,
    )
    await repo.create(id=100_012, full_name="Not in env", role=UserRole.ADMIN)
    await repo.create(id=100_013, full_name="Regular", role=UserRole.USER)

    admins = await repo.get_active_admins(
        [100_010, 100_011, 100_013],
        exclude_telegram_id=100_099,
    )
    excluded = await repo.get_active_admins(
        [100_010],
        exclude_telegram_id=100_010,
    )

    assert [item.id for item in admins] == [100_010]
    assert excluded == []


async def test_update_user(session: AsyncSession) -> None:
    """Update user fields."""
    repo = UserRepository(session)
    user = await repo.create(id=100006, full_name="Old Name")

    updated = await repo.update(user, full_name="New Name", username="new_user")
    assert updated.full_name == "New Name"
    assert updated.username == "new_user"


async def test_delete_user(session: AsyncSession) -> None:
    """Delete a user and confirm it's gone."""
    repo = UserRepository(session)
    user = await repo.create(id=100007, full_name="ToDelete")

    await repo.delete(user)
    assert await repo.get_by_id(100007) is None


async def test_get_all_users(session: AsyncSession) -> None:
    """Paginated list of users."""
    repo = UserRepository(session)
    for i in range(5):
        await repo.create(id=100010 + i, full_name=f"User{i}")

    all_users = await repo.get_all()
    assert len(all_users) == 5

    page = await repo.get_all(offset=2, limit=2)
    assert len(page) == 2
