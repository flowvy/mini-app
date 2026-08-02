"""Crash-safe last-seen staging tests."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from flowvy.services.metrics_collector import (
    LAST_SEEN_KEY,
    LAST_SEEN_PROCESSING_KEY,
    _flush_last_seen,
)


@pytest.mark.asyncio
async def test_last_seen_is_renamed_before_database_updates() -> None:
    redis = AsyncMock()
    redis.exists = AsyncMock(side_effect=[False, True])
    redis.rename = AsyncMock()
    redis.hgetall = AsyncMock(return_value={b"123": b"1754131200"})
    session = AsyncMock()
    session.execute = AsyncMock()

    staged = await _flush_last_seen(session, redis)

    assert staged is True
    redis.rename.assert_awaited_once_with(LAST_SEEN_KEY, LAST_SEEN_PROCESSING_KEY)
    redis.delete.assert_not_awaited()
    session.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_existing_processing_batch_is_retried_without_overwriting_new_writes() -> None:
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=True)
    redis.hgetall = AsyncMock(return_value={b"123": b"1754131200"})
    session = AsyncMock()
    session.execute = AsyncMock()

    staged = await _flush_last_seen(session, redis)

    assert staged is True
    redis.rename.assert_not_awaited()
    redis.hgetall.assert_awaited_once_with(LAST_SEEN_PROCESSING_KEY)


@pytest.mark.asyncio
async def test_missing_last_seen_batch_does_nothing() -> None:
    redis = AsyncMock()
    redis.exists = AsyncMock(side_effect=[False, False])
    session = AsyncMock()

    assert await _flush_last_seen(session, redis) is False
    redis.rename.assert_not_awaited()
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_malformed_metric_does_not_poison_whole_batch() -> None:
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=True)
    redis.hgetall = AsyncMock(return_value={b"bad-id": b"bad-time", b"123": b"1754131200"})
    session = AsyncMock()
    session.execute = AsyncMock()

    assert await _flush_last_seen(session, redis) is True
    session.execute.assert_awaited_once()
