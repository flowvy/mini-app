"""Remnawave webhook event handler with registry-based dispatch."""

from __future__ import annotations

import hashlib
import hmac
import logging
from collections.abc import Awaitable, Callable

from redis.asyncio import Redis

from flowvy.repositories.webhook_event import WebhookEventRepository
from flowvy.schemas.webhooks import WebhookPayload
from flowvy.services.dashboard import CACHE_KEY as DASHBOARD_CACHE_KEY
from flowvy.services.pulse import CACHE_KEY as PULSE_CACHE_KEY

logger = logging.getLogger(__name__)

EventHandler = Callable[[WebhookPayload], Awaitable[None]]

USER_INVALIDATION_EVENTS = frozenset(
    {
        "user.modified",
        "user.deleted",
        "user.traffic_reset",
        "user.revoked",
        "user.enabled",
        "user.disabled",
    }
)


class WebhookHandlerService:
    """Verifies, persists, and dispatches Remnawave webhook events."""

    def __init__(self, repo: WebhookEventRepository, redis: Redis) -> None:
        self._repo = repo
        self._redis = redis
        self._handlers = self._build_registry()

    @staticmethod
    def verify_signature(body: bytes, secret: str, signature: str) -> bool:
        """Verify HMAC-SHA256 signature from Remnawave."""
        expected = hmac.new(
            secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    async def handle_event(self, payload: WebhookPayload) -> None:
        """Persist event and dispatch to registered handlers."""
        await self._repo.save_event(
            scope=payload.scope,
            event=payload.event,
            timestamp=payload.timestamp,
            data=payload.data,
        )
        logger.info("Webhook event saved: %s", payload.event)

        handlers = self._handlers.get(payload.scope, [])
        for handler in handlers:
            await handler(payload)

    def _build_registry(self) -> dict[str, list[EventHandler]]:
        """Build scope → handlers mapping."""
        return {
            "user": [self._on_user_event],
            "node": [self._on_node_event],
            "user_hwid_devices": [self._on_user_event],
        }

    async def _on_user_event(self, payload: WebhookPayload) -> None:
        """Invalidate dashboard cache on user-mutating events."""
        if payload.event in USER_INVALIDATION_EVENTS:
            deleted = await self._redis.delete(DASHBOARD_CACHE_KEY)
            if deleted:
                logger.info(
                    "Cache invalidated: %s (trigger: %s)",
                    DASHBOARD_CACHE_KEY,
                    payload.event,
                )

    async def _on_node_event(self, payload: WebhookPayload) -> None:
        """Invalidate pulse cache on any node event."""
        deleted = await self._redis.delete(PULSE_CACHE_KEY)
        if deleted:
            logger.info(
                "Cache invalidated: %s (trigger: %s)",
                PULSE_CACHE_KEY,
                payload.event,
            )
