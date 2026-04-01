"""Shared test fixtures."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from flowvy.models import Base

TEST_DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test"


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set minimal env vars so Settings() can be constructed."""
    monkeypatch.setenv("BOT_TOKEN", "000000:TEST")
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    """Create engine, set up tables, tear down after each test."""
    eng = create_async_engine(TEST_DATABASE_URL)
    async with eng.begin() as conn:
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
