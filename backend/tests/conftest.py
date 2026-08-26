"""Shared test fixtures."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from flowvy.models import Base

TEST_DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"
TEST_REDIS_URL = "redis://localhost:6379/15"


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Mark tests using database fixtures so the fast gate stays service-free."""
    for item in items:
        if {"engine", "session"}.intersection(item.fixturenames):
            item.add_marker(pytest.mark.integration)


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set minimal env vars so Settings() can be constructed."""
    monkeypatch.setenv("BOT_TOKEN", "000000:TEST")
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setenv("REDIS_URL", TEST_REDIS_URL)
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("WEBHOOK_URL", "")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "")
    monkeypatch.setenv("WEBAPP_URL", "http://localhost:5173")
    monkeypatch.setenv("ADMIN_TELEGRAM_IDS", "")
    monkeypatch.setenv("REMNAWAVE_URL", "")
    monkeypatch.setenv("REMNAWAVE_API_TOKEN", "")
    monkeypatch.setenv("REMNAWAVE_WEBHOOK_SECRET", "")
    monkeypatch.setenv("R2_ACCOUNT_ID", "")
    monkeypatch.setenv("R2_BUCKET_NAME", "")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "")


@pytest.fixture(autouse=True)
async def _integration_redis_isolation(request: pytest.FixtureRequest) -> AsyncIterator[None]:
    """Keep integration-test rate limits and caches out of local development Redis."""
    if request.node.get_closest_marker("integration") is None:
        yield
        return

    redis = Redis.from_url(TEST_REDIS_URL, protocol=2)
    await redis.flushdb()
    try:
        yield
    finally:
        await redis.flushdb()
        await redis.aclose()


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    """Create engine, set up tables, tear down after each test."""
    eng = create_async_engine(TEST_DATABASE_URL)
    async with eng.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Yield a session. Tables are dropped after each test for isolation."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        yield sess
