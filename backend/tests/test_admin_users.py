"""Admin user-search routing tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from flowvy.schemas.remnawave import RemnawaveUserData, RemnawaveUsersPage
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
    users = AsyncMock()
    users.get_by_telegram_ids = AsyncMock(return_value=[])
    service = AdminUsersService(remnawave, redis, users)

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
    users.get_by_telegram_id = AsyncMock(
        return_value=SimpleNamespace(id=123, username="john_telegram"),
    )
    users.count_invited_by = AsyncMock(return_value=4)

    result = await AdminUsersService(remnawave, redis, users).get_user(USER.provider_id)

    assert result.invited_count == 4
    assert result.username == "john.doe"
    assert result.telegram_username == "john_telegram"
    users.get_by_telegram_id.assert_awaited_once_with(123)
    users.count_invited_by.assert_awaited_once_with(123)


@pytest.mark.asyncio
async def test_user_list_preserves_normalized_unknown_status() -> None:
    """Admin list consumes typed provider users instead of raw status dictionaries."""
    unknown = USER.model_copy(update={"status": "UNKNOWN"})
    remnawave = AsyncMock()
    remnawave.get_users = AsyncMock(
        return_value=RemnawaveUsersPage(users=[unknown], total=1),
    )
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=b"{}")
    users = AsyncMock()
    users.get_by_telegram_ids = AsyncMock(return_value=[])
    service = AdminUsersService(remnawave, redis, users)

    result = await service.get_users()

    assert result.total == 1
    assert result.users[0].status == "UNKNOWN"
    assert result.users[0].telegram_username is None


@pytest.mark.asyncio
async def test_user_list_adds_local_telegram_username_without_n_plus_one() -> None:
    remnawave = AsyncMock()
    remnawave.get_users = AsyncMock(
        return_value=RemnawaveUsersPage(users=[USER], total=1),
    )
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=b"{}")
    users = AsyncMock()
    users.get_by_telegram_ids = AsyncMock(
        return_value=[SimpleNamespace(id=123, username="john_telegram")],
    )

    result = await AdminUsersService(remnawave, redis, users).get_users()

    assert result.users[0].username == "john.doe"
    assert result.users[0].telegram_username == "john_telegram"
    users.get_by_telegram_ids.assert_awaited_once_with([123])
