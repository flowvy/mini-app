"""Tests for GET /api/me/subscription route."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from dishka import Provider, Scope, make_async_container, provide
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from flowvy.api.routes.subscription import router
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.subscription import SubscriptionResponse
from flowvy.services.remnawave import RemnawaveError
from flowvy.services.subscription import SubscriptionService

FAKE_RESPONSE = SubscriptionResponse(
    id="abc123",
    name="testuser",
    status="ACTIVE",
    used_bytes=4_200_000_000,
    total_bytes=50_000_000_000,
    expires_at=1777766400,
    created_at=1735689600,
    device_limit=3,
    reset_strategy="MONTH",
    refill_date=1777766400,
    lifetime_used_bytes=128_000_000_000,
    updated_at=1775044800,
    connection_link="https://panel.example.com/sub/abc123",
    email="test@example.com",
    telegram_id="123456789",
    auto_update=True,
    update_interval=24,
    support_url=None,
    renew_url=None,
)


def _mock_init_data() -> MagicMock:
    """Build a mock WebAppInitData with user.id."""
    init_data = MagicMock()
    init_data.user = MagicMock()
    init_data.user.id = 123456789
    return init_data


def _mock_ps_repo() -> AsyncMock:
    """Build a mock ProviderSettingsRepository."""
    repo = AsyncMock(spec=ProviderSettingsRepository)
    ps = MagicMock()
    ps.support_url = None
    ps.renew_url = None
    repo.get = AsyncMock(return_value=ps)
    return repo


def _create_test_app(service_mock: AsyncMock) -> FastAPI:
    """Build a minimal FastAPI app with Dishka and mocked service."""
    app = FastAPI()
    ps_repo_mock = _mock_ps_repo()

    class TestProvider(Provider):
        scope = Scope.REQUEST

        @provide
        def subscription_service(self) -> SubscriptionService:
            return service_mock  # type: ignore[return-value]

        @provide
        def provider_settings_repo(self) -> ProviderSettingsRepository:
            return ps_repo_mock  # type: ignore[return-value]

    container = make_async_container(TestProvider())
    app.include_router(router)
    setup_dishka(container=container, app=app)

    # Override auth dependency
    from flowvy.api.deps import get_current_init_data

    app.dependency_overrides[get_current_init_data] = _mock_init_data
    return app


@pytest.mark.asyncio
async def test_subscription_success() -> None:
    """Should return 200 with subscription data."""
    service_mock = AsyncMock(spec=SubscriptionService)
    service_mock.get_for_user = AsyncMock(return_value=FAKE_RESPONSE)
    app = _create_test_app(service_mock)

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/me/subscription")

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "testuser"
    assert body["usedBytes"] == 4_200_000_000


@pytest.mark.asyncio
async def test_subscription_not_found() -> None:
    """Should return 404 when user has no Remnawave account."""
    service_mock = AsyncMock(spec=SubscriptionService)
    service_mock.get_for_user = AsyncMock(return_value=None)
    app = _create_test_app(service_mock)

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/me/subscription")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_subscription_remnawave_error() -> None:
    """Should return 502 when Remnawave is unavailable."""
    service_mock = AsyncMock(spec=SubscriptionService)
    service_mock.get_for_user = AsyncMock(
        side_effect=RemnawaveError(503, "Service Unavailable"),
    )
    app = _create_test_app(service_mock)

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/me/subscription")

    assert resp.status_code == 502
