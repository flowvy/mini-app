"""Schemas for provider settings API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from flowvy.beszel_target import normalize_beszel_base_url
from flowvy.kuma_target import normalize_kuma_base_url, normalize_kuma_slug

PulseProvider = Literal["disabled", "kuma", "beszel"]


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
    app_name: str | None = None
    logo_url: str | None = None
    welcome_text: str | None = None
    welcome_media_url: str | None = None
    welcome_media_type: str | None = None
    welcome_media_file_id: str | None = None
    welcome_media_file_name: str | None = None
    welcome_button_text: str | None = None
    remnawave_version: str | None = None
    flowvy_version: str = "0.1.0"
    updated_at: int


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


class WelcomeMediaUploadResponse(BaseModel):
    """POST /api/admin/settings/welcome-media response."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    file_id: str
    file_name: str
    media_type: str


class KumaTestResponse(BaseModel):
    """GET /api/admin/settings/kuma/test response."""

    ok: bool
    error: str | None = None


class BeszelTestResponse(BaseModel):
    """GET /api/admin/settings/beszel/test response."""

    ok: bool
    error: str | None = None
