"""Schemas for provider settings API."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    TypeAdapter,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel

from flowvy.beszel_target import normalize_beszel_base_url
from flowvy.kuma_target import normalize_kuma_base_url, normalize_kuma_slug
from flowvy.localization import DEFAULT_LOCALE, normalize_locale, normalize_locale_map
from flowvy.schemas.operator_content import (
    OperatorContentLocale,
    operator_content_template_variables,
)

PulseProvider = Literal["disabled", "kuma", "beszel"]
InviteShareMediaType = Literal["photo", "animation", "video"]
InviteSharePreviewMode = Literal["auto", "hidden", "small", "large"]
_PAYMENT_URL_ADAPTER = TypeAdapter(HttpUrl)


def normalize_payment_destination(value: str) -> str:
    """Normalize an administrator-provided HTTPS destination without guessing provider paths."""
    candidate = value.strip()
    if not candidate:
        raise ValueError("Payment URL cannot be empty")
    parsed = _PAYMENT_URL_ADAPTER.validate_python(candidate)
    if parsed.scheme != "https":
        raise ValueError("Payment URL must use HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Payment URL cannot include credentials")
    if parsed.fragment is not None:
        raise ValueError("Payment URL cannot include a fragment")
    return str(parsed)


PaymentDestinationUrl = Annotated[
    str,
    Field(max_length=2048),
    AfterValidator(normalize_payment_destination),
]
TributeSubscriptionId = Annotated[str, Field(pattern=r"^[1-9][0-9]{0,127}$")]


class ProviderSettingsResponse(BaseModel):
    """GET /api/admin/settings response."""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    pulse_provider: PulseProvider
    kuma_url: str | None
    kuma_slug: str | None
    beszel_url: str | None
    beszel_credentials_configured: bool
    tribute_credentials_configured: bool
    app_name: str | None = None
    logo_url: str | None = None
    welcome_text: str | None = None
    welcome_media_url: str | None = None
    welcome_media_type: str | None = None
    welcome_media_file_id: str | None = None
    welcome_media_file_name: str | None = None
    welcome_button_text: str | None = None
    invite_share_media_type: InviteShareMediaType | None = None
    invite_share_media_file_id: str | None = None
    invite_share_media_file_name: str | None = None
    invite_share_preview_mode: InviteSharePreviewMode = "auto"
    invite_share_allow_user_chats: bool = True
    invite_share_allow_bot_chats: bool = False
    invite_share_allow_group_chats: bool = True
    invite_share_allow_channel_chats: bool = False
    content_default_locale: str = DEFAULT_LOCALE
    content_locales: dict[str, OperatorContentLocale] = Field(default_factory=dict, max_length=20)
    content_template_variables: dict[str, list[str]] = Field(
        default_factory=operator_content_template_variables,
    )
    sponsor_offer_template_variables: list[str] = Field(
        default_factory=lambda: ["appName"],
    )
    tribute_donation_url: PaymentDestinationUrl | None = None
    tribute_subscription_urls: dict[TributeSubscriptionId, PaymentDestinationUrl] = Field(
        default_factory=dict,
        max_length=100,
    )
    referral_reward_enabled: bool = False
    referral_reward_days: int | None = Field(default=None, ge=1, le=3650)
    referral_reward_access_profile_id: uuid.UUID | None = None
    welcome_discount_enabled: bool = False
    welcome_discount_offer_id: uuid.UUID | None = None
    welcome_discount_url: PaymentDestinationUrl | None = None
    welcome_discount_percent: int | None = Field(default=None, ge=1, le=99)
    remnawave_version: str | None = None
    flowvy_version: str = "0.1.0"
    updated_at: int

    @field_validator("content_default_locale", mode="before")
    @classmethod
    def validate_content_default_locale(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("Default content locale must be a string")
        locale = normalize_locale(value, fallback="")
        if not locale:
            raise ValueError("Default content locale is invalid")
        return locale

    @field_validator("content_locales", mode="before")
    @classmethod
    def validate_content_locales(cls, value: object) -> dict[str, OperatorContentLocale]:
        return normalize_locale_map(value, OperatorContentLocale)


class ProviderSettingsPatch(BaseModel):
    """PATCH /api/admin/settings request body."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    pulse_provider: PulseProvider | None = None
    kuma_url: str | None = Field(default=None, max_length=512)
    kuma_slug: str | None = Field(default=None, max_length=255)
    beszel_url: str | None = Field(default=None, max_length=512)
    app_name: str | None = Field(default=None, max_length=100)
    logo_url: str | None = Field(default=None, max_length=512)
    welcome_text: str | None = Field(default=None, max_length=2000)
    welcome_media_url: str | None = Field(default=None, max_length=512)
    welcome_media_type: str | None = Field(default=None, max_length=20)
    welcome_media_file_id: str | None = None
    welcome_media_file_name: str | None = None
    welcome_button_text: str | None = Field(default=None, max_length=100)
    invite_share_media_type: InviteShareMediaType | None = None
    invite_share_media_file_id: str | None = None
    invite_share_media_file_name: str | None = None
    invite_share_preview_mode: InviteSharePreviewMode | None = None
    invite_share_allow_user_chats: bool | None = None
    invite_share_allow_bot_chats: bool | None = None
    invite_share_allow_group_chats: bool | None = None
    invite_share_allow_channel_chats: bool | None = None
    content_default_locale: str | None = None
    content_locales: dict[str, OperatorContentLocale] | None = Field(
        default=None,
        max_length=20,
    )
    tribute_donation_url: PaymentDestinationUrl | None = None
    tribute_subscription_urls: dict[TributeSubscriptionId, PaymentDestinationUrl] = Field(
        default_factory=dict,
        max_length=100,
    )
    referral_reward_enabled: bool = False
    referral_reward_days: int | None = Field(default=None, ge=1, le=3650)
    referral_reward_access_profile_id: uuid.UUID | None = None
    welcome_discount_enabled: bool = False
    welcome_discount_offer_id: uuid.UUID | None = None
    welcome_discount_url: PaymentDestinationUrl | None = None
    welcome_discount_percent: int | None = Field(default=None, ge=1, le=99)

    @field_validator("kuma_url")
    @classmethod
    def validate_kuma_url(cls, value: str | None) -> str | None:
        """Normalize a configured Kuma origin and reject URL smuggling."""
        if value is None or not value.strip():
            return None
        return normalize_kuma_base_url(value)

    @field_validator("kuma_slug")
    @classmethod
    def validate_kuma_slug(cls, value: str | None) -> str | None:
        """Keep the status-page identifier to one safe path segment."""
        if value is None or not value.strip():
            return None
        return normalize_kuma_slug(value)

    @field_validator("beszel_url")
    @classmethod
    def validate_beszel_url(cls, value: str | None) -> str | None:
        """Normalize a configured Beszel origin and reject URL smuggling."""
        if value is None or not value.strip():
            return None
        return normalize_beszel_base_url(value)

    @field_validator("content_default_locale")
    @classmethod
    def validate_content_default_locale(cls, value: str | None) -> str | None:
        if value is None:
            return None
        locale = normalize_locale(value, fallback="")
        if not locale:
            raise ValueError("Default content locale is invalid")
        return locale

    @field_validator("content_locales", mode="before")
    @classmethod
    def validate_content_locales(
        cls,
        value: object,
    ) -> dict[str, OperatorContentLocale] | None:
        if value is None:
            return None
        return normalize_locale_map(value, OperatorContentLocale)

    @model_validator(mode="after")
    def validate_invite_share_settings(self) -> Self:
        data = self.model_dump(exclude_unset=True)
        media_type = data.get("invite_share_media_type")
        media_file_id = data.get("invite_share_media_file_id")
        if (media_type is None) != (media_file_id is None):
            raise ValueError("Invite share media type and file ID must be set together")
        audience_fields = (
            "invite_share_allow_user_chats",
            "invite_share_allow_bot_chats",
            "invite_share_allow_group_chats",
            "invite_share_allow_channel_chats",
        )
        supplied = [data[field] for field in audience_fields if field in data]
        if len(supplied) == len(audience_fields) and not any(supplied):
            raise ValueError("At least one invite share audience is required")
        return self


class WelcomeMediaUploadResponse(BaseModel):
    """POST /api/admin/settings/welcome-media response."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    file_id: str
    file_name: str
    media_type: str


InviteShareMediaUploadResponse = WelcomeMediaUploadResponse


class KumaTestRequest(BaseModel):
    """Candidate Kuma target tested without persisting it."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    url: str | None = Field(default=None, max_length=512)
    slug: str | None = Field(default=None, max_length=255)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return normalize_kuma_base_url(value)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return normalize_kuma_slug(value)


class BeszelTestRequest(BaseModel):
    """Candidate Beszel target tested without persisting it."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    url: str | None = Field(default=None, max_length=512)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return normalize_beszel_base_url(value)


class ProviderTestResponse(BaseModel):
    """Safe provider connection-test response."""

    ok: bool
    error: str | None = None


KumaTestResponse = ProviderTestResponse
BeszelTestResponse = ProviderTestResponse
TributeTestResponse = ProviderTestResponse
