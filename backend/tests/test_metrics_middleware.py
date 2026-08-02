"""Request-counter middleware behavior tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.exceptions import RedisError

from flowvy.api.middleware import DAILY_COUNTER_RETENTION_SECONDS, MetricsMiddleware


def _app(redis: AsyncMock | None) -> FastAPI:
    app = FastAPI()
    if redis is not None:
        app.state.metrics_redis = redis

    @app.get("/test")
    async def test_route() -> dict[str, bool]:
        return {"ok": True}

    app.add_middleware(MetricsMiddleware)
    return app


@pytest.mark.asyncio
async def test_request_counter_uses_lifespan_redis_and_retains_daily_key() -> None:
    redis = AsyncMock()
    pipe = MagicMock()
    pipe.execute = AsyncMock(return_value=[1, 1, True])
    redis.pipeline = MagicMock(return_value=pipe)

    transport = ASGITransport(app=_app(redis))  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/test")

    assert response.status_code == 200
    pipe.incr.assert_any_call("bot:requests:total")
    daily_key = pipe.incr.call_args_list[1].args[0]
    assert daily_key.startswith("bot:requests:")
    pipe.expire.assert_called_once_with(daily_key, DAILY_COUNTER_RETENTION_SECONDS)
    pipe.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_metrics_failure_never_fails_request() -> None:
    redis = AsyncMock()
    pipe = MagicMock()
    pipe.execute = AsyncMock(side_effect=RedisError("unavailable"))
    redis.pipeline = MagicMock(return_value=pipe)

    transport = ASGITransport(app=_app(redis))  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/test")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


@pytest.mark.asyncio
async def test_metrics_skip_before_lifespan_initializes_redis() -> None:
    transport = ASGITransport(app=_app(None))  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/test")

    assert response.status_code == 200
