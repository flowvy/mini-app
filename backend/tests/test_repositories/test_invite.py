"""Tests for reusable user-owned invitation persistence."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.repositories.invite import InviteRepository
from flowvy.repositories.user import UserRepository


async def _create_user(session: AsyncSession, user_id: int = 300001) -> None:
    await UserRepository(session).create(id=user_id, full_name="Invite User")


async def test_user_owns_one_reusable_code(session: AsyncSession) -> None:
    await _create_user(session)
    repo = InviteRepository(session)

    invite = await repo.create(
        code="FVY23456789ABCDEFGHJKM",
        created_by_id=300001,
    )

    assert invite.code == "FVY23456789ABCDEFGHJKM"
    assert invite.created_by_id == 300001
    assert invite.is_active is True
    assert (await repo.get_by_owner(300001)).id == invite.id  # type: ignore[union-attr]
    assert (await repo.get_by_code(invite.code)).id == invite.id  # type: ignore[union-attr]


async def test_invited_user_is_counted_for_owner(session: AsyncSession) -> None:
    users = UserRepository(session)
    await users.create(id=300002, full_name="Owner")
    await users.create(id=300003, full_name="Invitee", invited_by_id=300002)
    await users.create(id=300004, full_name="Unrelated")

    assert await users.count_invited_by(300002) == 1
    assert await users.count_invited_by(300004) == 0
