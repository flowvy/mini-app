"""Tests for SubscriptionService mapping logic."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from flowvy.config import Settings
from flowvy.schemas.remnawave import RemnawaveUserData, RemnawaveUserTraffic
from flowvy.services.subscription import SubscriptionService

FAKE_USER = RemnawaveUserData(
    uuid="550e8400-e29b-41d4-a716-446655440000",
    short_uuid="abc123",
    username="testuser",
    status="ACTIVE",
    traffic_limit_bytes=50_000_000_000,
    traffic_limit_strategy="MONTH",
    expire_at="2026-05-01T00:00:00Z",
    created_at="2026-01-01T00:00:00Z",
    updated_at="2026-04-01T12:00:00Z",
    telegram_id=123456789,
    email="test@example.com",
    hwid_device_limit=3,
    last_traffic_reset_at="2026-04-01T00:00:00Z",
    subscription_url="https://panel.example.com/sub/abc123",
    user_traffic=RemnawaveUserTraffic(
        used_traffic_bytes=4_200_000_000,
        lifetime_used_traffic_bytes=128_000_000_000,
        online_at=None,
        first_connected_at=None,
    ),
)


def _make_service(
    remnawave_return: RemnawaveUserData | None = FAKE_USER,
) -> SubscriptionService:
    """Create SubscriptionService with mocked RemnawaveClient and repo."""
    client = AsyncMock()
    client.get_user_by_telegram_id = AsyncMock(return_value=remnawave_return)
    settings = Settings(
        support_url="https://support.example.com",
        renew_url="https://renew.example.com",
    )
    sub_repo = AsyncMock()
    sub_repo.upsert_from_remnawave = AsyncMock()
    user_repo = AsyncMock()
    user_repo.get_by_telegram_id = AsyncMock(return_value=None)
    user_repo.create = AsyncMock()
    return SubscriptionService(client, settings, sub_repo, user_repo)


@pytest.mark.asyncio
async def test_get_for_user_maps_fields() -> None:
    """Should correctly map Remnawave data to SubscriptionResponse."""
    service = _make_service()
    result = await service.get_for_user(123456789)

    assert result is not None
    assert result.id == "abc123"
    assert result.name == "testuser"
    assert result.status == "ACTIVE"
    assert result.used_bytes == 4_200_000_000
    assert result.total_bytes == 50_000_000_000
    assert result.device_limit == 3
    assert result.reset_strategy == "MONTH"
    assert result.lifetime_used_bytes == 128_000_000_000
    assert result.connection_link == "https://panel.example.com/sub/abc123"
    assert result.email == "test@example.com"
    assert result.telegram_id == "123456789"
    assert result.support_url == "https://support.example.com"
    assert result.renew_url == "https://renew.example.com"


@pytest.mark.asyncio
async def test_get_for_user_returns_none() -> None:
    """Should return None when user not found in Remnawave."""
    service = _make_service(remnawave_return=None)
    result = await service.get_for_user(999999)
    assert result is None


@pytest.mark.asyncio
async def test_refill_date_computed_for_month() -> None:
    """Should compute next refill date for MONTH strategy."""
    service = _make_service()
    result = await service.get_for_user(123456789)
    assert result is not None
    assert result.refill_date is not None
    assert result.refill_date > result.created_at


@pytest.mark.asyncio
async def test_refill_date_none_for_no_reset() -> None:
    """Should return None refill_date when strategy is NO_RESET."""
    user = RemnawaveUserData(
        uuid="550e8400-e29b-41d4-a716-446655440000",
        short_uuid="abc123",
        username="testuser",
        status="ACTIVE",
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        expire_at="2026-05-01T00:00:00Z",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-04-01T12:00:00Z",
        subscription_url="https://panel.example.com/sub/abc123",
        user_traffic=RemnawaveUserTraffic(
            used_traffic_bytes=0,
            lifetime_used_traffic_bytes=0,
        ),
    )
    service = _make_service(remnawave_return=user)
    result = await service.get_for_user(123)
    assert result is not None
    assert result.refill_date is None
    assert result.reset_strategy is None


@pytest.mark.asyncio
async def test_camel_case_serialization() -> None:
    """Should serialize to camelCase for frontend consumption."""
    service = _make_service()
    result = await service.get_for_user(123456789)
    assert result is not None
    data = result.model_dump(by_alias=True)
    assert "usedBytes" in data
    assert "totalBytes" in data
    assert "expiresAt" in data
    assert "connectionLink" in data
    assert "deviceLimit" in data
    assert "resetStrategy" in data
    assert "lifetimeUsedBytes" in data
    assert "updatedAt" in data
    assert "autoUpdate" in data
    assert "updateInterval" in data
    assert "supportUrl" in data
    assert "renewUrl" in data
    assert "telegramId" in data
