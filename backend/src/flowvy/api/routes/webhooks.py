"""Remnawave webhook receiver endpoint."""

from __future__ import annotations

import logging

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Request, Response, status

from flowvy.config import Settings
from flowvy.schemas.webhooks import WebhookPayload
from flowvy.services.webhook_handler import WebhookHandlerService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"], route_class=DishkaRoute)


@router.post(
    "/api/webhooks/remnawave",
    status_code=status.HTTP_200_OK,
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
    if not signature:
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    body = await request.body()

    if not WebhookHandlerService.verify_signature(
        body,
        settings.remnawave_webhook_secret,
        signature,
    ):
        logger.warning("Invalid webhook signature")
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    payload = WebhookPayload.model_validate_json(body)
    await handler.handle_event(payload)

    return Response(
        content='{"ok":true}',
        media_type="application/json",
        status_code=status.HTTP_200_OK,
    )
