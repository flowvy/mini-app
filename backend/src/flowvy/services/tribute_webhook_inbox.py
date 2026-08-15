"""Observe-only normalization and persistence of authenticated Tribute events."""

from __future__ import annotations

import datetime
import logging
import re
from typing import Any

from pydantic import BaseModel, ValidationError

from flowvy.repositories.sponsor_checkout import SponsorCheckoutRepository
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.schemas.tribute_webhooks import (
    TributeCancelledSubscriptionPayload,
    TributeNewDonationPayload,
    TributePaidSubscriptionPayload,
    TributeRecurringDonationPayload,
    TributeWebhookEnvelope,
    TributeWebhookInboxInput,
)
from flowvy.services.entitlements import TributeEntitlementPlanner
from flowvy.services.webhook_security import verify_hmac_sha256_hex

logger = logging.getLogger(__name__)

_MAX_BIGINT = 2**63 - 1
_SAFE_VALIDATION_PART = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
_SAFE_VALIDATION_TYPE = re.compile(r"^[a-z][a-z0-9_.]{0,63}$")
_ONE_TIME_DONATION_PERIODS = frozenset({"once", "onetime", "one_time"})

_EVENT_SHAPES: dict[
    str,
    tuple[str, str | None, str | None, type[BaseModel]],
] = {
    "new_donation": (
        "donation",
        None,
        "donation_request_id",
        TributeNewDonationPayload,
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
}


def _safe_validation_diagnostics(exc: ValidationError) -> tuple[str, ...]:
    """Project Pydantic errors without provider values, messages, or context."""
    diagnostics: list[str] = []
    for error in exc.errors(
        include_url=False,
        include_context=False,
        include_input=False,
    )[:10]:
        path_parts = [
            str(part)
            if isinstance(part, int) or _SAFE_VALIDATION_PART.fullmatch(str(part))
            else "field"
            for part in error.get("loc", ())
        ]
        path = ".".join(path_parts) or "payload"
        error_type = str(error.get("type", "validation_error"))
        if not _SAFE_VALIDATION_TYPE.fullmatch(error_type):
            error_type = "validation_error"
        diagnostics.append(f"{path}:{error_type}")
    return tuple(diagnostics) or ("payload:validation_error",)


class TributeWebhookPayloadError(ValueError):
    """A signed Tribute payload contains an invalid normalized field."""

    def __init__(
        self,
        message: str,
        *,
        diagnostics: tuple[str, ...] = (),
    ) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


class TributeWebhookInboxService:
    """Persist authenticated Tribute metadata without executing commerce rules."""

    def __init__(
        self,
        repository: TributeWebhookEventRepository,
        planner: TributeEntitlementPlanner,
        checkouts: SponsorCheckoutRepository | None = None,
    ) -> None:
        self._repository = repository
        self._planner = planner
        self._checkouts = checkouts

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
            if event.processing_status == "ignored":
                logger.info("Unsupported Tribute webhook ignored: %s", envelope.name)
                return True
            checkout_match = None
            if self._checkouts is not None and event.event_name in {
                "new_subscription",
                "renewed_subscription",
                "new_donation",
                "recurrent_donation",
            }:
                checkout_match = await self._checkouts.confirm_matching(
                    stored,
                    datetime.datetime.now(datetime.UTC),
                )
            await self._planner.plan(
                stored,
                event,
                sponsor_checkout=(checkout_match.checkout if checkout_match else None),
                sponsor_checkout_mismatch_reason=(
                    checkout_match.mismatch_reason if checkout_match else None
                ),
            )
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
            payload = {}
        else:
            event_family, payment_mode, item_key, payload_model = shape
            try:
                payload = payload_model.model_validate(envelope.payload).model_dump()
            except ValidationError as exc:
                raise TributeWebhookPayloadError(
                    "Invalid documented Tribute payload",
                    diagnostics=_safe_validation_diagnostics(exc),
                ) from exc

        provider_period = payload.get("period")
        if event_family == "donation":
            payment_mode = (
                "one_time" if provider_period in _ONE_TIME_DONATION_PERIODS else "recurring"
            )
            if payment_mode == "one_time":
                provider_period = None
        elif event_family != "subscription":
            provider_period = None

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
            provider_expires_at=(
                payload.get("expires_at") if event_family == "subscription" else None
            ),
            is_anonymous=(payload.get("anonymously") if event_family == "donation" else None),
            telegram_user_id=cls._optional_positive_int(payload, "telegram_user_id"),
            external_item_id=(cls._optional_identifier(payload, item_key) if item_key else None),
            amount_minor=amount,
            currency=currency,
            payment_mode=payment_mode,
            provider_period=provider_period,
            subscription_type=(payload.get("type") if event_family == "subscription" else None),
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
