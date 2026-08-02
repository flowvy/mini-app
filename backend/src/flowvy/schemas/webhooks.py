"""Schemas for Remnawave webhook payloads."""

from __future__ import annotations

import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class WebhookPayload(BaseModel):
    """Incoming Remnawave webhook event payload."""

    scope: str = Field(min_length=1, max_length=50)
    event: str = Field(min_length=1, max_length=100)
    timestamp: datetime.datetime
    data: dict[str, Any]
    meta: dict[str, Any] | None = None

    @field_validator("timestamp")
    @classmethod
    def require_aware_timestamp(cls, value: datetime.datetime) -> datetime.datetime:
        """Reject ambiguous provider timestamps and normalize accepted values to UTC."""
        if value.tzinfo is None or value.utcoffset() is None:
            msg = "Webhook timestamp must include a timezone"
            raise ValueError(msg)
        return value.astimezone(datetime.UTC)
