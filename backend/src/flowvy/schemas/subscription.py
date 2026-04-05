"""BFF subscription response for the frontend Home page."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class SubscriptionResponse(BaseModel):
    """Aggregated subscription data sent to the Mini App."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )

    id: str
    name: str
    status: str
    used_bytes: int
    total_bytes: int
    expires_at: int
    created_at: int
    device_limit: int | None
    reset_strategy: str | None
    refill_date: int | None
    lifetime_used_bytes: int | None
    updated_at: str
    connection_link: str
    email: str | None
    telegram_id: str | None
    auto_update: bool
    update_interval: int
    support_url: str | None
    renew_url: str | None
