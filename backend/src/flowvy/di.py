"""Dishka dependency injection providers."""

from __future__ import annotations

from collections.abc import AsyncIterable

from dishka import Provider, Scope, provide
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from flowvy.config import Settings


class ConfigProvider(Provider):
    """Provides application settings."""

    @provide(scope=Scope.APP)
    def get_settings(self) -> Settings:
        """Load settings from environment."""
        return Settings()


class DatabaseProvider(Provider):
    """Provides SQLAlchemy async engine and session."""

    @provide(scope=Scope.APP)
    async def get_engine(self, settings: Settings) -> AsyncIterable[AsyncEngine]:
        """Create async engine, dispose on shutdown."""
        engine = create_async_engine(settings.database_url)
        yield engine
        await engine.dispose()

    @provide(scope=Scope.APP)
    def get_sessionmaker(
        self,
        engine: AsyncEngine,
    ) -> async_sessionmaker[AsyncSession]:
        """Create session factory bound to engine."""
        return async_sessionmaker(engine, expire_on_commit=False)

    @provide(scope=Scope.REQUEST)
    async def get_session(
        self,
        factory: async_sessionmaker[AsyncSession],
    ) -> AsyncIterable[AsyncSession]:
        """Yield a session, auto-close when request scope exits."""
        async with factory() as session:
            yield session


class RedisProvider(Provider):
    """Provides Redis async client."""

    @provide(scope=Scope.APP)
    async def get_redis(self, settings: Settings) -> AsyncIterable[Redis]:
        """Create Redis client, close on shutdown."""
        client: Redis = Redis.from_url(settings.redis_url)
        yield client
        await client.aclose()
