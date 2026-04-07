"""Repository for webhook event persistence."""

from __future__ import annotations

import datetime
from typing import Any

from flowvy.models.webhook_event import WebhookEvent
from flowvy.repositories.base import BaseRepository


class WebhookEventRepository(BaseRepository[WebhookEvent]):
    """Stores incoming Remnawave webhook events."""

    model = WebhookEvent

    async def save_event(
        self,
        *,
        scope: str,
        event: str,
        timestamp: datetime.datetime,
        data: dict[str, Any],
    ) -> WebhookEvent:
        """Persist a single webhook event row."""
        return await self.create(
            scope=scope,
            event=event,
            timestamp=timestamp,
            data=data,
        )
