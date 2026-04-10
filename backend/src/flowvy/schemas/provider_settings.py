"""Schemas for provider settings API."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ProviderSettingsResponse(BaseModel):
    """GET /api/admin/settings response."""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    kuma_enabled: bool
    kuma_url: str | None
    kuma_slug: str | None
    support_url: str | None
    renew_url: str | None
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

    kuma_enabled: bool | None = None
    kuma_url: str | None = None
    kuma_slug: str | None = None
    support_url: str | None = None
    renew_url: str | None = None
    app_name: str | None = None
    logo_url: str | None = None
    welcome_text: str | None = None
    welcome_media_url: str | None = None
    welcome_media_type: str | None = None
    welcome_media_file_id: str | None = None
    welcome_media_file_name: str | None = None
    welcome_button_text: str | None = None


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
