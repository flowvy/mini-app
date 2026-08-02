"""Security and v0.18.7 contract tests for the Beszel client."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

import httpx
import pytest
from pydantic import ValidationError

from flowvy.beszel_target import BeszelTargetError, BeszelTargetPolicy
from flowvy.config import Settings
from flowvy.services.beszel import BeszelClient, BeszelError

TOKEN = "t" * 32
SYSTEM_ID = "abcde12345abcde"
NOW = datetime(2026, 8, 2, 12, tzinfo=UTC)


def _resolver(*addresses: str):
    async def resolve(_host: str, _port: int) -> Sequence[str]:
        return addresses

    return resolve


def _page(items: list[dict[str, object]], *, page: int = 1) -> dict[str, object]:
    return {
        "page": page,
        "perPage": 500,
        "totalItems": len(items),
        "totalPages": 1 if items else 0,
        "items": items,
    }


def _client(
    handler: httpx.AsyncBaseTransport | httpx.MockTransport,
    *,
    resolver=None,
    private_origins: Sequence[str] = (),
    email: str = "pulse@example.test",
    password: str = "private-password",
    max_bytes: int = 1_048_576,
) -> tuple[BeszelClient, httpx.AsyncClient]:
    http = httpx.AsyncClient(
        transport=handler,
        trust_env=False,
        follow_redirects=False,
    )
    policy = BeszelTargetPolicy(
        private_origins,
        resolver=resolver or _resolver("93.184.216.34"),
    )
    return (
        BeszelClient(
            http,
            policy,
            email=email,
            password=password,
            max_response_bytes=max_bytes,
        ),
        http,
    )


@pytest.mark.parametrize(
    "url",
    [
        "ftp://monitor.example.test",
        "https://user:pass@monitor.example.test",
        "https://monitor.example.test/admin",
        "https://monitor.example.test/?next=http://127.0.0.1",
        "https://metadata.google.internal",
        "https://monitor.example.test\\@127.0.0.1",
    ],
)
@pytest.mark.asyncio
async def test_target_rejects_malformed_origins(url: str) -> None:
    policy = BeszelTargetPolicy(resolver=_resolver("93.184.216.34"))

    with pytest.raises(BeszelTargetError):
        await policy.prepare(url, "/api/collections/systems/records")


@pytest.mark.parametrize(
    "addresses",
    [
        ("127.0.0.1",),
        ("10.0.0.5",),
        ("169.254.169.254",),
        ("::1",),
        ("93.184.216.34", "10.0.0.5"),
    ],
)
@pytest.mark.asyncio
async def test_public_target_rejects_any_non_public_resolution(
    addresses: tuple[str, ...],
) -> None:
    policy = BeszelTargetPolicy(resolver=_resolver(*addresses))

    with pytest.raises(BeszelTargetError):
        await policy.prepare(
            "https://monitor.example.test",
            "/api/collections/systems/records",
        )


@pytest.mark.asyncio
async def test_private_http_requires_exact_origin_allowlist() -> None:
    policy = BeszelTargetPolicy(
        ["http://10.0.0.5:8090"],
        resolver=_resolver("10.0.0.5"),
    )

    allowed = await policy.prepare(
        "http://10.0.0.5:8090",
        "/api/collections/systems/records",
    )
    assert str(allowed[0].url) == "http://10.0.0.5:8090/api/collections/systems/records"

    with pytest.raises(BeszelTargetError):
        await policy.prepare(
            "http://10.0.0.5:8091",
            "/api/collections/systems/records",
        )


def test_private_origin_environment_and_secret_are_safe() -> None:
    settings = Settings(
        _env_file=None,
        beszel_allowed_private_origins=("http://10.0.0.5:8090,http://10.0.0.5:8090/"),
        beszel_password="private-password",
    )
    assert settings.beszel_allowed_private_origins == ["http://10.0.0.5:8090"]
    assert "private-password" not in repr(settings)

    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            beszel_allowed_private_origins="http://user@10.0.0.5:8090",
        )


@pytest.mark.asyncio
async def test_snapshot_uses_documented_contract_and_pins_every_request() -> None:
    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("auth-with-password"):
            assert request.headers.get("authorization") is None
            return httpx.Response(200, json={"token": TOKEN, "record": {"id": "user"}})
        assert request.headers["authorization"] == TOKEN
        if request.url.path.endswith("systems/records"):
            return httpx.Response(
                200,
                json=_page(
                    [
                        {
                            "id": SYSTEM_ID,
                            "name": "Gateway",
                            "status": "up",
                            "created": "2026-07-01 00:00:00.000Z",
                            "additiveField": "accepted",
                        }
                    ]
                ),
            )
        stat_type = "1m" if 'type = "1m"' in request.url.params["filter"] else "20m"
        created = "2026-08-02 11:59:00.000Z" if stat_type == "1m" else "2026-08-02 11:40:00.000Z"
        return httpx.Response(
            200,
            json=_page([{"system": SYSTEM_ID, "created": created, "stats": {"ignored": 1}}]),
        )

    client, http = _client(
        httpx.MockTransport(handler),
        resolver=_resolver("93.184.216.34"),
    )
    try:
        result = await client.get_snapshot("https://monitor.example.com", now=NOW)
    finally:
        await http.aclose()

    assert result.systems[0].status == "up"
    assert len(result.minute_stats) == 1
    assert len(result.daily_stats) == 1
    assert len(seen) == 4
    assert all(request.url.host == "93.184.216.34" for request in seen)
    assert all(request.headers["host"] == "monitor.example.com" for request in seen)
    assert all(request.extensions["sni_hostname"] == "monitor.example.com" for request in seen)


@pytest.mark.asyncio
async def test_missing_credentials_fail_before_network_access() -> None:
    calls = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    client, http = _client(httpx.MockTransport(handler), email="", password="")
    try:
        with pytest.raises(BeszelError, match="credentials are not configured"):
            await client.test_connection("https://monitor.example.test")
    finally:
        await http.aclose()

    assert calls == 0


@pytest.mark.asyncio
async def test_auth_failure_never_leaks_body_or_password() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="private upstream diagnostics")

    client, http = _client(httpx.MockTransport(handler), password="do-not-leak")
    try:
        with pytest.raises(BeszelError) as exc_info:
            await client.test_connection("https://monitor.example.test")
    finally:
        await http.aclose()

    assert exc_info.value.status_code == 401
    assert "private upstream diagnostics" not in exc_info.value.detail
    assert "do-not-leak" not in exc_info.value.detail


@pytest.mark.asyncio
async def test_redirect_is_not_followed() -> None:
    calls = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"Location": "http://127.0.0.1/private"})

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(BeszelError, match="HTTP 302"):
            await client.test_connection("https://monitor.example.test")
    finally:
        await http.aclose()

    assert calls == 1


@pytest.mark.asyncio
async def test_timeout_maps_to_safe_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("internal target details", request=request)

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(BeszelError, match="timed out") as exc_info:
            await client.test_connection("https://monitor.example.test")
    finally:
        await http.aclose()

    assert "internal target details" not in exc_info.value.detail


@pytest.mark.asyncio
async def test_response_body_is_bounded_while_streaming() -> None:
    client, http = _client(
        httpx.MockTransport(lambda _request: httpx.Response(200, content=b"x" * 65)),
        max_bytes=64,
    )
    try:
        with pytest.raises(BeszelError, match="too large"):
            await client.test_connection("https://monitor.example.test")
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_malformed_auth_contract_is_rejected() -> None:
    client, http = _client(
        httpx.MockTransport(lambda _request: httpx.Response(200, json={"token": "short"}))
    )
    try:
        with pytest.raises(BeszelError, match="invalid authentication"):
            await client.test_connection("https://monitor.example.test")
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_unknown_system_status_is_rejected_as_schema_drift() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("auth-with-password"):
            return httpx.Response(200, json={"token": TOKEN})
        return httpx.Response(
            200,
            json=_page(
                [
                    {
                        "id": SYSTEM_ID,
                        "name": "Gateway",
                        "status": "degraded",
                        "created": "2026-07-01 00:00:00.000Z",
                    }
                ]
            ),
        )

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(BeszelError, match="invalid systems"):
            await client.test_connection("https://monitor.example.test")
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_malformed_stats_contract_is_rejected() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("auth-with-password"):
            return httpx.Response(200, json={"token": TOKEN})
        if request.url.path.endswith("systems/records"):
            return httpx.Response(200, json=_page([]))
        return httpx.Response(200, json=_page([{"system": SYSTEM_ID}]))

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(BeszelError, match="invalid statistics"):
            await client.get_snapshot("https://monitor.example.test", now=NOW)
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_excessive_system_count_is_rejected_before_stats_requests() -> None:
    stats_calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal stats_calls
        if request.url.path.endswith("auth-with-password"):
            return httpx.Response(200, json={"token": TOKEN})
        if request.url.path.endswith("systems/records"):
            return httpx.Response(
                200,
                json={
                    "page": 1,
                    "perPage": 500,
                    "totalItems": 201,
                    "totalPages": 1,
                    "items": [],
                },
            )
        stats_calls += 1
        return httpx.Response(500)

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(BeszelError, match="too many systems"):
            await client.get_snapshot("https://monitor.example.test", now=NOW)
    finally:
        await http.aclose()

    assert stats_calls == 0


@pytest.mark.asyncio
async def test_excessive_statistics_count_is_rejected() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("auth-with-password"):
            return httpx.Response(200, json={"token": TOKEN})
        if request.url.path.endswith("systems/records"):
            return httpx.Response(200, json=_page([]))
        return httpx.Response(
            200,
            json={
                "page": 1,
                "perPage": 500,
                "totalItems": 25_001,
                "totalPages": 51,
                "items": [],
            },
        )

    client, http = _client(httpx.MockTransport(handler))
    try:
        with pytest.raises(BeszelError, match="too many statistics"):
            await client.get_snapshot("https://monitor.example.test", now=NOW)
    finally:
        await http.aclose()
