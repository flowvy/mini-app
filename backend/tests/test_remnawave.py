"""Tests for RemnawaveClient."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from flowvy.services.remnawave import RemnawaveClient, RemnawaveError

FAKE_USER = {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "shortUuid": "abc123",
    "username": "testuser",
    "status": "ACTIVE",
    "trafficLimitBytes": 50_000_000_000,
    "trafficLimitStrategy": "MONTH",
    "expireAt": "2026-05-01T00:00:00Z",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-04-01T12:00:00Z",
    "telegramId": 123456789,
    "email": "test@example.com",
    "hwidDeviceLimit": 3,
    "lastTrafficResetAt": "2026-04-01T00:00:00Z",
    "subscriptionUrl": "https://panel.example.com/sub/abc123",
    "userTraffic": {
        "usedTrafficBytes": 4_200_000_000,
        "lifetimeUsedTrafficBytes": 128_000_000_000,
        "onlineAt": None,
        "firstConnectedAt": None,
        "lastConnectedNodeUuid": None,
    },
}

FAKE_SUB_INFO = {
    "isFound": True,
    "user": {
        "shortUuid": "abc123",
        "daysLeft": 25,
        "username": "testuser",
        "trafficUsedBytes": "4200000000",
        "trafficLimitBytes": "50000000000",
        "lifetimeTrafficUsedBytes": "128000000000",
        "expiresAt": "2026-05-01T00:00:00Z",
        "isActive": True,
        "userStatus": "ACTIVE",
        "trafficLimitStrategy": "MONTH",
        "hwidDeviceLimit": 3,
        "hwidDeviceCount": 1,
    },
    "links": [],
    "ssConfLinks": {},
    "subscriptionUrl": "https://panel.example.com/sub/abc123",
}


def _make_response(json_data: dict, status_code: int = 200) -> MagicMock:
    """Build a fake httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.text = str(json_data)
    return resp


def _make_client(responses: list[MagicMock]) -> RemnawaveClient:
    """Create RemnawaveClient with a mocked httpx.AsyncClient."""
    http = AsyncMock()
    http.get = AsyncMock(side_effect=responses)
    return RemnawaveClient(
        base_url="https://panel.example.com",
        token="test-token",
        http=http,
    )


@pytest.mark.asyncio
async def test_get_user_by_telegram_id_found() -> None:
    """Should parse user data from Remnawave response."""
    client = _make_client([
        _make_response({"response": [FAKE_USER]}),
    ])
    user = await client.get_user_by_telegram_id(123456789)
    assert user is not None
    assert user.short_uuid == "abc123"
    assert user.username == "testuser"
    assert user.traffic_limit_bytes == 50_000_000_000
    assert user.user_traffic.used_traffic_bytes == 4_200_000_000


@pytest.mark.asyncio
async def test_get_user_by_telegram_id_not_found() -> None:
    """Should return None when user array is empty."""
    client = _make_client([
        _make_response({"response": []}),
    ])
    user = await client.get_user_by_telegram_id(999999)
    assert user is None


@pytest.mark.asyncio
async def test_get_subscription_info() -> None:
    """Should parse subscription info response."""
    client = _make_client([
        _make_response({"response": FAKE_SUB_INFO}),
    ])
    info = await client.get_subscription_info("abc123")
    assert info.is_found is True
    assert info.user.days_left == 25
    assert info.user.hwid_device_count == 1


@pytest.mark.asyncio
async def test_remnawave_error_on_4xx() -> None:
    """Should raise RemnawaveError on non-2xx response."""
    client = _make_client([
        _make_response({"message": "Unauthorized"}, status_code=401),
    ])
    with pytest.raises(RemnawaveError) as exc_info:
        await client.get_user_by_telegram_id(123)
    assert exc_info.value.status == 401


@pytest.mark.asyncio
async def test_ping_success() -> None:
    """Should return True when Remnawave responds 200."""
    http = AsyncMock()
    http.get = AsyncMock(return_value=_make_response({}, 200))
    client = RemnawaveClient("https://panel.example.com", "tok", http)
    assert await client.ping() is True


@pytest.mark.asyncio
async def test_ping_failure() -> None:
    """Should return False when Remnawave responds non-200."""
    http = AsyncMock()
    http.get = AsyncMock(return_value=_make_response({}, 500))
    client = RemnawaveClient("https://panel.example.com", "tok", http)
    assert await client.ping() is False
