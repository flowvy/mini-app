"""Admin user-search routing tests."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.services.admin_users import AdminUsersService

USER = RemnawaveUserData.from_raw(
    {
        "id": 42,
        "uuid": "550e8400-e29b-41d4-a716-446655440000",
        "shortUuid": "abc123",
        "username": "john.doe",
        "status": "ACTIVE",
        "expireAt": "2026-09-01T00:00:00Z",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-08-01T00:00:00Z",
        "telegramId": 123,
        "email": "john@example.com",
        "subscriptionUrl": "https://panel.example/sub/abc123",
        "activeInternalSquads": [],
        "userTraffic": {"usedTrafficBytes": 0, "lifetimeUsedTrafficBytes": 0},
    }
)


@pytest.mark.asyncio
async def test_dotted_username_is_not_misclassified_as_email() -> None:
    remnawave = AsyncMock()
    remnawave.search_user_by_username = AsyncMock(return_value=USER)
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=b"{}")
    service = AdminUsersService(remnawave, redis, AsyncMock())

    result = await service.search_user("john.doe")

    assert result.total == 1
    remnawave.search_user_by_username.assert_awaited_once_with("john.doe")
    remnawave.search_user_by_email.assert_not_awaited()


@pytest.mark.asyncio
async def test_user_detail_includes_direct_invitation_count() -> None:
    remnawave = AsyncMock()
    remnawave.get_user_by_id = AsyncMock(return_value=USER)
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=b"{}")
    users = AsyncMock()
    users.count_invited_by = AsyncMock(return_value=4)

    result = await AdminUsersService(remnawave, redis, users).get_user(USER.provider_id)

    assert result.invited_count == 4
    users.count_invited_by.assert_awaited_once_with(123)
