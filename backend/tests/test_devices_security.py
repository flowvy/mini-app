"""Ownership regression tests for device reads and mutations."""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from flowvy.schemas.remnawave import RemnawaveDevice, RemnawaveUserData
from flowvy.services.devices import DeviceOwnershipError, DevicesService

from .test_remnawave import FAKE_DEVICE_28, FAKE_USER


def _user(
    user_uuid: str | None,
    telegram_id: int = 123456789,
    provider_id: int = 42,
) -> RemnawaveUserData:
    raw = deepcopy(FAKE_USER)
    raw["id"] = provider_id
    if user_uuid is None:
        raw.pop("uuid", None)
    else:
        raw["uuid"] = user_uuid
    raw["telegramId"] = telegram_id
    return RemnawaveUserData.from_raw(raw)


def _service(
    users: list[RemnawaveUserData],
    local_uuid: str | None = None,
    local_id: int | None = None,
) -> tuple[DevicesService, AsyncMock, AsyncMock]:
    remnawave = AsyncMock()
    remnawave.get_users_by_telegram_id = AsyncMock(return_value=users)
    remnawave.get_devices = AsyncMock(return_value=[])
    remnawave.delete_device = AsyncMock()
    remnawave.delete_all_devices = AsyncMock()
    sub_repo = AsyncMock()
    subscriptions = []
    if local_uuid is not None or local_id is not None:
        subscriptions = [
            SimpleNamespace(
                remnawave_uuid=local_uuid,
                remnawave_user_id=local_id,
                device_limit=3,
            )
        ]
    sub_repo.get_active_by_user_id = AsyncMock(return_value=subscriptions)
    sub_repo.upsert_from_remnawave = AsyncMock()
    user_repo = AsyncMock()
    user_repo.ensure_exists = AsyncMock()
    return DevicesService(remnawave, sub_repo, user_repo), remnawave, sub_repo


def _device(user_id: int) -> RemnawaveDevice:
    raw = {**FAKE_DEVICE_28, "userId": user_id}
    return RemnawaveDevice.from_raw(raw)


@pytest.mark.asyncio
async def test_read_accepts_matching_2_8_numeric_owner() -> None:
    service, remnawave, _ = _service([_user(FAKE_USER["uuid"])])
    remnawave.get_devices.return_value = [_device(FAKE_USER["id"])]

    response = await service.get_for_user(123456789)

    assert response is not None
    assert response.total == 1
    assert response.devices[0].user_agent == "test-agent"
    assert response.devices[0].request_ip == "192.0.2.1"
    assert response.devices[0].updated_at == 1_767_312_000
    assert response.devices[0].model_dump(by_alias=True) == {
        "hwid": "device-1",
        "platform": "android",
        "osVersion": "15",
        "deviceModel": "Pixel 8",
        "userAgent": "test-agent",
        "requestIp": "192.0.2.1",
        "createdAt": 1_767_225_600,
        "updatedAt": 1_767_312_000,
    }


@pytest.mark.asyncio
async def test_read_preserves_nullable_device_metadata() -> None:
    service, remnawave, _ = _service([_user(FAKE_USER["uuid"])])
    device = {
        **FAKE_DEVICE_28,
        "platform": None,
        "osVersion": None,
        "deviceModel": None,
        "userAgent": None,
        "requestIp": None,
    }
    remnawave.get_devices.return_value = [RemnawaveDevice.from_raw(device)]

    response = await service.get_for_user(123456789)

    assert response is not None
    assert response.devices[0].platform is None
    assert response.devices[0].user_agent is None
    assert response.devices[0].request_ip is None


@pytest.mark.asyncio
async def test_read_rejects_mismatched_2_8_numeric_owner() -> None:
    service, remnawave, _ = _service([_user(FAKE_USER["uuid"])])
    remnawave.get_devices.return_value = [_device(FAKE_USER["id"] + 1)]

    with pytest.raises(DeviceOwnershipError):
        await service.get_for_user(123456789)


@pytest.mark.asyncio
async def test_delete_uses_fresh_provider_owner_not_stale_cache() -> None:
    fresh_uuid = "550e8400-e29b-41d4-a716-446655440001"
    stale_uuid = "550e8400-e29b-41d4-a716-446655440099"
    fresh_user = _user(fresh_uuid)
    service, remnawave, _ = _service([fresh_user], stale_uuid)

    await service.delete_device(123456789, "hwid-1")

    remnawave.delete_device.assert_awaited_once_with(fresh_user, "hwid-1")


@pytest.mark.asyncio
async def test_delete_stops_when_provider_has_no_owner() -> None:
    service, remnawave, _ = _service([], "550e8400-e29b-41d4-a716-446655440099")

    with pytest.raises(DeviceOwnershipError):
        await service.delete_all(123456789)

    remnawave.delete_all_devices.assert_not_awaited()


@pytest.mark.asyncio
async def test_ambiguous_owner_stops_without_local_match() -> None:
    service, remnawave, _ = _service(
        [
            _user("550e8400-e29b-41d4-a716-446655440001"),
            _user("550e8400-e29b-41d4-a716-446655440002"),
        ],
    )

    with pytest.raises(DeviceOwnershipError):
        await service.delete_device(123456789, "hwid-1")

    remnawave.delete_device.assert_not_awaited()


@pytest.mark.asyncio
async def test_ambiguous_owner_uses_unique_fresh_local_match() -> None:
    local_uuid = "550e8400-e29b-41d4-a716-446655440002"
    local_user = _user(local_uuid, provider_id=43)
    service, remnawave, _ = _service(
        [
            _user("550e8400-e29b-41d4-a716-446655440001"),
            local_user,
        ],
        local_uuid,
    )

    await service.delete_all(123456789)

    remnawave.delete_all_devices.assert_awaited_once_with(local_user)


@pytest.mark.asyncio
async def test_3_x_owner_without_uuid_is_cached_and_used_for_devices() -> None:
    user = _user(None, provider_id=314)
    service, remnawave, sub_repo = _service([user])
    remnawave.get_devices.return_value = [_device(314)]

    response = await service.get_for_user(123456789)

    assert response is not None
    remnawave.get_devices.assert_awaited_once_with(user)
    sub_repo.upsert_from_remnawave.assert_awaited_once_with(
        user_id=123456789,
        remnawave_user_id=314,
        remnawave_uuid=None,
        status=user.status,
        device_limit=user.hwid_device_limit,
        expires_at=user.expire_at,
    )


@pytest.mark.asyncio
async def test_3_x_ambiguous_owner_uses_unique_numeric_local_match() -> None:
    local_user = _user(None, provider_id=314)
    service, remnawave, _ = _service(
        [_user(None, provider_id=42), local_user],
        local_id=314,
    )

    await service.delete_all(123456789)

    remnawave.delete_all_devices.assert_awaited_once_with(local_user)
