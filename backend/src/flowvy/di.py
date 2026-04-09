"""Dishka dependency injection providers."""

from __future__ import annotations

from collections.abc import AsyncIterable

import httpx
from dishka import Provider, Scope, provide
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from flowvy.config import Settings
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.services.remnawave import RemnawaveClient
from flowvy.services.user import UserService


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
        """Yield a session, commit on success, rollback on error."""
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise


class RepositoryProvider(Provider):
    """Provides data-access repositories."""

    @provide(scope=Scope.REQUEST)
    def get_user_repo(self, session: AsyncSession) -> UserRepository:
        """Create user repository bound to current session."""
        return UserRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_subscription_repo(
        self,
        session: AsyncSession,
    ) -> SubscriptionRepository:
        """Create subscription repository bound to current session."""
        return SubscriptionRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_provider_settings_repo(
        self,
        session: AsyncSession,
    ) -> ProviderSettingsRepository:
        """Create provider settings repository bound to current session."""
        return ProviderSettingsRepository(session)


class ServiceProvider(Provider):
    """Provides business-logic services."""

    @provide(scope=Scope.REQUEST)
    def get_user_service(
        self,
        repo: UserRepository,
        settings: Settings,
    ) -> UserService:
        """Create user service with injected repository and settings."""
        return UserService(repo, settings)


class RedisProvider(Provider):
    """Provides Redis async client."""

    @provide(scope=Scope.APP)
    async def get_redis(self, settings: Settings) -> AsyncIterable[Redis]:
        """Create Redis client, close on shutdown."""
        client: Redis = Redis.from_url(settings.redis_url)
        yield client
        await client.aclose()


class HttpClientProvider(Provider):
    """Provides a shared httpx.AsyncClient."""

    @provide(scope=Scope.APP)
    async def get_http(self) -> AsyncIterable[httpx.AsyncClient]:
        """Create httpx client with 10s timeout, close on shutdown."""
        client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))
        yield client
        await client.aclose()


class RemnawaveProvider(Provider):
    """Provides RemnawaveClient (APP scope)."""

    @provide(scope=Scope.APP)
    def get_remnawave(
        self,
        settings: Settings,
        http: httpx.AsyncClient,
    ) -> RemnawaveClient:
        """Create Remnawave API client."""
        return RemnawaveClient(
            base_url=settings.remnawave_url,
            token=settings.remnawave_api_token,
            http=http,
        )
