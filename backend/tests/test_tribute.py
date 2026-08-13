"""Deterministic contract tests for the fixed-origin Tribute API check."""

from __future__ import annotations

import httpx
import pytest

from flowvy.services.tribute import TRIBUTE_PRODUCTS_URL, TributeClient, TributeError


def _client(
    handler: httpx.AsyncBaseTransport,
    *,
    api_key: str = "test_tribute_key",
    max_response_bytes: int = 1024,
) -> tuple[TributeClient, httpx.AsyncClient]:
    http = httpx.AsyncClient(transport=handler)
    return (
        TributeClient(http, api_key=api_key, max_response_bytes=max_response_bytes),
        http,
    )


@pytest.mark.asyncio
async def test_api_check_uses_fixed_read_only_products_request() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert str(request.url.copy_with(query=None)) == TRIBUTE_PRODUCTS_URL
        assert dict(request.url.params) == {"page": "1", "size": "1"}
        assert request.headers["Api-Key"] == "test_tribute_key"
        return httpx.Response(200, json={"rows": [], "meta": {"total": 0}})

    client, http = _client(httpx.MockTransport(handler))
    async with http:
        await client.test_connection()


@pytest.mark.asyncio
async def test_api_check_fails_before_network_without_key() -> None:
    calls = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={})

    client, http = _client(httpx.MockTransport(handler), api_key=" ")
    async with http:
        with pytest.raises(TributeError, match="not configured"):
            await client.test_connection()
    assert calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [401, 403, 500])
async def test_api_check_maps_non_success_without_returning_body(status_code: int) -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, text="private upstream diagnostic")

    client, http = _client(httpx.MockTransport(handler))
    async with http:
        with pytest.raises(TributeError) as caught:
            await client.test_connection()
    assert caught.value.status_code == status_code
    assert "private upstream diagnostic" not in caught.value.detail


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [b"not-json", b"[]", b'{"rows":"wrong"}'])
async def test_api_check_rejects_malformed_or_drifted_json(body: bytes) -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body)

    client, http = _client(httpx.MockTransport(handler))
    async with http:
        with pytest.raises(TributeError, match="invalid products response"):
            await client.test_connection()


@pytest.mark.asyncio
async def test_api_check_rejects_oversized_response() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"{" + (b'"padding":"' + b"x" * 100 + b'"}'))

    client, http = _client(httpx.MockTransport(handler), max_response_bytes=32)
    async with http:
        with pytest.raises(TributeError, match="too large"):
            await client.test_connection()


@pytest.mark.asyncio
async def test_api_check_maps_timeout_safely() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private timeout", request=request)

    client, http = _client(httpx.MockTransport(handler))
    async with http:
        with pytest.raises(TributeError, match="connection timed out"):
            await client.test_connection()


@pytest.mark.asyncio
async def test_api_check_maps_transport_failure_safely() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("private network detail", request=request)

    client, http = _client(httpx.MockTransport(handler))
    async with http:
        with pytest.raises(TributeError, match="connection failed") as caught:
            await client.test_connection()
    assert "private network detail" not in caught.value.detail
