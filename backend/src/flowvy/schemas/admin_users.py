"""BFF admin users response for the Mini App admin panel."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class AdminUserTrafficResponse(BaseModel):
    """Traffic counters embedded in admin user response."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )

    used_traffic_bytes: int
    lifetime_used_traffic_bytes: int
    online_at: datetime | None = None
    first_connected_at: datetime | None = None


class AdminUserInternalSquadResponse(BaseModel):
    """Internal squad name in admin user response."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )

    name: str


class AdminUserResponse(BaseModel):
    """Single user in the admin users list."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )

    uuid: str
    username: str
    status: str
    tag: str | None = None
    description: str | None = None
    traffic_limit_bytes: int = 0
    traffic_limit_strategy: str = "NO_RESET"
    expire_at: datetime
    telegram_id: int | None = None
    email: str | None = None
    hwid_device_limit: int | None = None
    created_at: datetime
    subscription_url: str
    active_internal_squads: list[AdminUserInternalSquadResponse] = []
    external_squad_name: str | None = None
    user_traffic: AdminUserTrafficResponse


class AdminUsersResponse(BaseModel):
    """Paginated admin users list."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )

    users: list[AdminUserResponse]
    total: int
