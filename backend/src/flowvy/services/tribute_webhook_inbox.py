"""Observe-only normalization and persistence of authenticated Tribute events."""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, ValidationError

from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.schemas.tribute_webhooks import (
    TributeCancelledSubscriptionPayload,
    TributeDigitalProductRefundPayload,
    TributeNewDigitalProductPayload,
    TributeOneTimeDonationPayload,
    TributePaidSubscriptionPayload,
    TributeRecurringDonationPayload,
    TributeWebhookEnvelope,
    TributeWebhookInboxInput,
)
from flowvy.services.entitlements import TributeEntitlementPlanner
from flowvy.services.webhook_security import verify_hmac_sha256_hex

logger = logging.getLogger(__name__)

_MAX_BIGINT = 2**63 - 1

_EVENT_SHAPES: dict[
    str,
    tuple[str, str | None, str | None, type[BaseModel]],
] = {
    "new_donation": (
        "donation",
        "one_time",
        "donation_request_id",
        TributeOneTimeDonationPayload,
    ),
    "recurrent_donation": (
        "donation",
        "recurring",
        "donation_request_id",
        TributeRecurringDonationPayload,
    ),
    "cancelled_donation": (
        "donation",
        "recurring",
        "donation_request_id",
        TributeRecurringDonationPayload,
    ),
    "new_subscription": (
        "subscription",
        "recurring",
        "subscription_id",
        TributePaidSubscriptionPayload,
    ),
    "renewed_subscription": (
        "subscription",
        "recurring",
        "subscription_id",
        TributePaidSubscriptionPayload,
    ),
    "cancelled_subscription": (
        "subscription",
        "recurring",
        "subscription_id",
        TributeCancelledSubscriptionPayload,
    ),
    "new_digital_product": (
        "digital_product",
        "one_time",
        "product_id",
        TributeNewDigitalProductPayload,
    ),
    "digital_product_refunded": (
        "digital_product",
        "one_time",
        "product_id",
        TributeDigitalProductRefundPayload,
    ),
}


class TributeWebhookPayloadError(ValueError):
    """A signed Tribute payload contains an invalid normalized field."""


class TributeWebhookInboxService:
    """Persist authenticated Tribute metadata without executing commerce rules."""

    def __init__(
        self,
        repository: TributeWebhookEventRepository,
        planner: TributeEntitlementPlanner,
    ) -> None:
        self._repository = repository
        self._planner = planner

    @staticmethod
    def verify_signature(body: bytes, api_key: str, signature: str) -> bool:
        """Verify Tribute's documented raw-body HMAC-SHA256 signature."""
        return verify_hmac_sha256_hex(body, api_key, signature)

    async def observe(
        self,
        envelope: TributeWebhookEnvelope,
        delivery_key: str,
    ) -> bool:
        """Normalize and atomically persist one delivery without external side effects."""
        event = self._normalize(envelope, delivery_key)
        stored = await self._repository.record_once(event)
        if stored is not None:
            await self._planner.plan(stored, event)
            logger.info("Tribute webhook observed: %s", envelope.name)
        else:
            logger.info("Duplicate Tribute webhook ignored: %s", envelope.name)
        return stored is not None

    @classmethod
    def _normalize(
        cls,
        envelope: TributeWebhookEnvelope,
        delivery_key: str,
    ) -> TributeWebhookInboxInput:
        payload = envelope.payload
        shape = _EVENT_SHAPES.get(envelope.name)
        if shape is None:
            event_family, payment_mode, item_key = "other", None, None
            payload = envelope.payload
        else:
            event_family, payment_mode, item_key, payload_model = shape
            try:
                payload = payload_model.model_validate(envelope.payload).model_dump()
            except ValidationError as exc:
                raise TributeWebhookPayloadError("Invalid documented Tribute payload") from exc

        amount = cls._optional_non_negative_int(payload, "amount")
        currency = cls._optional_currency(payload, "currency")
        if (amount is None) != (currency is None):
            msg = "Tribute amount and currency must appear together"
            raise TributeWebhookPayloadError(msg)

        return TributeWebhookInboxInput(
            delivery_key=delivery_key,
            event_name=envelope.name,
            event_family=event_family,
            processing_status="observed" if shape is not None else "ignored",
            provider_created_at=envelope.created_at,
            provider_sent_at=envelope.sent_at,
            telegram_user_id=cls._optional_positive_int(payload, "telegram_user_id"),
            transaction_id=cls._optional_identifier(payload, "transaction_id"),
            purchase_id=cls._optional_identifier(payload, "purchase_id"),
            external_item_id=(cls._optional_identifier(payload, item_key) if item_key else None),
            amount_minor=amount,
            currency=currency,
            payment_mode=payment_mode,
        )

    @staticmethod
    def _optional_non_negative_int(payload: dict[str, Any], key: str) -> int | None:
        value = payload.get(key)
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= _MAX_BIGINT:
            raise TributeWebhookPayloadError(f"Invalid Tribute field: {key}")
        return value

    @staticmethod
    def _optional_positive_int(payload: dict[str, Any], key: str) -> int | None:
        value = payload.get(key)
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, int) or not 0 < value <= _MAX_BIGINT:
            raise TributeWebhookPayloadError(f"Invalid Tribute field: {key}")
        return value

    @staticmethod
    def _optional_identifier(payload: dict[str, Any], key: str) -> str | None:
        value = payload.get(key)
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (str, int)):
            raise TributeWebhookPayloadError(f"Invalid Tribute field: {key}")
        normalized = str(value).strip()
        if (
            not normalized
            or len(normalized) > 128
            or re.fullmatch(r"[A-Za-z0-9._:-]+", normalized) is None
        ):
            raise TributeWebhookPayloadError(f"Invalid Tribute field: {key}")
        return normalized

    @staticmethod
    def _optional_currency(payload: dict[str, Any], key: str) -> str | None:
        value = payload.get(key)
        if value is None:
            return None
        if not isinstance(value, str):
            raise TributeWebhookPayloadError(f"Invalid Tribute field: {key}")
        normalized = value.strip().upper()
        if len(normalized) != 3 or not normalized.isascii() or not normalized.isalpha():
            raise TributeWebhookPayloadError(f"Invalid Tribute field: {key}")
        return normalized
