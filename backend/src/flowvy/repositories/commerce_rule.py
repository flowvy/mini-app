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

    async def list_matching_event(
        self,
        *,
        provider: str,
        commerce_type: str,
        payment_mode: str,
        external_item_id: str | None,
        currency: str,
    ) -> list[CommerceRule]:
        """Return enabled event candidates in deterministic priority order."""
        result = await self._session.execute(
            select(CommerceRule)
            .where(
                CommerceRule.provider == provider,
                CommerceRule.commerce_type == commerce_type,
                CommerceRule.payment_mode.in_(("any", payment_mode)),
                CommerceRule.external_item_id == external_item_id,
                CommerceRule.currency == currency,
                CommerceRule.is_enabled.is_(True),
            )
            .order_by(CommerceRule.priority.asc(), CommerceRule.created_at.asc()),
        )
        return list(result.scalars().all())


__all__ = ["CommerceRuleRepository"]
