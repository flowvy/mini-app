"""Deterministic transport and normalization tests for Tribute webhooks."""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json
import logging
from types import SimpleNamespace
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
from flowvy.repositories.sponsor_checkout import SponsorCheckoutRepository
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.services.entitlements import TributeEntitlementPlanner
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
    name: str = "new_donation",
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
            "donation_request_id": 456,
            "donation_name": "Support",
            "period": "once",
            "amount": 500,
            "currency": "rub",
            "anonymously": False,
            "web_app_link": "https://t.me/tribute/app?startapp=fixture",
            "trb_user_id": "must-not-be-persisted",
            "telegram_user_id": 12321321,
            "telegram_username": "must-not-be-persisted",
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
    repo.record_once = AsyncMock(return_value=SimpleNamespace(id=1) if created else None)
    planner = AsyncMock(spec=TributeEntitlementPlanner)
    planner.plan = AsyncMock()
    return TributeWebhookInboxService(repo, planner), repo


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
    assert event.event_name == "new_donation"
    assert event.event_family == "donation"
    assert event.processing_status == "observed"
    assert event.telegram_user_id == 12321321
    assert event.external_item_id == "456"
    assert event.amount_minor == 500
    assert event.currency == "RUB"
    assert event.payment_mode == "one_time"
    assert event.provider_expires_at is None
    assert event.is_anonymous is False
    assert not hasattr(event, "payload")
    assert not hasattr(event, "telegram_username")


@pytest.mark.asyncio
async def test_donation_checkout_mismatch_reaches_planner_before_any_grant() -> None:
    now = datetime.datetime.now(datetime.UTC)
    body = _payload_bytes(
        now,
        name="new_donation",
        payload={
            "donation_request_id": 12,
            "donation_name": "Support",
            "period": "weekly",
            "amount": 50_000,
            "currency": "RUB",
            "anonymously": False,
            "web_app_link": "https://t.me/tribute/app?startapp=fixture",
            "telegram_user_id": 12321321,
        },
    )
    stored = SimpleNamespace(id=1)
    repo = AsyncMock(spec=TributeWebhookEventRepository)
    repo.record_once.return_value = stored
    planner = AsyncMock(spec=TributeEntitlementPlanner)
    checkout = SimpleNamespace(id="checkout")
    checkouts = AsyncMock(spec=SponsorCheckoutRepository)
    checkouts.confirm_matching.return_value = SimpleNamespace(
        checkout=checkout,
        mismatch_reason="donation_offer_mismatch",
    )
    service = TributeWebhookInboxService(repo, planner, checkouts)

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    event = repo.record_once.await_args.args[0]
    planner.plan.assert_awaited_once_with(
        stored,
        event,
        sponsor_checkout=checkout,
        sponsor_checkout_mismatch_reason="donation_offer_mismatch",
    )


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
    candidate: dict[str, object] = {
        "donation_request_id": 456,
        "donation_name": "Support",
        "period": "once",
        "amount": 500,
        "currency": "RUB",
        "anonymously": False,
        "web_app_link": "https://t.me/tribute/app?startapp=fixture",
        "telegram_user_id": 12321321,
    }
    candidate.update(payload)
    body = _payload_bytes(
        datetime.datetime.now(datetime.UTC),
        payload=candidate,
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
async def test_payload_validation_log_excludes_provider_values(
    caplog: pytest.LogCaptureFixture,
) -> None:
    now = datetime.datetime.now(datetime.UTC)
    private_period_value = "provider-owned-private-value"
    body = _payload_bytes(
        now,
        name="new_donation",
        payload={
            "donation_request_id": 12,
            "donation_name": "Support",
            "period": private_period_value,
            "amount": 10_000,
            "currency": "rub",
            "anonymously": False,
            "web_app_link": "https://t.me/tribute/app?startapp=fixture",
            "trb_user_id": "fixture-user",
            "telegram_user_id": 123,
        },
    )
    service, repo = _service()

    with caplog.at_level(logging.WARNING):
        response = await receive_tribute_webhook(
            _request(body, signature=_signature(body)),
            _settings(),
            service,
        )

    assert response.status_code == 400
    assert "period:literal_error" in caplog.text
    assert private_period_value not in caplog.text
    assert "fixture-user" not in caplog.text
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
async def test_cancelled_subscription_requires_documented_cancel_reason() -> None:
    now = datetime.datetime.now(datetime.UTC)
    payload = {
        "subscription_name": "Access",
        "subscription_id": 12,
        "period_id": 34,
        "period": "monthly",
        "price": 500,
        "amount": 500,
        "currency": "RUB",
        "user_id": 56,
        "trb_user_id": "tribute-user",
        "telegram_user_id": 123,
        "channel_id": 78,
        "channel_name": "Channel",
        "expires_at": (now + datetime.timedelta(days=30)).isoformat(),
    }
    body = _payload_bytes(now, name="cancelled_subscription", payload=payload)
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 400
    repo.record_once.assert_not_awaited()


@pytest.mark.asyncio
async def test_subscription_expiry_is_normalized_for_entitlement_planning() -> None:
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    expires_at = now + datetime.timedelta(days=30)
    payload = {
        "subscription_name": "Access",
        "subscription_id": 12,
        "period_id": 34,
        "period": "monthly",
        "price": 500,
        "amount": 500,
        "currency": "RUB",
        "user_id": 56,
        "trb_user_id": "tribute-user",
        "telegram_user_id": 123,
        "channel_id": 78,
        "channel_name": "Channel",
        "expires_at": expires_at.isoformat(),
        "type": "regular",
    }
    body = _payload_bytes(now, name="new_subscription", payload=payload)
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    event = repo.record_once.await_args.args[0]
    assert event.provider_expires_at == expires_at
    assert event.provider_period == "monthly"
    assert event.subscription_type == "regular"
    assert event.is_anonymous is None


@pytest.mark.asyncio
async def test_anonymous_donation_flag_is_preserved_without_payer_identity() -> None:
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    payload = {
        "donation_request_id": 12,
        "donation_name": "Support",
        "period": "once",
        "amount": 500,
        "currency": "RUB",
        "anonymously": True,
        "web_app_link": "https://t.me/tribute/app",
    }
    body = _payload_bytes(now, name="new_donation", payload=payload)
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    event = repo.record_once.await_args.args[0]
    assert event.is_anonymous is True
    assert event.telegram_user_id is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_name", "period", "expected_mode", "expected_period"),
    [
        pytest.param("new_donation", "once", "one_time", None, id="one-time-first-payment"),
        pytest.param("new_donation", "onetime", "one_time", None, id="one-time-current-alias"),
        pytest.param("new_donation", "one_time", "one_time", None, id="one-time-snake-alias"),
        pytest.param(
            "new_donation",
            "weekly",
            "recurring",
            "weekly",
            id="weekly-recurring-first-payment",
        ),
        pytest.param(
            "new_donation",
            "monthly",
            "recurring",
            "monthly",
            id="recurring-first-payment",
        ),
        pytest.param(
            "recurrent_donation",
            "monthly",
            "recurring",
            "monthly",
            id="recurring-renewal",
        ),
        pytest.param(
            "recurrent_donation",
            "halfyearly",
            "recurring",
            "halfyearly",
            id="halfyearly-recurring-renewal",
        ),
    ],
)
async def test_live_observed_donation_event_modes_are_normalized(
    event_name: str,
    period: str,
    expected_mode: str,
    expected_period: str | None,
) -> None:
    """Protect the signed event combinations observed in retained production logs."""
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    payload = {
        "donation_request_id": 12,
        "donation_name": "Support",
        "period": period,
        "amount": 500,
        "currency": "RUB",
        "anonymously": False,
        "web_app_link": "https://t.me/tribute/app",
        "telegram_user_id": 123,
    }
    body = _payload_bytes(now, name=event_name, payload=payload)
    service, repo = _service()

    response = await receive_tribute_webhook(
        _request(body, signature=_signature(body)),
        _settings(),
        service,
    )

    assert response.status_code == 200
    event = repo.record_once.await_args.args[0]
    assert event.event_family == "donation"
    assert event.payment_mode == expected_mode
    assert event.provider_period == expected_period


@pytest.mark.asyncio
async def test_invalid_documented_identifier_is_rejected_without_persistence() -> None:
    body = _payload_bytes(
        datetime.datetime.now(datetime.UTC),
        payload={
            "donation_request_id": "tx\nforged",
            "donation_name": "Support",
            "period": "once",
            "amount": 500,
            "currency": "RUB",
            "anonymously": False,
            "web_app_link": "https://t.me/tribute/app?startapp=fixture",
            "telegram_user_id": 12321321,
        },
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
        payload={
            "provider_secret": "must-not-be-persisted",
            "expires_at": {"unsafe": "shape"},
            "anonymously": "not-a-boolean",
        },
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
    assert event.provider_expires_at is None
    assert event.is_anonymous is None
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
