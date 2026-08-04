"""Invite data access."""

from __future__ import annotations

from sqlalchemy import select

from flowvy.models.invite import Invite
from flowvy.repositories.base import BaseRepository


class InviteRepository(BaseRepository[Invite]):
    """Repository for Invite CRUD and queries."""

    model = Invite

    async def get_by_code(
        self,
        code: str,
    ) -> Invite | None:
        """Find a reusable personal code."""
        stmt = select(Invite).where(Invite.code == code)
        result = await self._session.execute(stmt)
        return result.scalars().one_or_none()

    async def get_by_owner(self, user_id: int) -> Invite | None:
        """Return the one code belonging to a user."""
        stmt = select(Invite).where(Invite.created_by_id == user_id)
        result = await self._session.execute(stmt)
        return result.scalars().one_or_none()
