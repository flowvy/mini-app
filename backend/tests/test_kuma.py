"""Security and contract tests for the Uptime Kuma client."""

from __future__ import annotations

from collections.abc import Sequence

import httpx
import pytest
from pydantic import ValidationError

from flowvy.config import Settings
from flowvy.kuma_target import KumaTargetError, KumaTargetPolicy, normalize_kuma_slug
from flowvy.services.kuma import KumaError, UptimeKumaClient

STATUS_V2 = {
    "config": {"title": "Flowvy"},
    "incidents": [
        {"title": "Maintenance", "createdDate": "2026-08-02 10:00:00"},
    ],
    "publicGroupList": [
        {"name": "Core", "monitorList": [{"id": 1, "name": "API"}]},
    ],
    "maintenanceList": [],
}
HEARTBEATS = {
    "heartbeatList": {"1": [{"status": 1, "ping": 12.5}]},
    "uptimeList": {"1_24": 0.999},
}


def _resolver(*addresses: str):
    async def resolve(_host: str, _port: int) -> Sequence[str]:
        return addresses

    return resolve


def _client(
    handler: httpx.AsyncBaseTransport | httpx.MockTransport,
    *,
    resolver=None,
    private_origins: Sequence[str] = (),
    max_bytes: int = 1_048_576,
) -> tuple[UptimeKumaClient, httpx.AsyncClient]:
    http = httpx.AsyncClient(
        transport=handler,
        trust_env=False,
        follow_redirects=False,
    )
    policy = KumaTargetPolicy(
        private_origins,
        resolver=resolver or _resolver("93.184.216.34"),
    )
    return UptimeKumaClient(http, policy, max_response_bytes=max_bytes), http


@pytest.mark.parametrize(
    "url",
    [
        "ftp://status.example.test",
        "https://user:pass@status.example.test",
        "https://status.example.test/admin",
        "https://status.example.test/?next=http://127.0.0.1",
        "https://status.example.test/#fragment",
        "https://metadata.google.internal",
        "https://status.example.test\\@127.0.0.1",
    ],
)
@pytest.mark.asyncio
async def test_target_rejects_malformed_origins(url: str) -> None:
    policy = KumaTargetPolicy(resolver=_resolver("93.184.216.34"))

    with pytest.raises(KumaTargetError):
        await policy.prepare(url, "flowvy", heartbeat=False)


@pytest.mark.parametrize("slug", ["../admin", "a/b", "-bad", "bad-", "bad--slug", ""])
def test_slug_is_one_safe_path_segment(slug: str) -> None:
    with pytest.raises(KumaTargetError):
        normalize_kuma_slug(slug)


@pytest.mark.parametrize(
    "addresses",
    [
        ("127.0.0.1",),
        ("10.0.0.5",),
        ("169.254.169.254",),
        ("::1",),
        ("fe80::1",),
        ("93.184.216.34", "10.0.0.5"),
    ],
)
@pytest.mark.asyncio
async def test_public_target_rejects_any_non_public_resolution(
    addresses: tuple[str, ...],
) -> None:
    policy = KumaTargetPolicy(resolver=_resolver(*addresses))

    with pytest.raises(KumaTargetError):
        await policy.prepare("https://status.example.test", "flowvy", heartbeat=False)


@pytest.mark.asyncio
async def test_private_http_requires_exact_origin_allowlist() -> None:
    policy = KumaTargetPolicy(
        ["http://10.0.0.5:3001"],
        resolver=_resolver("10.0.0.5"),
    )

    allowed = await policy.prepare("http://10.0.0.5:3001", "flowvy", heartbeat=False)
    assert str(allowed[0].url) == "http://10.0.0.5:3001/api/status-page/flowvy"

    with pytest.raises(KumaTargetError):
        await policy.prepare("http://10.0.0.5:3002", "flowvy", heartbeat=False)


def test_private_origin_environment_is_normalized_and_validated() -> None:
    settings = Settings(
        _env_file=None,
        kuma_allowed_private_origins="http://10.0.0.5:3001,http://10.0.0.5:3001/",
    )
    assert settings.kuma_allowed_private_origins == ["http://10.0.0.5:3001"]

    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            kuma_allowed_private_origins="http://user@10.0.0.5:3001",
        )


@pytest.mark.asyncio
async def test_request_is_dns_pinned_and_preserves_host_and_sni() -> None:
    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=STATUS_V2)

    client, http = _client(
        httpx.MockTransport(handler),
        resolver=_resolver("93.184.216.34"),
    )
    try:
        result = await client.get_status_page("https://status.example.com", "Flowvy")
    finally:
        await http.aclose()

    assert result.public_group_list[0].monitor_list[0].name == "API"
    assert len(seen) == 1
    assert seen[0].url.host == "93.184.216.34"
    assert seen[0].headers["host"] == "status.example.com"
    assert seen[0].extensions["sni_hostname"] == "status.example.com"


@pytest.mark.asyncio
async def test_connect_failure_tries_next_validated_address() -> None:
    seen_hosts: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen_hosts.append(request.url.host)
        if request.url.host == "93.184.216.34":
            raise httpx.ConnectError("refused", request=request)
        return httpx.Response(200, json=STATUS_V2)

    client, http = _client(
        httpx.MockTransport(handler),
        resolver=_resolver("93.184.216.34", "93.184.216.35"),
    )
    try:
        await client.get_status_page("https://status.example.com", "flowvy")
    finally:
        await http.aclose()

    assert seen_hosts == ["93.184.216.34", "93.184.216.35"]


@pytest.mark.asyncio
async def test_redirect_is_not_followed() -> None:
    calls = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"Location": "http://127.0.0.1/private"})

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(KumaError, match="HTTP 302"):
            await client.get_status_page("https://status.example.test", "flowvy")
    finally:
        await http.aclose()

    assert calls == 1


@pytest.mark.asyncio
async def test_non_200_never_leaks_response_body() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="private upstream secret")

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(KumaError) as exc_info:
            await client.get_status_page("https://status.example.test", "flowvy")
    finally:
        await http.aclose()

    assert "private upstream secret" not in exc_info.value.detail
    assert exc_info.value.status_code == 500


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (b"not-json", "invalid status-page"),
        (b'{"incidents":[],"publicGroupList":"wrong"}', "invalid status-page"),
        (b'{"publicGroupList":[]}', "invalid status-page"),
    ],
)
@pytest.mark.asyncio
async def test_status_contract_rejects_malformed_responses(
    body: bytes,
    expected: str,
) -> None:
    client, http = _client(httpx.MockTransport(lambda _request: httpx.Response(200, content=body)))
    try:
        with pytest.raises(KumaError, match=expected):
            await client.get_status_page("https://status.example.test", "flowvy")
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_response_body_is_bounded_while_streaming() -> None:
    client, http = _client(
        httpx.MockTransport(lambda _request: httpx.Response(200, content=b"x" * 65)),
        max_bytes=64,
    )
    try:
        with pytest.raises(KumaError, match="too large"):
            await client.get_status_page("https://status.example.test", "flowvy")
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_timeout_maps_to_safe_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("internal target details", request=request)

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(KumaError, match="timed out") as exc_info:
            await client.get_status_page("https://status.example.test", "flowvy")
    finally:
        await http.aclose()

    assert "internal target details" not in exc_info.value.detail


@pytest.mark.asyncio
async def test_heartbeat_contract_and_uptime_range() -> None:
    client, http = _client(
        httpx.MockTransport(lambda _request: httpx.Response(200, json=HEARTBEATS))
    )
    try:
        result = await client.get_heartbeats("https://status.example.test", "flowvy")
    finally:
        await http.aclose()
    assert result.heartbeat_list["1"][0].ping == 12.5

    bad = {**HEARTBEATS, "uptimeList": {"1_24": 1.1}}
    bad_client, bad_http = _client(
        httpx.MockTransport(lambda _request: httpx.Response(200, json=bad))
    )
    try:
        with pytest.raises(KumaError, match="invalid heartbeat"):
            await bad_client.get_heartbeats("https://status.example.test", "flowvy")
    finally:
        await bad_http.aclose()


@pytest.mark.asyncio
async def test_supported_kuma_v1_incident_contract_is_normalized() -> None:
    status_v1 = {
        "config": {"title": "Flowvy"},
        "incident": {"title": "Legacy incident", "createdDate": "2026-08-02"},
        "publicGroupList": [],
        "maintenanceList": [],
    }
    client, http = _client(
        httpx.MockTransport(lambda _request: httpx.Response(200, json=status_v1))
    )
    try:
        result = await client.get_status_page("https://status.example.test", "flowvy")
    finally:
        await http.aclose()

    assert [incident.title for incident in result.active_incidents] == ["Legacy incident"]
