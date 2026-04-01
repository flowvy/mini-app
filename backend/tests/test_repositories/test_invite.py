"""Tests for InviteRepository."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.repositories.invite import InviteRepository
from flowvy.repositories.user import UserRepository


async def _create_user(session: AsyncSession, user_id: int = 300001) -> None:
    """Helper: insert a user so FK constraints are satisfied."""
    repo = UserRepository(session)
    await repo.create(id=user_id, full_name="InviteUser")


async def test_create_invite(session: AsyncSession) -> None:
    """Create an invite with a code."""
    await _create_user(session)
    repo = InviteRepository(session)

    invite = await repo.create(code="ABC123", created_by_id=300001)
    assert invite.code == "ABC123"
    assert invite.is_active is True
    assert invite.used_by_id is None
    assert invite.id is not None


async def test_get_by_code(session: AsyncSession) -> None:
    """Find invite by code string."""
    repo = InviteRepository(session)
    await repo.create(code="FIND_ME")

    found = await repo.get_by_code("FIND_ME")
    assert found is not None
    assert found.code == "FIND_ME"

    missing = await repo.get_by_code("NOPE")
    assert missing is None


async def test_get_unused(session: AsyncSession) -> None:
    """Return only active, unused invites."""
    await _create_user(session, 300002)
    repo = InviteRepository(session)
    await repo.create(code="UNUSED1")
    await repo.create(code="UNUSED2")

    used = await repo.create(code="USED1")
    await repo.mark_used(used, user_id=300002)

    unused = await repo.get_unused()
    codes = [inv.code for inv in unused]
    assert "UNUSED1" in codes
    assert "UNUSED2" in codes
    assert "USED1" not in codes


async def test_mark_used(session: AsyncSession) -> None:
    """Mark an invite as used by a user."""
    await _create_user(session, 300003)
    repo = InviteRepository(session)
    invite = await repo.create(code="USE_ME")

    marked = await repo.mark_used(invite, user_id=300003)
    assert marked.used_by_id == 300003
    assert marked.used_at is not None
    assert marked.is_active is False


async def test_delete_invite(session: AsyncSession) -> None:
    """Delete an invite."""
    repo = InviteRepository(session)
    invite = await repo.create(code="DEL_ME")
    invite_id = invite.id

    await repo.delete(invite)
    assert await repo.get_by_id(invite_id) is None
