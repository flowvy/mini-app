"""Tests for health endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.api.routes.health import readiness, router
from flowvy.config import Settings


@pytest.mark.asyncio
async def test_health_returns_ok() -> None:
    """GET /api/health returns status ok and version."""
    app = FastAPI()
    app.state.settings = Settings(_env_file=None, version="test-version")
    app.include_router(router)
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "test-version"


@pytest.mark.asyncio
async def test_readiness_reports_both_dependencies() -> None:
    session = AsyncMock()
    session.execute = AsyncMock(return_value=object())
    redis = AsyncMock()
    redis.ping = AsyncMock(return_value=True)

    response = await readiness(session, redis)

    assert response.status_code == 200
    assert response.body == (b'{"status":"ready","checks":{"postgres":"ok","redis":"ok"}}')


@pytest.mark.asyncio
async def test_readiness_is_generic_when_postgres_fails() -> None:
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=RuntimeError("private database detail"))
    redis = AsyncMock()
    redis.ping = AsyncMock(return_value=True)

    response = await readiness(session, redis)

    assert response.status_code == 503
    assert b"private database detail" not in response.body
    assert response.body == (b'{"status":"not_ready","checks":{"postgres":"error","redis":"ok"}}')


@pytest.mark.asyncio
async def test_readiness_is_generic_when_redis_fails() -> None:
    session = AsyncMock()
    session.execute = AsyncMock(return_value=object())
    redis = AsyncMock()
    redis.ping = AsyncMock(side_effect=RuntimeError("private redis detail"))

    response = await readiness(session, redis)

    assert response.status_code == 503
    assert b"private redis detail" not in response.body
    assert response.body == (b'{"status":"not_ready","checks":{"postgres":"ok","redis":"error"}}')


@pytest.mark.asyncio
async def test_readiness_against_dev_services(session: AsyncSession) -> None:
    redis = Redis.from_url("redis://localhost:6379/0", protocol=2)
    try:
        response = await readiness(session, redis)
    finally:
        await redis.aclose()

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_readiness_route_wiring_with_lifespan(
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from flowvy.api.factory import create_app

    monkeypatch.setenv("BOT_TOKEN", "")
    app = create_app()
    transport = ASGITransport(app=app)  # type: ignore[arg-type]

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_openapi_schema_includes_registration_routes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Technical Response return types must not break the generated API contract."""
    from flowvy.api.factory import create_app

    monkeypatch.setenv("BOT_TOKEN", "")
    monkeypatch.setenv("WEBHOOK_URL", "")
    schema = create_app().openapi()

    assert "/api/onboarding" in schema["paths"]
    assert "/api/onboarding/redeem-launch" in schema["paths"]
    assert "/api/me/invite" in schema["paths"]
    assert "/api/me/invite/prepared-share" in schema["paths"]
    assert "/api/admin/registration" in schema["paths"]
    assert "/api/admin/commerce/rules" in schema["paths"]
    assert "/api/admin/commerce/preview" in schema["paths"]
    assert "/api/admin/registration/invites" not in schema["paths"]
