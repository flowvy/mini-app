"""Subscription data access."""

from __future__ import annotations

import datetime
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

    async def get_by_remnawave_user_id(
        self,
        remnawave_user_id: int,
    ) -> Subscription | None:
        """Find subscription by the numeric Remnawave user identity."""
        stmt = select(Subscription).where(
            Subscription.remnawave_user_id == remnawave_user_id,
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

    async def upsert_from_remnawave(
        self,
        user_id: int,
        remnawave_user_id: int,
        remnawave_uuid: str | None,
        status: str,
        device_limit: int | None,
        expires_at: datetime.datetime | None,
    ) -> Subscription:
        """Insert or update subscription from Remnawave data."""
        rn_uuid = uuid.UUID(remnawave_uuid) if remnawave_uuid is not None else None
        naive_expires = _strip_tz(expires_at)
        by_id = await self.get_by_remnawave_user_id(remnawave_user_id)
        by_uuid = await self.get_by_remnawave_uuid(rn_uuid) if rn_uuid is not None else None
        if by_id is not None and by_uuid is not None and by_id.id != by_uuid.id:
            raise ValueError("Conflicting Remnawave subscription identities")
        sub = by_id or by_uuid
        if sub is None:
            local = await self.get_by_user_id(user_id)
            unclaimed = [item for item in local if item.remnawave_user_id is None]
            if len(local) == 1 and len(unclaimed) == 1:
                sub = unclaimed[0]
        mapped_status = _map_remnawave_status(status)
        if sub is not None:
            return await self.update(
                sub,
                user_id=user_id,
                remnawave_user_id=remnawave_user_id,
                remnawave_uuid=rn_uuid if rn_uuid is not None else sub.remnawave_uuid,
                status=mapped_status,
                device_limit=device_limit,
                expires_at=naive_expires,
            )
        return await self.create(
            user_id=user_id,
            remnawave_user_id=remnawave_user_id,
            remnawave_uuid=rn_uuid,
            status=mapped_status,
            device_limit=device_limit,
            expires_at=naive_expires,
        )


def _strip_tz(dt: datetime.datetime | None) -> datetime.datetime | None:
    """Remove timezone info to match naive DB columns."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None)


def _map_remnawave_status(status: str) -> SubscriptionStatus:
    """Map Remnawave status string to our SubscriptionStatus enum."""
    mapping = {
        "ACTIVE": SubscriptionStatus.ACTIVE,
        "EXPIRED": SubscriptionStatus.EXPIRED,
        "DISABLED": SubscriptionStatus.SUSPENDED,
        "LIMITED": SubscriptionStatus.ACTIVE,
    }
    return mapping.get(status, SubscriptionStatus.SUSPENDED)
