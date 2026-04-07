"""User API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class FeaturesResponse(BaseModel):
    """Feature flags derived from provider settings."""

    pulse: bool = False


class BrandingResponse(BaseModel):
    """Provider branding — custom app name and logo."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    app_name: str | None = None
    logo_url: str | None = None


class UserResponse(BaseModel):
    """Public representation of a user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None
    full_name: str
    role: str
    is_active: bool
    features: FeaturesResponse = FeaturesResponse()
    branding: BrandingResponse = BrandingResponse()
