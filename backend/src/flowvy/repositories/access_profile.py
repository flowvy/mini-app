"""Access-profile persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from flowvy.models.access_profile import AccessProfile
from flowvy.repositories.base import BaseRepository


class AccessProfileRepository(BaseRepository[AccessProfile]):
    """CRUD and active-profile queries."""

    model = AccessProfile

    async def list_all(self) -> list[AccessProfile]:
        """Return profiles newest first."""
        result = await self._session.execute(
            select(AccessProfile).order_by(AccessProfile.created_at.desc()),
        )
        return list(result.scalars().all())

    async def get_active(self, profile_id: uuid.UUID) -> AccessProfile | None:
        """Return one active profile."""
        result = await self._session.execute(
            select(AccessProfile).where(
                AccessProfile.id == profile_id,
                AccessProfile.is_active.is_(True),
            ),
        )
        return result.scalar_one_or_none()

    async def name_exists(
        self,
        name: str,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> bool:
        """Check case-insensitive name uniqueness before hitting the constraint."""
        stmt = select(AccessProfile.id).where(func.lower(AccessProfile.name) == name.casefold())
        if exclude_id is not None:
            stmt = stmt.where(AccessProfile.id != exclude_id)
        return (await self._session.execute(stmt)).scalar_one_or_none() is not None
