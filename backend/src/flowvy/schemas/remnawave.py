"""Pydantic models for Remnawave API responses."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RemnawaveUserTraffic(BaseModel):
    """Traffic counters embedded in user response."""

    model_config = ConfigDict(populate_by_name=True)

    used_traffic_bytes: int
    lifetime_used_traffic_bytes: int
    online_at: datetime | None = None
    first_connected_at: datetime | None = None


class RemnawaveUserData(BaseModel):
    """Single user object from ``GET /api/users/by-telegram-id``."""

    model_config = ConfigDict(populate_by_name=True)

    uuid: str
    short_uuid: str
    username: str
    status: str
    traffic_limit_bytes: int = 0
    traffic_limit_strategy: str = "NO_RESET"
    expire_at: datetime
    created_at: datetime
    updated_at: datetime
    telegram_id: int | None = None
    email: str | None = None
    hwid_device_limit: int | None = None
    last_traffic_reset_at: datetime | None = None
    subscription_url: str
    user_traffic: RemnawaveUserTraffic


class RemnawaveSubInfoUser(BaseModel):
    """User block inside subscription info response."""

    model_config = ConfigDict(populate_by_name=True)

    short_uuid: str
    days_left: int
    username: str
    traffic_used_bytes: str
    traffic_limit_bytes: str
    lifetime_traffic_used_bytes: str
    expires_at: datetime
    is_active: bool
    user_status: str
    traffic_limit_strategy: str
    hwid_device_limit: int | None = None
    hwid_device_count: int | None = None


class RemnawaveSubInfo(BaseModel):
    """Response from ``GET /api/sub/{shortUuid}/info``."""

    model_config = ConfigDict(populate_by_name=True)

    is_found: bool
    user: RemnawaveSubInfoUser
    subscription_url: str = ""
