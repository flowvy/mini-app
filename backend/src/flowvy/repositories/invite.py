"""Invite data access."""

from __future__ import annotations

import datetime

from sqlalchemy import select

from flowvy.models.invite import Invite
from flowvy.repositories.base import BaseRepository


class InviteRepository(BaseRepository[Invite]):
    """Repository for Invite CRUD and queries."""

    model = Invite

    async def get_by_code(self, code: str) -> Invite | None:
        """Find an invite by its code string."""
        stmt = select(Invite).where(Invite.code == code)
        result = await self._session.execute(stmt)
        return result.scalars().one_or_none()

    async def get_unused(self) -> list[Invite]:
        """Return all active invites that haven't been used yet."""
        stmt = select(Invite).where(
            Invite.is_active.is_(True),
            Invite.used_by_id.is_(None),
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def mark_used(self, invite: Invite, user_id: int) -> Invite:
        """Mark an invite as used by a specific user."""
        return await self.update(
            invite,
            used_by_id=user_id,
            used_at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None),
            is_active=False,
        )
