"""Dishka DI provider for webhook services."""

from __future__ import annotations

from dishka import Provider, Scope, provide
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.repositories.webhook_event import WebhookEventRepository
from flowvy.services.tribute_webhook_inbox import TributeWebhookInboxService
from flowvy.services.webhook_handler import WebhookHandlerService


class WebhooksProvider(Provider):
    """Provides webhook-related repository and service (REQUEST scope)."""

    @provide(scope=Scope.REQUEST)
    def get_webhook_event_repo(
        self,
        session: AsyncSession,
    ) -> WebhookEventRepository:
        """Create webhook event repository bound to current session."""
        return WebhookEventRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_webhook_handler(
        self,
        repo: WebhookEventRepository,
        redis: Redis,
    ) -> WebhookHandlerService:
        """Create webhook handler service."""
        return WebhookHandlerService(repo, redis)

    @provide(scope=Scope.REQUEST)
    def get_tribute_webhook_event_repo(
        self,
        session: AsyncSession,
    ) -> TributeWebhookEventRepository:
        """Create the observe-only Tribute inbox repository."""
        return TributeWebhookEventRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_tribute_webhook_inbox(
        self,
        repo: TributeWebhookEventRepository,
    ) -> TributeWebhookInboxService:
        """Create a Tribute inbox service with no commerce/provider dependencies."""
        return TributeWebhookInboxService(repo)
