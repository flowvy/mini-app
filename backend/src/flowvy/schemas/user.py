"""User API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from flowvy.schemas.operator_content import OperatorContentLocale


class FeaturesResponse(BaseModel):
    """Feature flags derived from provider settings."""

    pulse: bool = False


class BrandingResponse(BaseModel):
    """Public provider identity."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    app_name: str | None = None
    logo_url: str | None = None
    content: OperatorContentLocale = Field(default_factory=OperatorContentLocale)


class UserResponse(BaseModel):
    """Public representation of a user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None
    full_name: str
    role: str
    is_active: bool
    features: FeaturesResponse = Field(default_factory=FeaturesResponse)
    branding: BrandingResponse = Field(default_factory=BrandingResponse)
