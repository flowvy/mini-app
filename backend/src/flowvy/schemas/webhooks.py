"""Schemas for Remnawave webhook payloads."""

from __future__ import annotations

import datetime
from typing import Any

from pydantic import BaseModel


class WebhookPayload(BaseModel):
    """Incoming Remnawave webhook event payload."""

    scope: str
    event: str
    timestamp: datetime.datetime
    data: dict[str, Any]
