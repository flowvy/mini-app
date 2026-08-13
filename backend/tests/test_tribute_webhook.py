"""Deterministic transport and normalization tests for Tribute webhooks."""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json
from unittest.mock import AsyncMock

import pytest
from pydantic import SecretStr
from starlette.requests import Request

from flowvy.api.routes.tribute_webhooks import (
    _safe_json_shape,
    receive_tribute_webhook,
    router,
)
from flowvy.config import Settings
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.services.tribute_webhook_inbox import TributeWebhookInboxService

SECRET = "tribute-test-key"


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": "postgresql+asyncpg://example:example@localhost/example",
        "tribute_api_key": SecretStr(SECRET),
        "tribute_webhook_max_age_seconds": 90_000,
        "tribute_webhook_future_tolerance_seconds": 300,
        "tribute_webhook_max_body_bytes": 65_536,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def _payload_bytes(
    sent_at: datetime.datetime,
    *,
    created_at: datetime.datetime | None = None,
    name: str = "new_digital_product",
    payload: object | None = None,
    extra: dict[str, object] | None = None,
) -> bytes:
    body: dict[str, object] = {
        "name": name,
        "created_at": (created_at or sent_at - datetime.timedelta(seconds=1))
        .isoformat()
        .replace("+00:00", "Z"),
        "sent_at": sent_at.isoformat().replace("+00:00", "Z"),
        "payload": payload
        if payload is not None
        else {
            "product_id": 456,
            "amount": 500,
            "currency": "rub",
            "trb_user_id": "must-not-be-persisted",
            "telegram_user_id": 12321321,
            "telegram_username": "must-not-be-persisted",
            "purchase_id": 78901,
            "transaction_id": 234567,
        },
    }
    body.update(extra or {})
    return json.dumps(body, separators=(",", ":")).encode()


def _signature(body: bytes) -> str:
    return hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def _request(
    body: bytes,
    *,
    signature: str | None = None,
    content_length: int | None = None,
    content_type: str | None = "application/json",
) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if signature is not None:
        headers.append((b"trbt-signature", signature.encode()))
    if content_length is not None:
        headers.append((b"content-length", str(content_length).encode()))
    if content_type is not None:
        headers.append((b"content-type", content_type.encode()))

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
            "path": "/api/webhooks/tribute",
            "headers": headers,
        },
        receive,
    )


def _service(*, created: bool = True) -> tuple[TributeWebhookInboxService, AsyncMock]:
    repo = AsyncMock(spec=TributeWebhookEventRepository)
    repo.record_once = AsyncMock(return_value=created)
    return TributeWebhookInboxService(repo), repo


@pytest.mark.asyncio
async def test_valid_delivery_is_normalized_without_raw_payload() -> None:
    now = datetime.datetime.now(datetime.UTC)
    body = _payload_bytes(now)
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    assert response.body == b'{"status":"ok"}'
    event = repo.record_once.await_args.args[0]
    assert event.delivery_key == hashlib.sha256(body).hexdigest()
    assert event.event_name == "new_digital_product"
    assert event.event_family == "digital_product"
    assert event.processing_status == "observed"
    assert event.telegram_user_id == 12321321
    assert event.transaction_id == "234567"
    assert event.purchase_id == "78901"
    assert event.external_item_id == "456"
    assert event.amount_minor == 500
    assert event.currency == "RUB"
    assert event.payment_mode == "one_time"
    assert not hasattr(event, "payload")
    assert not hasattr(event, "telegram_username")


@pytest.mark.asyncio
async def test_unconfigured_receiver_is_not_discoverable() -> None:
    now = datetime.datetime.now(datetime.UTC)
    body = _payload_bytes(now)
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(tribute_api_key=SecretStr("")),
        service,
    )

    assert response.status_code == 404
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "signature",
    [None, "wrong", "00" * 31, "gg" * 32, " ".join(["00"] * 32)],
)
async def test_missing_or_invalid_signature_is_rejected(signature: str | None) -> None:
    body = _payload_bytes(datetime.datetime.now(datetime.UTC))
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=signature),
        _settings(),
        service,
    )

    assert response.status_code == 401
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
async def test_signature_accepts_equivalent_uppercase_hex() -> None:
    body = _payload_bytes(datetime.datetime.now(datetime.UTC))
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body).upper()),
        _settings(),
        service,
    )

    assert response.status_code == 200
    repo.record_once.assert_awaited_once()


@pytest.mark.asyncio
async def test_authenticated_provider_test_ping_is_acknowledged_without_persistence() -> None:
    body = b'{"test_event":"webhook check"}'
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    assert response.body == b'{"status":"ok"}'
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        b'{"test_event":""}',
        b'{"test_event":123}',
        b'{"test_event":"ok","extra":true}',
        json.dumps({"test_event": "x" * 101}).encode(),
        b'{"test_event":"unsafe\\nvalue"}',
    ],
)
async def test_malformed_provider_test_ping_is_rejected(body: bytes) -> None:
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 400
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("content_type", [None, "text/plain", "application/problem+json"])
async def test_non_json_content_type_is_rejected(content_type: str | None) -> None:
    body = _payload_bytes(datetime.datetime.now(datetime.UTC))
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body), content_type=content_type),
        _settings(),
        service,
    )

    assert response.status_code == 415
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        b"not-json",
        b"[]",
        _payload_bytes(
            datetime.datetime.now(datetime.UTC),
            extra={"unexpected": True},
        ),
        _payload_bytes(
            datetime.datetime.now(datetime.UTC),
            name="invalid\nevent",
        ),
    ],
)
async def test_signed_malformed_envelope_is_rejected(body: bytes) -> None:
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 400
    assert not response.body
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("offset_seconds", [-90_001, 301])
async def test_stale_or_future_delivery_is_rejected(offset_seconds: int) -> None:
    sent_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(
        seconds=offset_seconds,
    )
    body = _payload_bytes(sent_at)
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 401
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
async def test_creation_after_delivery_is_rejected_as_malformed() -> None:
    sent_at = datetime.datetime.now(datetime.UTC)
    body = _payload_bytes(
        sent_at,
        created_at=sent_at + datetime.timedelta(seconds=1),
    )
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 400
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("declared_size", [2049, -1])
async def test_invalid_or_oversized_content_length_is_rejected(
    declared_size: int,
) -> None:
    body = _payload_bytes(datetime.datetime.now(datetime.UTC))
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(
            body,
            signature=_signature(body),
            content_length=declared_size,
        ),
        _settings(tribute_webhook_max_body_bytes=2048),
        service,
    )

    assert response.status_code == 413
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
async def test_streamed_body_over_limit_is_rejected() -> None:
    body = b"x" * 2049
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(tribute_webhook_max_body_bytes=2048),
        service,
    )

    assert response.status_code == 413
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"amount": "500", "currency": "RUB"},
        {"amount": 2**63, "currency": "RUB"},
        {"telegram_user_id": 2**63},
    ],
)
async def test_invalid_normalized_field_is_rejected_without_persistence(
    payload: dict[str, object],
) -> None:
    body = _payload_bytes(
        datetime.datetime.now(datetime.UTC),
        payload=payload,
    )
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 400
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
async def test_unsafe_identifier_is_rejected_without_persistence() -> None:
    body = _payload_bytes(
        datetime.datetime.now(datetime.UTC),
        payload={"transaction_id": "tx\nforged"},
    )
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 400
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_event_is_stored_only_as_ignored_metadata() -> None:
    body = _payload_bytes(
        datetime.datetime.now(datetime.UTC),
        name="future_event",
        payload={"provider_secret": "must-not-be-persisted"},
    )
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    event = repo.record_once.await_args.args[0]
    assert event.event_family == "other"
    assert event.processing_status == "ignored"
    assert not hasattr(event, "provider_secret")


@pytest.mark.asyncio
async def test_duplicate_delivery_remains_a_successful_acknowledgement() -> None:
    body = _payload_bytes(datetime.datetime.now(datetime.UTC))
    service, repo = _service(created=False)

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    repo.record_once.assert_awaited_once()


def test_app_registers_dedicated_tribute_webhook_path() -> None:
    paths = {route.path for route in router.routes}

    assert "/api/webhooks/tribute" in paths
    assert "/webhook/tribute" not in paths


def test_signed_payload_diagnostics_expose_shape_but_never_values() -> None:
    body = json.dumps(
        {
            "event_type": "secret-event-value",
            "payload": {
                "telegram_user_id": 123456789,
                "unsafe\nkey": "secret-payload-value",
            },
            "unsafe\nroot": "secret-root-value",
        },
    ).encode()

    shape = _safe_json_shape(body)
    rendered = repr(shape)

    assert shape == {
        "root": "object",
        "keys": ["event_type", "payload"],
        "field_types": {"event_type": "str", "payload": "dict"},
        "omitted_keys": 1,
        "payload_keys": ["telegram_user_id"],
        "omitted_payload_keys": 1,
    }
    assert "secret-event-value" not in rendered
    assert "123456789" not in rendered
    assert "secret-payload-value" not in rendered
    assert "unsafe" not in rendered
