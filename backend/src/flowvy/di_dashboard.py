"""Dishka DI provider for dashboard services."""

from __future__ import annotations

from dishka import Provider, Scope, provide
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.config import Settings
from flowvy.services.bot_stats import BotStatsService
from flowvy.services.dashboard import DashboardService
from flowvy.services.remnawave import RemnawaveClient


class DashboardProvider(Provider):
    """Provides dashboard-related services (REQUEST scope)."""

    @provide(scope=Scope.REQUEST)
    def get_bot_stats_service(
        self,
        session: AsyncSession,
        redis: Redis,
        settings: Settings,
    ) -> BotStatsService:
        """Create bot stats service."""
        return BotStatsService(session, redis, version=settings.version)

    @provide(scope=Scope.REQUEST)
    def get_dashboard_service(
        self,
        remnawave: RemnawaveClient,
        bot_stats: BotStatsService,
        redis: Redis,
    ) -> DashboardService:
        """Create dashboard aggregation service."""
        return DashboardService(remnawave, bot_stats, redis)
