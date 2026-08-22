"""Persistence for first-payment referral conversions."""

from __future__ import annotations

from typing import Any

from sqlalchemy.dialects.postgresql import insert

from flowvy.models.referral_conversion import ReferralConversion
from flowvy.repositories.base import BaseRepository


class ReferralConversionRepository(BaseRepository[ReferralConversion]):
    """Record each invitee conversion once across webhook retries and renewals."""

    model = ReferralConversion

    async def create_once(self, **values: Any) -> ReferralConversion | None:
        stmt = (
            insert(ReferralConversion)
            .values(**values)
            .on_conflict_do_nothing()
            .returning(ReferralConversion)
        )
        return (await self._session.execute(stmt)).scalars().one_or_none()


__all__ = ["ReferralConversionRepository"]
