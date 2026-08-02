"""Pydantic models for Remnawave API responses."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    status: str
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
            status=raw.get("status", "ACTIVE"),
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
