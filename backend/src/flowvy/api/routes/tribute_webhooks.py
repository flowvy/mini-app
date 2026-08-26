"""Authenticated observe-only Tribute webhook receiver."""

from __future__ import annotations

import datetime
import json
import logging
import re
from typing import Any

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Request, Response, status
from pydantic import ValidationError

from flowvy.api.webhook_utils import read_limited_body
from flowvy.config import Settings
from flowvy.schemas.tribute_webhooks import (
    TributeWebhookEnvelope,
    TributeWebhookTestEnvelope,
)
from flowvy.services.tribute_webhook_inbox import (
    TributeWebhookInboxService,
    TributeWebhookPayloadError,
)
from flowvy.services.webhook_security import sha256_hex

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"], route_class=DishkaRoute)

_SAFE_FIELD_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


def _safe_json_shape(body: bytes) -> dict[str, object]:
    """Describe signed JSON structure without logging provider-owned values."""
    try:
        value: Any = json.loads(body)
    except UnicodeDecodeError, json.JSONDecodeError:
        return {"root": "invalid_json"}
    if not isinstance(value, dict):
        return {"root": type(value).__name__}

    keys = sorted(
        key for key in value if isinstance(key, str) and _SAFE_FIELD_NAME.fullmatch(key)
    )[:20]
    field_types = {key: type(value[key]).__name__ for key in keys}
    shape: dict[str, object] = {
        "root": "object",
        "keys": keys,
        "field_types": field_types,
        "omitted_keys": max(0, len(value) - len(keys)),
    }
    payload = value.get("payload")
    if isinstance(payload, dict):
        payload_keys = sorted(
            key for key in payload if isinstance(key, str) and _SAFE_FIELD_NAME.fullmatch(key)
        )[:20]
        shape["payload_keys"] = payload_keys
        shape["omitted_payload_keys"] = max(0, len(payload) - len(payload_keys))
    return shape


def _acknowledgement() -> Response:
    """Return the provider acknowledgement shared by tests and deliveries."""
    return Response(
        content='{"status":"ok"}',
        media_type="application/json",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/api/webhooks/tribute",
    status_code=status.HTTP_200_OK,
    response_model=None,
)
async def receive_tribute_webhook(
    request: Request,
    settings: FromDishka[Settings] = None,  # type: ignore[assignment]
    inbox: FromDishka[TributeWebhookInboxService] = None,  # type: ignore[assignment]
) -> Response:
    """Authenticate and persist one Tribute delivery without granting access."""
    api_key = settings.tribute_api_key.get_secret_value()
    if not api_key:
        return Response(status_code=status.HTTP_404_NOT_FOUND)

    signature = request.headers.get("trbt-signature", "")
    if not signature:
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    media_type = request.headers.get("content-type", "").partition(";")[0].strip().lower()
    if media_type != "application/json":
        return Response(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    body = await read_limited_body(request, settings.tribute_webhook_max_body_bytes)
    if body is None:
        return Response(status_code=status.HTTP_413_CONTENT_TOO_LARGE)

    if not inbox.verify_signature(body, api_key, signature):
        logger.warning("Invalid Tribute webhook signature")
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        TributeWebhookTestEnvelope.model_validate_json(body)
    except ValidationError, ValueError, TypeError:
        pass
    else:
        logger.info("Authenticated Tribute webhook test acknowledged")
        return _acknowledgement()

    try:
        envelope = TributeWebhookEnvelope.model_validate_json(body)
    except ValidationError, ValueError, TypeError:
        logger.warning(
            "Malformed Tribute webhook envelope shape=%s",
            _safe_json_shape(body),
        )
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    now = datetime.datetime.now(datetime.UTC)
    oldest = now - datetime.timedelta(
        seconds=settings.tribute_webhook_max_age_seconds,
    )
    newest = now + datetime.timedelta(
        seconds=settings.tribute_webhook_future_tolerance_seconds,
    )
    if not oldest <= envelope.sent_at <= newest or envelope.created_at > newest:
        logger.warning("Tribute webhook timestamp is outside the accepted window")
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        await inbox.observe(envelope, sha256_hex(body))
    except TributeWebhookPayloadError as exc:
        logger.warning(
            "Malformed Tribute webhook payload errors=%s",
            exc.diagnostics or ("normalized_field:invalid",),
        )
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    return _acknowledgement()
