"""Strict Tribute webhook envelope and normalized inbox input."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from flowvy.schemas.base import CamelModel


class TributeWebhookTestEnvelope(BaseModel):
    """Authenticated provider test ping with no commerce semantics."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    test_event: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )


class TributeWebhookEnvelope(BaseModel):
    """Signed Tribute event envelope; payload fields are normalized separately."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,99}$")
    created_at: datetime.datetime
    sent_at: datetime.datetime
    payload: dict[str, Any]

    @field_validator("created_at", "sent_at")
    @classmethod
    def require_aware_timestamp(cls, value: datetime.datetime) -> datetime.datetime:
        """Reject ambiguous provider timestamps and normalize accepted values to UTC."""
        if value.tzinfo is None or value.utcoffset() is None:
            msg = "Tribute webhook timestamps must include a timezone"
            raise ValueError(msg)
        return value.astimezone(datetime.UTC)

    @model_validator(mode="after")
    def require_creation_before_delivery(self) -> TributeWebhookEnvelope:
        """Reject internally inconsistent signed envelopes."""
        if self.created_at > self.sent_at:
            msg = "Tribute webhook created_at must not be after sent_at"
            raise ValueError(msg)
        return self


class _TributePayload(BaseModel):
    """Strict documented field types while allowing additive provider fields."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class TributeSubscriptionPayload(_TributePayload):
    subscription_name: str
    subscription_id: int = Field(gt=0, strict=True)
    period_id: int = Field(gt=0, strict=True)
    period: Literal["monthly", "quarterly", "yearly"]
    price: int = Field(ge=0, strict=True)
    amount: int = Field(ge=0, strict=True)
    currency: str = Field(min_length=3, max_length=3)
    user_id: int = Field(strict=True)
    trb_user_id: str
    telegram_user_id: int = Field(gt=0, strict=True)
    channel_id: int = Field(strict=True)
    channel_name: str
    expires_at: datetime.datetime
    type: Literal["regular", "gift", "trial"] | None = None
    cancel_reason: str | None = None

    @field_validator("expires_at")
    @classmethod
    def require_aware_expiry(cls, value: datetime.datetime) -> datetime.datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Tribute subscription expiry must include a timezone")
        return value.astimezone(datetime.UTC)


class TributePaidSubscriptionPayload(TributeSubscriptionPayload):
    type: Literal["regular", "gift", "trial"]


class TributeCancelledSubscriptionPayload(TributeSubscriptionPayload):
    cancel_reason: str = Field(min_length=1)


class TributeDonationPayload(_TributePayload):
    donation_request_id: int = Field(gt=0, strict=True)
    donation_name: str
    period: str
    amount: int = Field(ge=0, strict=True)
    currency: str = Field(min_length=3, max_length=3)
    anonymously: StrictBool
    web_app_link: str
    user_id: int | None = Field(default=None, strict=True)
    trb_user_id: str | None = None
    telegram_user_id: int | None = Field(default=None, gt=0, strict=True)


class TributeOneTimeDonationPayload(TributeDonationPayload):
    period: Literal["once"]


class TributeRecurringDonationPayload(TributeDonationPayload):
    period: Literal["monthly", "quarterly", "yearly"]


class TributeDigitalProductPayload(_TributePayload):
    product_id: int = Field(gt=0, strict=True)
    product_name: str
    amount: int = Field(ge=0, strict=True)
    currency: str = Field(min_length=3, max_length=3)
    user_id: int | None = Field(default=None, strict=True)
    trb_user_id: str | None = None
    telegram_user_id: int | None = Field(default=None, gt=0, strict=True)
    purchase_id: int = Field(gt=0, strict=True)
    transaction_id: int = Field(gt=0, strict=True)
    purchase_created_at: datetime.datetime | None = None
    refund_reason: str | None = None
    refunded_at: datetime.datetime | None = None

    @field_validator("purchase_created_at", "refunded_at")
    @classmethod
    def normalize_optional_timestamp(
        cls,
        value: datetime.datetime | None,
    ) -> datetime.datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Tribute product timestamp must include a timezone")
        return value.astimezone(datetime.UTC)


class TributeNewDigitalProductPayload(TributeDigitalProductPayload):
    purchase_created_at: datetime.datetime


class TributeDigitalProductRefundPayload(TributeDigitalProductPayload):
    refund_reason: str
    refunded_at: datetime.datetime


class EntitlementOperatorActionResponse(CamelModel):
    """Safe latest-action context shown in the administrator journal."""

    action: Literal["retry", "resolve"]
    note: str | None
    created_at: datetime.datetime


class EntitlementOperationResponse(CamelModel):
    """Allow-listed operator journal row; no raw provider payload is exposed."""

    id: str
    event_name: str
    operation_kind: Literal["grant", "refund", "review"]
    status: Literal[
        "pending",
        "processing",
        "retry",
        "applied",
        "review",
        "resolved",
        "cancelled",
    ]
    reason_code: str | None
    provider_created_at: datetime.datetime
    telegram_user_id: int | None
    external_item_id: str | None
    amount_minor: int | None
    currency: str | None
    duration_days: int | None
    target_expiry: datetime.datetime | None
    attempt_count: int
    created_at: datetime.datetime
    available_actions: list[Literal["retry", "resolve"]]
    last_action: EntitlementOperatorActionResponse | None = None


class EntitlementOperatorActionInput(CamelModel):
    """Idempotent administrator decision for one review operation."""

    request_id: uuid.UUID
    action: Literal["retry", "resolve"]
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_action_note(self) -> Self:
        if self.action == "resolve" and self.note is None:
            raise ValueError("Resolve requires an operator note")
        if self.action == "retry" and self.note is not None:
            raise ValueError("Retry does not accept an operator note")
        return self


class EntitlementOperationListResponse(CamelModel):
    """Bounded newest-first journal page."""

    operations: list[EntitlementOperationResponse]
    has_more: bool


@dataclass(frozen=True, slots=True)
class TributeWebhookInboxInput:
    """Minimal provider metadata allowed into the durable observe-only inbox."""

    delivery_key: str
    event_name: str
    event_family: str
    processing_status: str
    provider_created_at: datetime.datetime
    provider_sent_at: datetime.datetime
    telegram_user_id: int | None
    transaction_id: str | None
    purchase_id: str | None
    external_item_id: str | None
    amount_minor: int | None
    currency: str | None
    payment_mode: str | None


__all__ = [
    "EntitlementOperationListResponse",
    "EntitlementOperationResponse",
    "EntitlementOperatorActionInput",
    "EntitlementOperatorActionResponse",
    "TributeCancelledSubscriptionPayload",
    "TributeDigitalProductPayload",
    "TributeDigitalProductRefundPayload",
    "TributeDonationPayload",
    "TributeNewDigitalProductPayload",
    "TributeOneTimeDonationPayload",
    "TributePaidSubscriptionPayload",
    "TributeRecurringDonationPayload",
    "TributeSubscriptionPayload",
    "TributeWebhookEnvelope",
    "TributeWebhookInboxInput",
    "TributeWebhookTestEnvelope",
]
