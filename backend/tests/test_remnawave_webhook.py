"""Security and contract tests for the Remnawave webhook boundary."""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

from flowvy.api.routes.webhooks import receive_remnawave_webhook
from flowvy.config import Settings
from flowvy.repositories.webhook_event import WebhookEventRepository
from flowvy.schemas.webhooks import WebhookPayload
from flowvy.services.dashboard import CACHE_KEY as DASHBOARD_CACHE_KEY
from flowvy.services.pulse import CACHE_KEY as PULSE_CACHE_KEY
from flowvy.services.webhook_handler import WebhookHandlerService

SECRET = "a" * 32


def _payload_bytes(
    timestamp: datetime.datetime,
    *,
    scope: str = "user",
    event: str = "user.modified",
    data: object | None = None,
) -> bytes:
    timestamp_text = timestamp.isoformat().replace("+00:00", "Z")
    return json.dumps(
        {
            "scope": scope,
            "event": event,
            "timestamp": timestamp_text,
            "data": data
            if data is not None
            else {
                "uuid": "7ad6ab84-e15e-4674-99f4-561d47554c38",
                "email": "must-not-be-persisted@example.test",
                "trojanPassword": "must-not-be-persisted",
            },
        },
        separators=(",", ":"),
    ).encode()


def _signature(body: bytes) -> str:
    return hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def _request(
    body: bytes,
    *,
    signature: str | None = None,
    provider_timestamp: str | None = None,
    content_length: int | None = None,
) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if signature is not None:
        headers.append((b"x-remnawave-signature", signature.encode()))
    if provider_timestamp is not None:
        headers.append((b"x-remnawave-timestamp", provider_timestamp.encode()))
    if content_length is not None:
        headers.append((b"content-length", str(content_length).encode()))

    delivered = False

    async def receive() -> dict[str, object]:
        nonlocal delivered
        if delivered:
            return {"type": "http.disconnect"}
        delivered = True
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/webhooks/remnawave",
            "headers": headers,
        },
        receive,
    )


def _settings(**overrides: object) -> Settings:
    return Settings(
        _env_file=None,
        remnawave_webhook_secret=SECRET,
        **overrides,
    )


@pytest.mark.asyncio
async def test_valid_delivery_uses_signed_body_digest() -> None:
    now = datetime.datetime.now(datetime.UTC)
    body = _payload_bytes(now)
    timestamp = json.loads(body)["timestamp"]
    handler = AsyncMock(spec=WebhookHandlerService)

    response = await receive_remnawave_webhook(
        _request(
            body,
            signature=_signature(body),
            provider_timestamp=timestamp,
        ),
        _settings(),
        handler,
    )

    assert response.status_code == 200
    payload, delivery_key = handler.handle_event.await_args.args
    assert payload.timestamp == now
    assert delivery_key == hashlib.sha256(body).hexdigest()


@pytest.mark.asyncio
@pytest.mark.parametrize("signature", [None, "wrong"])
async def test_missing_or_invalid_signature_is_rejected(signature: str | None) -> None:
    now = datetime.datetime.now(datetime.UTC)
    body = _payload_bytes(now)
    handler = AsyncMock(spec=WebhookHandlerService)

    response = await receive_remnawave_webhook(
        _request(
            body,
            signature=signature,
            provider_timestamp=json.loads(body)["timestamp"],
        ),
        _settings(),
        handler,
    )

    assert response.status_code == 401
    handler.handle_event.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("provider_timestamp", [None, "2026-01-01T00:00:00Z"])
async def test_timestamp_header_must_match_signed_payload(
    provider_timestamp: str | None,
) -> None:
    body = _payload_bytes(datetime.datetime.now(datetime.UTC))
    handler = AsyncMock(spec=WebhookHandlerService)

    response = await receive_remnawave_webhook(
        _request(
            body,
            signature=_signature(body),
            provider_timestamp=provider_timestamp,
        ),
        _settings(),
        handler,
    )

    assert response.status_code == 401
    handler.handle_event.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "offset_seconds",
    [-301, 60],
)
async def test_stale_or_future_delivery_is_rejected(offset_seconds: int) -> None:
    timestamp = datetime.datetime.now(datetime.UTC) + datetime.timedelta(
        seconds=offset_seconds,
    )
    body = _payload_bytes(timestamp)
    handler = AsyncMock(spec=WebhookHandlerService)

    response = await receive_remnawave_webhook(
        _request(
            body,
            signature=_signature(body),
            provider_timestamp=json.loads(body)["timestamp"],
        ),
        _settings(),
        handler,
    )

    assert response.status_code == 401
    handler.handle_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_malformed_schema_is_rejected_without_details() -> None:
    body = _payload_bytes(
        datetime.datetime.now(datetime.UTC),
        data=["not", "an", "object"],
    )
    handler = AsyncMock(spec=WebhookHandlerService)

    response = await receive_remnawave_webhook(
        _request(
            body,
            signature=_signature(body),
            provider_timestamp=json.loads(body)["timestamp"],
        ),
        _settings(),
        handler,
    )

    assert response.status_code == 422
    assert not response.body
    handler.handle_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_oversized_body_is_rejected_before_processing() -> None:
    body = b"x" * 2049
    handler = AsyncMock(spec=WebhookHandlerService)

    response = await receive_remnawave_webhook(
        _request(
            body,
            signature=_signature(body),
            provider_timestamp="2026-01-01T00:00:00Z",
        ),
        _settings(remnawave_webhook_max_body_bytes=2048),
        handler,
    )

    assert response.status_code == 413
    handler.handle_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_duplicate_delivery_has_no_second_side_effect() -> None:
    repo = AsyncMock(spec=WebhookEventRepository)
    repo.record_once = AsyncMock(side_effect=[True, False])
    redis = AsyncMock()
    redis.delete = AsyncMock(return_value=1)
    service = WebhookHandlerService(repo, redis)
    payload = WebhookPayload(
        scope="user",
        event="user.modified",
        timestamp=datetime.datetime.now(datetime.UTC),
        data={"trojanPassword": "must-not-be-persisted"},
    )

    assert await service.handle_event(payload, "a" * 64) is True
    assert await service.handle_event(payload, "a" * 64) is False

    assert repo.record_once.await_count == 2
    assert "data" not in repo.record_once.await_args_list[0].kwargs
    redis.delete.assert_awaited_once_with(DASHBOARD_CACHE_KEY)


@pytest.mark.asyncio
async def test_node_event_invalidates_pulse_cache() -> None:
    repo = AsyncMock(spec=WebhookEventRepository)
    repo.record_once = AsyncMock(return_value=True)
    redis = AsyncMock()
    redis.delete = AsyncMock(return_value=1)
    service = WebhookHandlerService(repo, redis)
    payload = WebhookPayload(
        scope="node",
        event="node.modified",
        timestamp=datetime.datetime.now(datetime.UTC),
        data={},
    )

    assert await service.handle_event(payload, "b" * 64) is True

    redis.delete.assert_awaited_once_with(PULSE_CACHE_KEY)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("scope", "event"),
    [
        ("user", "user.created"),
        ("user", "user.limited"),
        ("user", "user.expired"),
        ("user_hwid_devices", "user_hwid_devices.added"),
        ("user_hwid_devices", "user_hwid_devices.deleted"),
    ],
)
async def test_all_user_and_hwid_events_invalidate_dashboard(
    scope: str,
    event: str,
) -> None:
    repo = AsyncMock(spec=WebhookEventRepository)
    repo.record_once = AsyncMock(return_value=True)
    redis = AsyncMock()
    redis.delete = AsyncMock(return_value=1)
    service = WebhookHandlerService(repo, redis)
    payload = WebhookPayload(
        scope=scope,
        event=event,
        timestamp=datetime.datetime.now(datetime.UTC),
        data={},
    )

    assert await service.handle_event(payload, "c" * 64) is True
    redis.delete.assert_awaited_once_with(DASHBOARD_CACHE_KEY)
