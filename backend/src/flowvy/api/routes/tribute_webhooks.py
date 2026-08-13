"""Authenticated observe-only Tribute webhook receiver."""

from __future__ import annotations

import datetime
import logging

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Request, Response, status
from pydantic import ValidationError

from flowvy.api.webhook_utils import read_limited_body
from flowvy.config import Settings
from flowvy.schemas.tribute_webhooks import TributeWebhookEnvelope
from flowvy.services.tribute_webhook_inbox import (
    TributeWebhookInboxService,
    TributeWebhookPayloadError,
)
from flowvy.services.webhook_security import sha256_hex

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"], route_class=DishkaRoute)


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
        envelope = TributeWebhookEnvelope.model_validate_json(body)
    except (ValidationError, ValueError, TypeError):
        logger.warning("Malformed Tribute webhook envelope")
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
    except TributeWebhookPayloadError:
        logger.warning("Malformed Tribute webhook payload")
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    return Response(
        content='{"status":"ok"}',
        media_type="application/json",
        status_code=status.HTTP_200_OK,
    )
