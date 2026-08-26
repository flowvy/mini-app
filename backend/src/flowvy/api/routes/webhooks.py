"""Remnawave webhook receiver endpoint."""

from __future__ import annotations

import datetime
import json
import logging

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Request, Response, status
from pydantic import ValidationError

from flowvy.api.webhook_utils import read_limited_body
from flowvy.config import Settings
from flowvy.schemas.webhooks import WebhookPayload
from flowvy.services.webhook_handler import WebhookHandlerService
from flowvy.services.webhook_security import sha256_hex

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"], route_class=DishkaRoute)


@router.post(
    "/api/webhooks/remnawave",
    status_code=status.HTTP_200_OK,
    response_model=None,
)
async def receive_remnawave_webhook(
    request: Request,
    settings: FromDishka[Settings] = None,  # type: ignore[assignment]
    handler: FromDishka[WebhookHandlerService] = None,  # type: ignore[assignment]
) -> Response:
    """Receive and process a Remnawave webhook event."""
    if not settings.remnawave_webhook_secret:
        return Response(status_code=status.HTTP_404_NOT_FOUND)

    signature = request.headers.get("X-Remnawave-Signature", "")
    provider_timestamp = request.headers.get("X-Remnawave-Timestamp", "")
    if not signature or not provider_timestamp:
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    body = await read_limited_body(
        request,
        settings.remnawave_webhook_max_body_bytes,
    )
    if body is None:
        return Response(status_code=status.HTTP_413_CONTENT_TOO_LARGE)

    if not WebhookHandlerService.verify_signature(
        body,
        settings.remnawave_webhook_secret,
        signature,
    ):
        logger.warning("Invalid webhook signature")
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        decoded = json.loads(body)
        if not isinstance(decoded, dict):
            raise ValueError
        body_timestamp = decoded.get("timestamp")
        if not isinstance(body_timestamp, str) or body_timestamp != provider_timestamp:
            logger.warning("Webhook timestamp header does not match signed payload")
            return Response(status_code=status.HTTP_401_UNAUTHORIZED)
        payload = WebhookPayload.model_validate(decoded)
    except json.JSONDecodeError, UnicodeDecodeError, ValidationError, ValueError, TypeError:
        logger.warning("Malformed webhook payload")
        return Response(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)

    now = datetime.datetime.now(datetime.UTC)
    oldest = now - datetime.timedelta(
        seconds=settings.remnawave_webhook_max_age_seconds,
    )
    newest = now + datetime.timedelta(
        seconds=settings.remnawave_webhook_future_tolerance_seconds,
    )
    if not oldest <= payload.timestamp <= newest:
        logger.warning("Webhook timestamp is outside the accepted freshness window")
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    delivery_key = sha256_hex(body)
    await handler.handle_event(payload, delivery_key)

    return Response(
        content='{"ok":true}',
        media_type="application/json",
        status_code=status.HTTP_200_OK,
    )
