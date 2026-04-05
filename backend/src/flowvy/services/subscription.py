"""Subscription aggregation service (BFF layer)."""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta

from flowvy.config import Settings
from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.schemas.subscription import SubscriptionResponse
from flowvy.services.remnawave import RemnawaveClient


class SubscriptionService:
    """Aggregates Remnawave data into a single frontend-ready response."""

    def __init__(self, remnawave: RemnawaveClient, settings: Settings) -> None:
        self._remnawave = remnawave
        self._settings = settings

    async def get_for_user(
        self,
        telegram_id: int,
    ) -> SubscriptionResponse | None:
        """Fetch subscription data for a Telegram user.

        Returns None if the user has no Remnawave account.
        """
        user = await self._remnawave.get_user_by_telegram_id(telegram_id)
        if user is None:
            return None
        return self._to_response(user)

    def _to_response(self, user: RemnawaveUserData) -> SubscriptionResponse:
        """Map RemnawaveUserData to the BFF response model."""
        expire_ts = int(user.expire_at.timestamp())
        created_ts = int(user.created_at.timestamp())
        refill_ts = _compute_refill_date(
            user.last_traffic_reset_at,
            user.traffic_limit_strategy,
        )

        return SubscriptionResponse(
            id=user.short_uuid,
            name=user.username,
            status=user.status,
            used_bytes=user.user_traffic.used_traffic_bytes,
            total_bytes=user.traffic_limit_bytes,
            expires_at=expire_ts,
            created_at=created_ts,
            device_limit=user.hwid_device_limit,
            reset_strategy=_map_strategy(user.traffic_limit_strategy),
            refill_date=refill_ts,
            lifetime_used_bytes=user.user_traffic.lifetime_used_traffic_bytes,
            updated_at=user.updated_at.isoformat(),
            connection_link=user.subscription_url,
            email=user.email,
            telegram_id=str(user.telegram_id) if user.telegram_id else None,
            auto_update=True,
            update_interval=24,
            support_url=self._settings.support_url,
            renew_url=self._settings.renew_url,
        )


def _map_strategy(strategy: str) -> str | None:
    """Map Remnawave strategy to frontend-friendly value."""
    mapping = {
        "NO_RESET": None,
        "DAY": "DAY",
        "WEEK": "WEEK",
        "MONTH": "MONTH",
        "MONTH_ROLLING": "MONTH_ROLLING",
    }
    return mapping.get(strategy)


def _compute_refill_date(
    last_reset: datetime | None,
    strategy: str,
) -> int | None:
    """Estimate next traffic reset as a Unix timestamp."""
    if strategy == "NO_RESET" or last_reset is None:
        return None

    deltas = {
        "DAY": timedelta(days=1),
        "WEEK": timedelta(weeks=1),
    }
    if strategy in deltas:
        nxt = last_reset + deltas[strategy]
        return int(nxt.timestamp())

    if strategy in ("MONTH", "MONTH_ROLLING"):
        year = last_reset.year
        month = last_reset.month + 1
        if month > 12:
            month = 1
            year += 1
        day = min(last_reset.day, calendar.monthrange(year, month)[1])
        nxt = last_reset.replace(year=year, month=month, day=day)
        return int(nxt.timestamp())

    return None
