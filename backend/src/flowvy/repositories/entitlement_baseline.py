"""Persistence for base access captured before paid overlays."""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert

from flowvy.models.entitlement_baseline import EntitlementBaseline
from flowvy.repositories.base import BaseRepository


class EntitlementBaselineRepository(BaseRepository[EntitlementBaseline]):
    """Create one stable baseline per user without overwriting history."""

    model = EntitlementBaseline

    async def create_once(self, **values: object) -> EntitlementBaseline | None:
        statement = (
            insert(EntitlementBaseline)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[EntitlementBaseline.user_id])
            .returning(EntitlementBaseline)
        )
        return (await self._session.execute(statement)).scalars().one_or_none()


__all__ = ["EntitlementBaselineRepository"]
