"""Commerce-rule persistence."""

from __future__ import annotations

from sqlalchemy import select

from flowvy.models.commerce_rule import CommerceRule
from flowvy.repositories.base import BaseRepository


class CommerceRuleRepository(BaseRepository[CommerceRule]):
    """CRUD and deterministic provider ordering."""

    model = CommerceRule

    async def list_for_provider(self, provider: str) -> list[CommerceRule]:
        result = await self._session.execute(
            select(CommerceRule)
            .where(CommerceRule.provider == provider)
            .order_by(CommerceRule.priority.asc(), CommerceRule.created_at.asc()),
        )
        return list(result.scalars().all())


__all__ = ["CommerceRuleRepository"]
