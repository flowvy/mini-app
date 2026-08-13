"""Strict Tribute webhook envelope and normalized inbox input."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
