"""Registration, access-profile, and invite API contracts."""

from __future__ import annotations

import datetime
import re
import uuid
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from flowvy.schemas.base import CamelModel
from flowvy.schemas.operator_content import OperatorContentLocale
from flowvy.schemas.user_status import ProviderUserStatus

RegistrationMode = Literal["open", "invite_only"]
ValidityMode = Literal["duration", "fixed", "lifetime", "automation"]
TrafficStrategy = Literal["NO_RESET", "DAY", "WEEK", "MONTH", "MONTH_ROLLING"]
ReferralStatus = Literal["ready", "main_app_not_configured", "telegram_unavailable"]


class AccessProfileInput(CamelModel):
    """Editable, version-neutral Remnawave grant fields."""

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    validity_mode: ValidityMode
    validity_days: int | None = Field(default=None, ge=1, le=3650)
    fixed_expire_at: datetime.datetime | None = None
    traffic_limit_bytes: int = Field(default=0, ge=0, le=9_223_372_036_854_775_807)
    traffic_limit_strategy: TrafficStrategy = "NO_RESET"
    hwid_device_limit: int | None = Field(default=None, ge=0, le=1000)
    tag: str | None = Field(default=None, max_length=16)
    status: ProviderUserStatus = "ACTIVE"
    internal_squad_uuids: list[uuid.UUID] = Field(default_factory=list, max_length=100)
    external_squad_uuid: uuid.UUID | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        """Reject blank display names after trimming."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("Profile name is required")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        """Store optional provider description without whitespace-only values."""
        if value is None or not value.strip():
            return None
        return value.strip()

    @field_validator("tag")
    @classmethod
    def validate_tag(cls, value: str | None) -> str | None:
        """Match Remnawave's exact tag grammar."""
        if value is None or not value.strip():
            return None
        normalized = value.strip().upper()
        if re.fullmatch(r"[A-Z0-9_]+", normalized) is None:
            raise ValueError("Tag may contain only A-Z, 0-9, and underscore")
        return normalized

    @field_validator("fixed_expire_at")
    @classmethod
    def require_timezone(
        cls,
        value: datetime.datetime | None,
    ) -> datetime.datetime | None:
        """Provider dates must be absolute, never server-local wall time."""
        if value is not None and value.tzinfo is None:
            raise ValueError("Fixed expiration must include a timezone")
        return value.astimezone(datetime.UTC) if value is not None else None

    @field_validator("internal_squad_uuids")
    @classmethod
    def deduplicate_squads(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        """Preserve order while removing duplicate squad assignments."""
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def validate_validity_fields(self) -> Self:
        """Require exactly the fields used by the selected expiration mode."""
        if self.validity_mode == "duration":
            if self.validity_days is None or self.fixed_expire_at is not None:
                raise ValueError("Duration access requires validityDays only")
        elif self.validity_mode == "fixed":
            if self.fixed_expire_at is None or self.validity_days is not None:
                raise ValueError("Fixed access requires fixedExpireAt only")
        elif self.validity_days is not None or self.fixed_expire_at is not None:
            raise ValueError("This validity mode cannot include an expiration value")
        return self


class AccessProfileResponse(AccessProfileInput):
    """Admin representation of an access profile."""

    id: uuid.UUID
    is_active: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime


class RegistrationSettingsPatch(CamelModel):
    """Update the service registration mode and default grant."""

    registration_mode: RegistrationMode | None = None
    default_access_profile_id: uuid.UUID | None = None


class RegistrationSettingsResponse(CamelModel):
    """Current registration policy."""

    registration_mode: RegistrationMode
    default_access_profile_id: uuid.UUID | None


class ProviderSquad(CamelModel):
    """Allow-listed provider squad option for the admin form."""

    uuid: uuid.UUID
    name: str


class RegistrationOptionsResponse(CamelModel):
    """Current provider-owned choices for access-profile grants."""

    internal_squads: list[ProviderSquad]
    external_squads: list[ProviderSquad]
    tags: list[str]


class InviteRedeemRequest(CamelModel):
    """Personal code entered by an unauthorised Telegram user."""

    code: str = Field(min_length=8, max_length=128)


class UserInviteResponse(CamelModel):
    """The current user's reusable invitation and direct referral count."""

    code: str
    invited_count: int = Field(ge=0)
    referral_url: str | None = None
    referral_status: ReferralStatus = "telegram_unavailable"


class PreparedInviteShareResponse(CamelModel):
    """Prepared Telegram message identifier consumed by Mini App shareMessage()."""

    id: str
    expiration_date: datetime.datetime


class OnboardingStatusResponse(CamelModel):
    """Read-only state used before a local user exists."""

    state: Literal["registered", "open", "invite_required"]
    registration_mode: RegistrationMode
    app_name: str | None = None
    logo_url: str | None = None
    content: OperatorContentLocale = Field(default_factory=OperatorContentLocale)
    launch_invite_available: bool = False


class RegistrationErrorDetail(CamelModel):
    """Stable machine-readable onboarding error."""

    code: str
    message: str
