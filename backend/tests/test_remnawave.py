"""Tests for RemnawaveClient."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from flowvy.schemas.remnawave import (
    RemnawaveCreateUserRequest,
    RemnawaveUpdateUserRequest,
    RemnawaveUserData,
)
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError

FAKE_USER = {
    "id": 42,
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

FAKE_USER_3 = {key: value for key, value in FAKE_USER.items() if key != "uuid"}

FAKE_DEVICE_28 = {
    "hwid": "device-1",
    "userId": 42,
    "platform": "android",
    "osVersion": "15",
    "deviceModel": "Pixel 8",
    "userAgent": "test-agent",
    "requestIp": "192.0.2.1",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-02T00:00:00Z",
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

FAKE_SYSTEM_STATS = {
    "cpu": {"cores": 4},
    "memory": {"total": 100, "free": 40, "used": 60},
    "uptime": 3600,
    "timestamp": 1_754_131_200,
    "users": {"statusCounts": {"ACTIVE": 2}, "totalUsers": 2},
    "onlineStats": {"lastDay": 2, "lastWeek": 2, "neverOnline": 0, "onlineNow": 1},
    "nodes": {"totalOnline": 1, "totalBytesLifetime": "12345"},
}

FAKE_BANDWIDTH = {
    key: {"current": "10", "previous": "9", "difference": "+1"}
    for key in (
        "bandwidthLastTwoDays",
        "bandwidthLastSevenDays",
        "bandwidthLast30Days",
        "bandwidthCalendarMonth",
        "bandwidthCurrentYear",
    )
}


def _make_response(json_data: dict, status_code: int = 200) -> MagicMock:
    """Build a fake httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.text = str(json_data)
    return resp


def _metadata(version: str) -> MagicMock:
    return _make_response({"response": {"version": version}})


def _make_client(
    responses: list[MagicMock],
    *,
    version: str | None = None,
) -> RemnawaveClient:
    """Create RemnawaveClient with a mocked httpx.AsyncClient."""
    http = AsyncMock()
    http.get = AsyncMock(side_effect=([_metadata(version)] if version else []) + responses)
    return RemnawaveClient(
        base_url="https://panel.example.com",
        token="test-token",
        http=http,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("version", "raw_user", "identity_field", "identity"),
    [
        ("2.8.1", FAKE_USER, "uuid", FAKE_USER["uuid"]),
        ("3.1.0", FAKE_USER_3, "id", 42),
    ],
)
async def test_update_user_access_uses_official_version_identity_and_absolute_expiry(
    version: str,
    raw_user: dict[str, object],
    identity_field: str,
    identity: object,
) -> None:
    target = "2026-09-15T12:00:00Z"
    http = AsyncMock()
    http.get = AsyncMock(return_value=_metadata(version))
    http.patch = AsyncMock(
        return_value=_make_response(
            {"response": {**raw_user, "expireAt": target, "updatedAt": target}},
        ),
    )
    client = RemnawaveClient(
        base_url="https://panel.example.com",
        token="test-token",
        http=http,
    )
    user = RemnawaveUserData.from_raw(raw_user)
    request = RemnawaveUpdateUserRequest(
        status="ACTIVE",
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        expire_at=target,
        hwid_device_limit=2,
        active_internal_squads=[],
    )

    updated = await client.update_user_access(user, request)

    assert updated.expire_at.isoformat() == "2026-09-15T12:00:00+00:00"
    body = http.patch.await_args.kwargs["json"]
    assert body[identity_field] == identity
    assert body["expireAt"] == target
    assert body["status"] == "ACTIVE"
    assert "telegramId" not in body
    other_identity = "id" if identity_field == "uuid" else "uuid"
    assert other_identity not in body


def test_update_user_payload_preserves_explicit_nullable_clears() -> None:
    request = RemnawaveUpdateUserRequest(
        expire_at="2026-09-15T12:00:00Z",
        description=None,
        tag=None,
        hwid_device_limit=None,
        external_squad_uuid=None,
    )

    body = request.to_provider_payload(identity_field="id", identity=42)

    assert body["description"] is None
    assert body["tag"] is None
    assert body["hwidDeviceLimit"] is None
    assert body["externalSquadUuid"] is None
    assert "status" not in body


@pytest.mark.asyncio
async def test_get_user_by_telegram_id_found() -> None:
    """Should parse user data from Remnawave response."""
    client = _make_client(
        [
            _make_response({"response": [FAKE_USER]}),
        ],
        version="2.8.1",
    )
    user = await client.get_user_by_telegram_id(123456789)
    assert user is not None
    assert user.short_uuid == "abc123"
    assert user.username == "testuser"
    assert user.traffic_limit_bytes == 50_000_000_000
    assert user.user_traffic.used_traffic_bytes == 4_200_000_000


@pytest.mark.asyncio
async def test_get_user_by_telegram_id_not_found() -> None:
    """Should return None when user array is empty."""
    client = _make_client(
        [
            _make_response({"response": []}),
        ],
        version="2.8.1",
    )
    user = await client.get_user_by_telegram_id(999999)
    assert user is None


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["ACTIVE", "DISABLED", "LIMITED", "EXPIRED"])
async def test_user_lookup_preserves_official_status(status: str) -> None:
    """All status values from the locked Remnawave enum cross the BFF unchanged."""
    client = _make_client(
        [_make_response({"response": [{**FAKE_USER, "status": status}]})],
        version="2.8.1",
    )

    user = await client.get_user_by_telegram_id(123456789)

    assert user is not None
    assert user.status == status


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [None, 42, "PAUSED"])
async def test_user_lookup_normalizes_unknown_status(status: object) -> None:
    """Missing, malformed, and future provider status values never leak through the BFF."""
    client = _make_client(
        [_make_response({"response": [{**FAKE_USER, "status": status}]})],
        version="2.8.1",
    )

    user = await client.get_user_by_telegram_id(123456789)

    assert user is not None
    assert user.status == "UNKNOWN"


@pytest.mark.asyncio
async def test_get_user_by_telegram_id_filters_nonmatching_records() -> None:
    """A broad provider response must still resolve the exact Telegram ID."""
    wrong_user = {**FAKE_USER, "telegramId": 111}
    client = _make_client(
        [_make_response({"response": [wrong_user, FAKE_USER]})],
        version="2.8.1",
    )

    user = await client.get_user_by_telegram_id(123456789)

    assert user is not None
    assert user.telegram_id == 123456789


@pytest.mark.asyncio
async def test_get_user_by_telegram_id_fails_on_ambiguous_exact_records() -> None:
    """Multiple exact records must never silently pick the first account."""
    second = {**FAKE_USER, "uuid": "550e8400-e29b-41d4-a716-446655440001"}
    client = _make_client(
        [_make_response({"response": [FAKE_USER, second]})],
        version="2.8.1",
    )

    with pytest.raises(RemnawaveError) as exc_info:
        await client.get_user_by_telegram_id(123456789)

    assert exc_info.value.status == 502


@pytest.mark.asyncio
async def test_3x_telegram_lookup_uses_filtered_stream_without_user_uuid() -> None:
    """Remnawave 3.x removes both user UUID and the dedicated lookup route."""
    http = AsyncMock()
    http.get = AsyncMock(
        side_effect=[
            _metadata("3.1.0"),
            _make_response(
                {
                    "response": {
                        "users": [FAKE_USER_3],
                        "nextCursor": None,
                        "hasMore": False,
                    }
                }
            ),
        ]
    )
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    user = await client.get_user_by_telegram_id(123456789)

    assert user is not None
    assert user.provider_id == 42
    assert user.uuid is None
    request_url = urlparse(http.get.await_args_list[-1].args[0])
    assert request_url.path == "/api/users/stream"
    assert parse_qs(request_url.query) == {"size": ["1000"], "telegramId": ["123456789"]}


@pytest.mark.asyncio
async def test_3x_stream_lookup_follows_numeric_cursor_and_exact_filters() -> None:
    wrong = {**FAKE_USER_3, "id": 41, "telegramId": 111}
    http = AsyncMock()
    http.get = AsyncMock(
        side_effect=[
            _metadata("3.0.0"),
            _make_response(
                {
                    "response": {
                        "users": [wrong],
                        "nextCursor": "41",
                        "hasMore": True,
                    }
                }
            ),
            _make_response(
                {
                    "response": {
                        "users": [FAKE_USER_3],
                        "nextCursor": None,
                        "hasMore": False,
                    }
                }
            ),
        ]
    )
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    users = await client.get_users_by_telegram_id(123456789)

    assert [user.provider_id for user in users] == [42]
    second_page = parse_qs(urlparse(http.get.await_args_list[-1].args[0]).query)
    assert second_page["cursor"] == ["41"]


@pytest.mark.asyncio
async def test_3x_stream_lookup_rejects_repeated_cursor() -> None:
    page = _make_response(
        {
            "response": {
                "users": [],
                "nextCursor": "42",
                "hasMore": True,
            }
        }
    )
    client = _make_client([page, page], version="3.0.0")

    with pytest.raises(RemnawaveError, match="user-stream response"):
        await client.get_users_by_telegram_id(123456789)


@pytest.mark.asyncio
async def test_admin_user_page_is_typed_and_normalizes_future_status() -> None:
    """The paginated admin path uses the same safe user contract as exact lookups."""
    client = _make_client(
        [
            _make_response(
                {
                    "response": {
                        "users": [{**FAKE_USER, "status": "PAUSED"}],
                        "total": 1,
                    }
                }
            )
        ]
    )

    page = await client.get_users()

    assert page.total == 1
    assert page.users[0].status == "UNKNOWN"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        {"users": [], "total": "1"},
        {"users": "wrong", "total": 1},
        {"users": [FAKE_USER], "total": 0},
    ],
)
async def test_admin_user_page_rejects_malformed_contract(response: dict) -> None:
    """Malformed pagination metadata remains a safe provider failure."""
    client = _make_client([_make_response({"response": response})])

    with pytest.raises(RemnawaveError, match="user-list response"):
        await client.get_users()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("version", "response_user"),
    [("2.8.1", FAKE_USER), ("3.0.0", FAKE_USER_3), ("3.1.0", FAKE_USER_3)],
)
async def test_create_user_matches_exact_supported_contracts(
    version: str,
    response_user: dict,
) -> None:
    http = AsyncMock()
    http.get = AsyncMock(side_effect=[_metadata(version)])
    http.post = AsyncMock(return_value=_make_response({"response": response_user}, 201))
    client = RemnawaveClient("https://panel.example.com", "tok", http)
    request = RemnawaveCreateUserRequest(
        username="testuser",
        status="ACTIVE",
        traffic_limit_bytes=50_000_000_000,
        traffic_limit_strategy="MONTH",
        expire_at="2026-05-01T00:00:00Z",
        description="Free access",
        tag="FREE",
        telegram_id=123456789,
        hwid_device_limit=3,
        active_internal_squads=["550e8400-e29b-41d4-a716-446655440010"],
        external_squad_uuid="550e8400-e29b-41d4-a716-446655440011",
    )

    user = await client.create_user(request)

    assert user.provider_id == 42
    assert http.post.await_args.args[0].endswith("/api/users")
    assert http.post.await_args.kwargs["json"] == {
        "username": "testuser",
        "status": "ACTIVE",
        "trafficLimitBytes": 50_000_000_000,
        "trafficLimitStrategy": "MONTH",
        "expireAt": "2026-05-01T00:00:00Z",
        "description": "Free access",
        "tag": "FREE",
        "telegramId": 123456789,
        "hwidDeviceLimit": 3,
        "activeInternalSquads": ["550e8400-e29b-41d4-a716-446655440010"],
        "externalSquadUuid": "550e8400-e29b-41d4-a716-446655440011",
    }


@pytest.mark.asyncio
async def test_create_user_rejects_mismatched_identity() -> None:
    wrong = {**FAKE_USER_3, "telegramId": 999}
    http = AsyncMock()
    http.get = AsyncMock(side_effect=[_metadata("3.1.0")])
    http.post = AsyncMock(return_value=_make_response({"response": wrong}, 201))
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    with pytest.raises(RemnawaveError, match="create-user response"):
        await client.create_user(
            RemnawaveCreateUserRequest(
                username="testuser",
                expire_at="2026-05-01T00:00:00Z",
                telegram_id=123456789,
            )
        )


@pytest.mark.asyncio
async def test_squad_options_are_allow_listed_and_validated() -> None:
    valid = {
        "uuid": "550e8400-e29b-41d4-a716-446655440010",
        "name": "Default",
        "privateConfig": "must-not-leak",
    }
    client = _make_client(
        [
            _make_response({"response": {"internalSquads": [valid]}}),
            _make_response({"response": {"externalSquads": [valid]}}),
        ]
    )

    assert await client.get_internal_squads() == [{"uuid": valid["uuid"], "name": "Default"}]
    assert await client.get_external_squads() == [{"uuid": valid["uuid"], "name": "Default"}]


@pytest.mark.asyncio
async def test_user_tags_match_the_locked_28_and_3x_contract() -> None:
    http = AsyncMock()
    http.get = AsyncMock(
        return_value=_make_response(
            {"response": {"tags": ["FREE", "premium", "FREE"]}},
        )
    )
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    assert await client.get_user_tags() == ["FREE", "PREMIUM"]
    assert http.get.await_args.args[0] == "https://panel.example.com/api/users/tags"


@pytest.mark.asyncio
async def test_dashboard_status_counts_fill_known_and_aggregate_unknown() -> None:
    """Dashboard never exposes arbitrary provider status keys to the frontend."""
    stats = {
        **FAKE_SYSTEM_STATS,
        "users": {
            "statusCounts": {"ACTIVE": 2, "LIMITED": 1, "PAUSED": 3},
            "totalUsers": 6,
        },
    }
    client = _make_client([_make_response({"response": stats})])

    result = await client.get_system_stats()

    assert result["users"]["statusCounts"] == {
        "ACTIVE": 2,
        "DISABLED": 0,
        "LIMITED": 1,
        "EXPIRED": 0,
        "UNKNOWN": 3,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"response": []},
        {"response": {"tags": "FREE"}},
        {"response": {"tags": [42]}},
        {"response": {"tags": ["contains-dash"]}},
    ],
)
async def test_user_tags_reject_schema_drift(payload: dict) -> None:
    client = _make_client([_make_response(payload)])

    with pytest.raises(RemnawaveError, match="user-tags response"):
        await client.get_user_tags()


@pytest.mark.asyncio
async def test_unknown_future_api_major_fails_closed() -> None:
    client = _make_client([], version="4.0.0")

    with pytest.raises(RemnawaveError, match="Unsupported Remnawave API version"):
        await client.get_users_by_telegram_id(123456789)


@pytest.mark.asyncio
async def test_get_subscription_info() -> None:
    """Should parse subscription info response."""
    client = _make_client(
        [
            _make_response({"response": FAKE_SUB_INFO}),
        ]
    )
    info = await client.get_subscription_info("abc123")
    assert info.is_found is True
    assert info.user.days_left == 25
    assert info.user.hwid_device_count == 1


@pytest.mark.asyncio
async def test_remnawave_error_on_4xx() -> None:
    """Should raise RemnawaveError on non-2xx response."""
    client = _make_client(
        [
            _make_response({"message": "Unauthorized"}, status_code=401),
        ]
    )
    with pytest.raises(RemnawaveError) as exc_info:
        await client.get_user_by_telegram_id(123)
    assert exc_info.value.status == 401
    assert exc_info.value.retryable is False
    assert "Unauthorized" not in exc_info.value.detail


@pytest.mark.asyncio
async def test_email_lookup_parses_array_and_exact_filters() -> None:
    wrong = {
        **FAKE_USER,
        "uuid": "550e8400-e29b-41d4-a716-446655440001",
        "email": "other@example.com",
    }
    client = _make_client(
        [_make_response({"response": [wrong, FAKE_USER]})],
        version="2.8.1",
    )

    user = await client.search_user_by_email("test@example.com")

    assert user is not None
    assert user.uuid == FAKE_USER["uuid"]


@pytest.mark.asyncio
async def test_email_lookup_fails_on_ambiguous_exact_records() -> None:
    second = {**FAKE_USER, "uuid": "550e8400-e29b-41d4-a716-446655440001"}
    client = _make_client(
        [_make_response({"response": [FAKE_USER, second]})],
        version="2.8.1",
    )

    with pytest.raises(RemnawaveError, match="Ambiguous email"):
        await client.search_user_by_email("test@example.com")


@pytest.mark.asyncio
async def test_email_lookup_rejects_old_object_assumption() -> None:
    client = _make_client(
        [_make_response({"response": FAKE_USER})],
        version="2.8.1",
    )

    with pytest.raises(RemnawaveError, match="Unexpected email"):
        await client.search_user_by_email("test@example.com")


@pytest.mark.asyncio
async def test_3x_email_lookup_uses_stream_filter() -> None:
    http = AsyncMock()
    http.get = AsyncMock(
        side_effect=[
            _metadata("3.0.0"),
            _make_response(
                {
                    "response": {
                        "users": [FAKE_USER_3],
                        "nextCursor": None,
                        "hasMore": False,
                    }
                }
            ),
        ]
    )
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    user = await client.search_user_by_email("test@example.com")

    assert user is not None
    query = parse_qs(urlparse(http.get.await_args_list[-1].args[0]).query)
    assert query["email"] == ["test@example.com"]


@pytest.mark.asyncio
async def test_path_parameters_are_encoded_as_one_segment() -> None:
    http = AsyncMock()
    http.get = AsyncMock(side_effect=[_metadata("2.8.1"), _make_response({"response": []})])
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    await client.search_user_by_email("name+tag@example.com")

    requested_url = http.get.await_args_list[-1].args[0]
    assert requested_url.endswith("/name%2Btag%40example.com")


@pytest.mark.asyncio
async def test_get_devices_accepts_2_8_numeric_owner_contract() -> None:
    """Deployed Remnawave 2.8 identifies a device owner with numeric userId."""
    client = _make_client(
        [_make_response({"response": {"total": 1, "devices": [FAKE_DEVICE_28]}})],
        version="2.8.1",
    )

    devices = await client.get_devices(RemnawaveUserData.from_raw(FAKE_USER))

    assert len(devices) == 1
    assert devices[0].user_id == FAKE_USER["id"]
    assert devices[0].user_uuid is None
    assert devices[0].user_agent == "test-agent"
    assert devices[0].request_ip == "192.0.2.1"
    assert devices[0].updated_at.isoformat() == "2026-01-02T00:00:00+00:00"


@pytest.mark.asyncio
async def test_get_devices_keeps_2_7_uuid_owner_contract() -> None:
    """The checked-in 2.7 snapshot remains accepted during provider rollout."""
    legacy_device = {**FAKE_DEVICE_28, "userUuid": FAKE_USER["uuid"]}
    legacy_device.pop("userId")
    client = _make_client(
        [_make_response({"response": {"total": 1, "devices": [legacy_device]}})],
        version="2.7.4",
    )

    devices = await client.get_devices(RemnawaveUserData.from_raw(FAKE_USER))

    assert devices[0].user_uuid == FAKE_USER["uuid"]
    assert devices[0].user_id is None


@pytest.mark.asyncio
async def test_get_devices_rejects_missing_owner_reference() -> None:
    ownerless_device = dict(FAKE_DEVICE_28)
    ownerless_device.pop("userId")
    client = _make_client(
        [_make_response({"response": {"total": 1, "devices": [ownerless_device]}})],
        version="2.8.1",
    )

    with pytest.raises(RemnawaveError, match="Unexpected device response"):
        await client.get_devices(RemnawaveUserData.from_raw(FAKE_USER))


@pytest.mark.asyncio
async def test_3x_device_read_uses_numeric_user_path() -> None:
    http = AsyncMock()
    http.get = AsyncMock(
        side_effect=[
            _metadata("3.0.0"),
            _make_response({"response": {"total": 1, "devices": [FAKE_DEVICE_28]}}),
        ]
    )
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    devices = await client.get_devices(RemnawaveUserData.from_raw(FAKE_USER_3))

    assert len(devices) == 1
    assert http.get.await_args_list[-1].args[0].endswith("/api/hwid/devices/42")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("version", "raw_user", "expected_body"),
    [
        ("2.8.1", FAKE_USER, {"userUuid": FAKE_USER["uuid"], "hwid": "device-1"}),
        ("3.0.0", FAKE_USER_3, {"userId": 42, "hwid": "device-1"}),
    ],
)
async def test_hwid_delete_body_matches_api_generation(
    version: str,
    raw_user: dict,
    expected_body: dict,
) -> None:
    http = AsyncMock()
    http.get = AsyncMock(side_effect=[_metadata(version)])
    http.post = AsyncMock(return_value=_make_response({"response": {"total": 0, "devices": []}}))
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    await client.delete_device(RemnawaveUserData.from_raw(raw_user), "device-1")

    assert http.post.await_args.kwargs["json"] == expected_body


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("version", "expected_lookup", "expected_action"),
    [
        ("2.8.1", "/api/users/by-id/42", f"/api/users/{FAKE_USER['uuid']}/actions/enable"),
        ("3.0.0", None, "/api/users/42/actions/enable"),
    ],
)
async def test_user_action_path_matches_api_generation(
    version: str,
    expected_lookup: str | None,
    expected_action: str,
) -> None:
    http = AsyncMock()
    get_responses = [_metadata(version)]
    if expected_lookup is not None:
        get_responses.append(_make_response({"response": FAKE_USER}))
    http.get = AsyncMock(side_effect=get_responses)
    http.post = AsyncMock(return_value=_make_response({"response": FAKE_USER_3}))
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    await client.enable_user(42)

    if expected_lookup is not None:
        assert http.get.await_args_list[-1].args[0].endswith(expected_lookup)
    assert http.post.await_args.args[0].endswith(expected_action)


@pytest.mark.asyncio
async def test_3x_delete_accepts_204_without_parsing_a_body() -> None:
    http = AsyncMock()
    http.get = AsyncMock(side_effect=[_metadata("3.1.0")])
    no_content = MagicMock(status_code=204)
    http.delete = AsyncMock(return_value=no_content)
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    await client.delete_user(42)

    assert http.delete.await_args.args[0].endswith("/api/users/42")


@pytest.mark.asyncio
async def test_malformed_json_maps_to_safe_contract_error() -> None:
    response = _make_response({})
    response.json.side_effect = ValueError("raw parser detail")
    client = _make_client([response])

    with pytest.raises(RemnawaveError) as exc_info:
        await client.get_metadata()

    assert exc_info.value.detail == "Provider returned invalid JSON"
    assert "raw parser detail" not in exc_info.value.detail


@pytest.mark.asyncio
async def test_missing_response_envelope_fails_closed() -> None:
    client = _make_client([_make_response({"version": "looks-valid"})])

    with pytest.raises(RemnawaveError, match="invalid response envelope"):
        await client.get_metadata()


@pytest.mark.asyncio
async def test_transport_timeout_maps_to_safe_error() -> None:
    http = AsyncMock()
    http.get = AsyncMock(side_effect=httpx.ReadTimeout("private target detail"))
    client = RemnawaveClient("https://panel.example.com", "tok", http)

    with pytest.raises(RemnawaveError) as exc_info:
        await client.get_metadata()

    assert exc_info.value.status == 504
    assert exc_info.value.detail == "Provider request timed out"
    assert exc_info.value.retryable is True


@pytest.mark.asyncio
async def test_dashboard_stats_are_validated_and_extra_fields_dropped() -> None:
    client = _make_client(
        [
            _make_response({"response": {**FAKE_SYSTEM_STATS, "privateSecret": "nope"}}),
            _make_response({"response": {**FAKE_BANDWIDTH, "privateSecret": "nope"}}),
        ]
    )

    stats = await client.get_system_stats()
    bandwidth = await client.get_bandwidth_stats()

    assert stats["users"]["totalUsers"] == 2
    assert "privateSecret" not in stats
    assert "privateSecret" not in bandwidth


@pytest.mark.asyncio
async def test_dashboard_contract_drift_fails_closed() -> None:
    client = _make_client([_make_response({"response": {"users": "wrong"}})])

    with pytest.raises(RemnawaveError, match="Unexpected system-stats"):
        await client.get_system_stats()


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
