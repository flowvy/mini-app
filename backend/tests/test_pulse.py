"""Pulse aggregation and public failure behavior tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from flowvy.api.routes.pulse import get_pulse
from flowvy.schemas.kuma import KumaHeartbeatPage, KumaStatusPage
from flowvy.services.kuma import KumaError
from flowvy.services.pulse import CACHE_KEY, PulseService


def _status_page(*, v1: bool = False) -> KumaStatusPage:
    data: dict[str, object] = {
        "publicGroupList": [
            {
                "name": "Core",
                "monitorList": [
                    {"id": 1, "name": "API"},
                    {"id": 2, "name": "Bot"},
                ],
            }
        ],
    }
    if v1:
        data["incident"] = {
            "title": "Legacy incident",
            "createdDate": "2026-08-02",
        }
    else:
        data["incidents"] = [
            {"title": "Current incident", "createdDate": "2026-08-02"},
        ]
    return KumaStatusPage.model_validate(data)


def _heartbeats(first: int, second: int) -> KumaHeartbeatPage:
    return KumaHeartbeatPage.model_validate(
        {
            "heartbeatList": {
                "1": [{"status": first, "ping": 10.5}],
                "2": [{"status": second, "ping": 20}],
            },
            "uptimeList": {"1_24": 0.99, "2_24": 0.98},
        }
    )


def _service(
    status_page: KumaStatusPage,
    heartbeats: KumaHeartbeatPage,
) -> tuple[PulseService, AsyncMock, AsyncMock]:
    kuma = AsyncMock()
    kuma.get_status_page = AsyncMock(return_value=status_page)
    kuma.get_heartbeats = AsyncMock(return_value=heartbeats)
    repo = AsyncMock()
    repo.get = AsyncMock(
        return_value=SimpleNamespace(
            kuma_enabled=True,
            kuma_url="https://status.example.test",
            kuma_slug="flowvy",
        )
    )
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock()
    redis.delete = AsyncMock()
    return PulseService(kuma, repo, redis), kuma, redis


@pytest.mark.parametrize(
    ("first", "second", "overall"),
    [
        (1, 1, "operational"),
        (0, 0, "down"),
        (0, 1, "partial"),
        (2, 1, "partial"),
        (99, 1, "partial"),
        (3, 3, "maintenance"),
        (3, 1, "maintenance"),
    ],
)
@pytest.mark.asyncio
async def test_overall_status_is_fail_safe(first: int, second: int, overall: str) -> None:
    service, _kuma, _redis = _service(_status_page(), _heartbeats(first, second))

    result = await service.get_pulse()

    assert result is not None
    assert result.overall_status == overall


@pytest.mark.asyncio
async def test_v2_incidents_are_exposed() -> None:
    service, _kuma, _redis = _service(_status_page(), _heartbeats(1, 1))
    result = await service.get_pulse()
    assert result is not None
    assert [incident.title for incident in result.incidents] == ["Current incident"]


@pytest.mark.asyncio
async def test_v1_incident_is_exposed() -> None:
    service, _kuma, _redis = _service(_status_page(v1=True), _heartbeats(1, 1))
    result = await service.get_pulse()
    assert result is not None
    assert [incident.title for incident in result.incidents] == ["Legacy incident"]


@pytest.mark.asyncio
async def test_malformed_cache_is_evicted_and_refetched() -> None:
    service, kuma, redis = _service(_status_page(), _heartbeats(1, 1))
    redis.get.return_value = b"not-json"

    result = await service.get_pulse()

    assert result is not None
    redis.delete.assert_awaited_once_with(CACHE_KEY)
    kuma.get_status_page.assert_awaited_once()
    redis.set.assert_awaited_once()


@pytest.mark.asyncio
async def test_disabled_pulse_avoids_cache_and_kuma() -> None:
    service, kuma, redis = _service(_status_page(), _heartbeats(1, 1))
    service._ps_repo.get.return_value = SimpleNamespace(
        kuma_enabled=False,
        kuma_url=None,
        kuma_slug=None,
    )

    assert await service.get_pulse() is None
    redis.get.assert_not_awaited()
    kuma.get_status_page.assert_not_awaited()


def test_empty_monitor_set_is_not_reported_healthy() -> None:
    service, _kuma, _redis = _service(_status_page(), _heartbeats(1, 1))
    assert service._compute_overall([]) == "partial"


@pytest.mark.asyncio
async def test_public_route_does_not_leak_kuma_error_detail() -> None:
    service = AsyncMock()
    service.get_pulse = AsyncMock(side_effect=KumaError("private upstream secret"))

    with pytest.raises(HTTPException) as exc_info:
        await get_pulse(SimpleNamespace(), service)

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Status page unavailable"
