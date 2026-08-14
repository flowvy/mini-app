"""Pydantic models for Remnawave API requests and responses."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from flowvy.schemas.user_status import (
    ProviderUserStatus,
    UserStatus,
    normalize_user_status,
)


class RemnawaveCreateUserRequest(BaseModel):
    """Safe create-user subset shared by Remnawave 2.8 and 3.0/3.1."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    username: str
    status: ProviderUserStatus = "ACTIVE"
    traffic_limit_bytes: int = 0
    traffic_limit_strategy: str = "NO_RESET"
    expire_at: datetime
    description: str | None = None
    tag: str | None = None
    telegram_id: int
    hwid_device_limit: int | None = None
    active_internal_squads: list[uuid.UUID] = Field(default_factory=list)
    external_squad_uuid: uuid.UUID | None = None

    def to_provider_payload(self) -> dict[str, object]:
        """Serialize exactly the supported provider request fields."""
        return self.model_dump(by_alias=True, exclude_none=True, mode="json")


class RemnawaveUpdateUserRequest(BaseModel):
    """Version-neutral supported fields for the official update-user contract."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status: Literal["ACTIVE", "DISABLED"] | None = None
    traffic_limit_bytes: int | None = Field(default=None, ge=0)
    traffic_limit_strategy: str | None = None
    expire_at: datetime
    description: str | None = None
    tag: str | None = None
    hwid_device_limit: int | None = Field(default=None, ge=0)
    active_internal_squads: list[uuid.UUID] | None = None
    external_squad_uuid: uuid.UUID | None = None

    def to_provider_payload(
        self,
        *,
        identity_field: Literal["id", "uuid"],
        identity: int | str,
    ) -> dict[str, object]:
        """Serialize one absolute update with the detected version identity."""
        payload = self.model_dump(by_alias=True, exclude_none=True, mode="json")
        payload[identity_field] = identity
        return payload


class RemnawaveUserTraffic(BaseModel):
    """Traffic counters embedded in user response."""

    model_config = ConfigDict(populate_by_name=True)

    used_traffic_bytes: int
    lifetime_used_traffic_bytes: int
    online_at: datetime | None = None
    first_connected_at: datetime | None = None


class RemnawaveInternalSquad(BaseModel):
    """Internal squad reference embedded in user response."""

    model_config = ConfigDict(populate_by_name=True)

    uuid: str
    name: str


class RemnawaveUserData(BaseModel):
    """User object shared by Remnawave 2.x and 3.x responses."""

    model_config = ConfigDict(populate_by_name=True)

    provider_id: int
    uuid: str | None = None
    short_uuid: str
    username: str
    status: UserStatus
    traffic_limit_bytes: int = 0
    traffic_limit_strategy: str = "NO_RESET"
    expire_at: datetime
    created_at: datetime
    updated_at: datetime
    telegram_id: int | None = None
    email: str | None = None
    hwid_device_limit: int | None = None
    tag: str | None = None
    description: str | None = None
    last_traffic_reset_at: datetime | None = None
    subscription_url: str
    active_internal_squads: list[RemnawaveInternalSquad] = Field(default_factory=list)
    external_squad_uuid: str | None = None
    user_traffic: RemnawaveUserTraffic

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: object) -> UserStatus:
        """Keep known provider codes and hide future/raw values behind UNKNOWN."""
        return normalize_user_status(value)

    @classmethod
    def from_raw(cls, raw: dict) -> RemnawaveUserData:
        """Map camelCase JSON to model."""
        traffic = raw.get("userTraffic", {})
        squads_raw = raw.get("activeInternalSquads", [])
        return cls(
            provider_id=raw["id"],
            uuid=raw.get("uuid"),
            short_uuid=raw["shortUuid"],
            username=raw["username"],
            status=raw.get("status"),
            traffic_limit_bytes=raw.get("trafficLimitBytes", 0),
            traffic_limit_strategy=raw.get("trafficLimitStrategy", "NO_RESET"),
            expire_at=raw["expireAt"],
            created_at=raw["createdAt"],
            updated_at=raw["updatedAt"],
            telegram_id=raw.get("telegramId"),
            email=raw.get("email"),
            hwid_device_limit=raw.get("hwidDeviceLimit"),
            tag=raw.get("tag"),
            description=raw.get("description"),
            last_traffic_reset_at=raw.get("lastTrafficResetAt"),
            subscription_url=raw["subscriptionUrl"],
            active_internal_squads=[
                RemnawaveInternalSquad(uuid=s["uuid"], name=s["name"]) for s in squads_raw
            ],
            external_squad_uuid=raw.get("externalSquadUuid"),
            user_traffic=RemnawaveUserTraffic(
                used_traffic_bytes=traffic.get("usedTrafficBytes", 0),
                lifetime_used_traffic_bytes=traffic.get(
                    "lifetimeUsedTrafficBytes",
                    0,
                ),
                online_at=traffic.get("onlineAt"),
                first_connected_at=traffic.get("firstConnectedAt"),
            ),
        )


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
    user_status: UserStatus
    traffic_limit_strategy: str
    hwid_device_limit: int | None = None
    hwid_device_count: int | None = None

    @field_validator("user_status", mode="before")
    @classmethod
    def normalize_status(cls, value: object) -> UserStatus:
        """Normalize subscription-info status to the same BFF-safe enum."""
        return normalize_user_status(value)


class RemnawaveUsersPage(BaseModel):
    """Validated page returned by the Remnawave admin users endpoint."""

    users: list[RemnawaveUserData]
    total: int = Field(ge=0)


class RemnawaveSubInfo(BaseModel):
    """Response from ``GET /api/sub/{shortUuid}/info``."""

    model_config = ConfigDict(populate_by_name=True)

    is_found: bool
    user: RemnawaveSubInfoUser
    subscription_url: str = ""


class RemnawaveDevice(BaseModel):
    """Single device from the version-specific user HWID endpoint."""

    model_config = ConfigDict(populate_by_name=True)

    hwid: str
    user_uuid: str | None = None
    user_id: int | None = None
    platform: str | None = None
    os_version: str | None = None
    device_model: str | None = None
    user_agent: str | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_owner_reference(self) -> RemnawaveDevice:
        """Require the owner key used by either supported Remnawave contract."""
        if self.user_uuid is None and self.user_id is None:
            raise ValueError("device owner reference is missing")
        return self

    @classmethod
    def from_raw(cls, raw: dict) -> RemnawaveDevice:
        """Map camelCase JSON to model."""
        return cls(
            hwid=raw["hwid"],
            user_uuid=raw.get("userUuid"),
            user_id=raw.get("userId"),
            platform=raw.get("platform"),
            os_version=raw.get("osVersion"),
            device_model=raw.get("deviceModel"),
            user_agent=raw.get("userAgent"),
            created_at=raw["createdAt"],
            updated_at=raw["updatedAt"],
        )
