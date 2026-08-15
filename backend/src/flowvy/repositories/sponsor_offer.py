"""Sponsor-offer persistence."""

from __future__ import annotations

from sqlalchemy import delete, select

from flowvy.models.sponsor_offer import SponsorOffer
from flowvy.repositories.base import BaseRepository


class SponsorOfferRepository(BaseRepository[SponsorOffer]):
    """Store administrator offers in stable presentation order."""

    model = SponsorOffer

    async def list_all(self) -> list[SponsorOffer]:
        stmt = select(SponsorOffer).order_by(
            SponsorOffer.sort_order.asc(),
            SponsorOffer.created_at.asc(),
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_by_rule_id(self, rule_id: object) -> SponsorOffer | None:
        stmt = (
            select(SponsorOffer)
            .where(SponsorOffer.commerce_rule_id == rule_id)
            .order_by(
                SponsorOffer.is_published.desc(),
                SponsorOffer.sort_order.asc(),
                SponsorOffer.created_at.asc(),
            )
            .limit(1)
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def delete_by_rule_id(self, rule_id: object) -> int:
        """Delete every presentation offer owned by one commerce rule."""
        stmt = (
            delete(SponsorOffer)
            .where(SponsorOffer.commerce_rule_id == rule_id)
            .returning(SponsorOffer.id)
        )
        result = await self._session.execute(stmt)
        return len(result.scalars().all())


__all__ = ["SponsorOfferRepository"]
