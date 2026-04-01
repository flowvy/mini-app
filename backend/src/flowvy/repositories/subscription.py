"""Subscription data access."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from flowvy.models.subscription import Subscription, SubscriptionStatus
from flowvy.repositories.base import BaseRepository


class SubscriptionRepository(BaseRepository[Subscription]):
    """Repository for Subscription CRUD and queries."""

    model = Subscription

    async def get_by_user_id(self, user_id: int) -> list[Subscription]:
        """Return all subscriptions for a given user."""
        stmt = select(Subscription).where(Subscription.user_id == user_id)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_remnawave_uuid(
        self,
        remnawave_uuid: uuid.UUID,
    ) -> Subscription | None:
        """Find subscription by its Remnawave reference."""
        stmt = select(Subscription).where(
            Subscription.remnawave_uuid == remnawave_uuid,
        )
        result = await self._session.execute(stmt)
        return result.scalars().one_or_none()

    async def get_active_by_user_id(self, user_id: int) -> list[Subscription]:
        """Return only active subscriptions for a user."""
        stmt = select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
