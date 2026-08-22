"""Typed allow-list for localized operator-authored public content."""

from __future__ import annotations

from typing import Self

from pydantic import Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from flowvy.localization import placeholders, render_placeholders
from flowvy.schemas.base import CamelModel
from flowvy.schemas.content import formatted_text_visible_length, normalize_formatted_text
from flowvy.telegram_text import normalize_telegram_html, telegram_html_visible_text

_APP_PLACEHOLDERS = frozenset({"appName", "app_name"})
_CANONICAL_PLACEHOLDERS: dict[str, tuple[str, ...]] = {
    "invite_share_text": ("appName", "code"),
}
_ALLOWED_PLACEHOLDERS: dict[str, frozenset[str]] = {
    "welcome_text": _APP_PLACEHOLDERS,
    "welcome_button_text": _APP_PLACEHOLDERS,
    "bot_invite_required": _APP_PLACEHOLDERS,
    "onboarding_invite_title": _APP_PLACEHOLDERS,
    "onboarding_invite_description": _APP_PLACEHOLDERS,
    "onboarding_open_title": _APP_PLACEHOLDERS,
    "onboarding_open_description": _APP_PLACEHOLDERS,
    "onboarding_redeem_action": _APP_PLACEHOLDERS,
    "onboarding_register_action": _APP_PLACEHOLDERS,
    "invite_title": _APP_PLACEHOLDERS,
    "invite_description": _APP_PLACEHOLDERS,
    "invite_share_text": frozenset({"appName", "app_name", "code"}),
    "sponsor_no_access_title": _APP_PLACEHOLDERS,
    "sponsor_no_access_description": _APP_PLACEHOLDERS,
    "sponsor_base_access_title": _APP_PLACEHOLDERS,
    "sponsor_base_access_description": _APP_PLACEHOLDERS,
    "sponsor_choose_action": _APP_PLACEHOLDERS,
}

_TELEGRAM_HTML_FIELDS = frozenset({"welcome_text", "bot_invite_required"})
_FORMATTED_FIELDS: dict[str, int] = {
    "onboarding_invite_description": 500,
    "onboarding_open_description": 500,
    "invite_description": 500,
    "sponsor_no_access_description": 500,
    "sponsor_base_access_description": 500,
}


def operator_content_template_variables() -> dict[str, list[str]]:
    """Return canonical template names for the admin authoring UI."""

    return {
        to_camel(field_name): list(
            _CANONICAL_PLACEHOLDERS.get(
                field_name,
                ("appName",) if allowed else (),
            )
        )
        for field_name, allowed in _ALLOWED_PLACEHOLDERS.items()
        if allowed
    }


class OperatorContentLocale(CamelModel):
    """One locale of operator content; missing values use product locale fallbacks."""

    welcome_text: str | None = Field(default=None, max_length=4_000)
    welcome_button_text: str | None = Field(default=None, max_length=100)
    bot_invite_required: str | None = Field(default=None, max_length=4_000)
    onboarding_invite_title: str | None = Field(default=None, max_length=120)
    onboarding_invite_description: str | None = Field(default=None, max_length=4_000)
    onboarding_open_title: str | None = Field(default=None, max_length=120)
    onboarding_open_description: str | None = Field(default=None, max_length=4_000)
    onboarding_redeem_action: str | None = Field(default=None, max_length=80)
    onboarding_register_action: str | None = Field(default=None, max_length=80)
    invite_title: str | None = Field(default=None, max_length=120)
    invite_description: str | None = Field(default=None, max_length=4_000)
    invite_share_text: str | None = Field(default=None, max_length=500)
    sponsor_no_access_title: str | None = Field(default=None, max_length=120)
    sponsor_no_access_description: str | None = Field(default=None, max_length=4_000)
    sponsor_base_access_title: str | None = Field(default=None, max_length=120)
    sponsor_base_access_description: str | None = Field(default=None, max_length=4_000)
    sponsor_choose_action: str | None = Field(default=None, max_length=100)

    @field_validator("*", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.replace("\r\n", "\n").replace("\r", "\n").strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_placeholders(self) -> Self:
        for field_name, allowed in _ALLOWED_PLACEHOLDERS.items():
            value = getattr(self, field_name)
            if value is None:
                continue
            unknown = placeholders(value) - allowed
            if unknown:
                names = ", ".join(sorted(unknown))
                raise ValueError(f"Unsupported placeholders for {field_name}: {names}")
        for field_name in _TELEGRAM_HTML_FIELDS:
            value = getattr(self, field_name)
            if value is None:
                continue
            normalized = normalize_telegram_html(value)
            expanded = render_placeholders(
                normalized,
                {"appName": "X" * 100, "app_name": "X" * 100},
            )
            if len(telegram_html_visible_text(expanded)) > 1_024:
                raise ValueError(f"{field_name} exceeds Telegram's media caption limit")
            setattr(self, field_name, normalized)
        for field_name, max_visible in _FORMATTED_FIELDS.items():
            value = getattr(self, field_name)
            if value is None:
                continue
            normalized = normalize_formatted_text(value)
            if formatted_text_visible_length(normalized) > max_visible:
                raise ValueError(f"{field_name} exceeds {max_visible} visible characters")
            setattr(self, field_name, normalized)
        return self


__all__ = ["OperatorContentLocale", "operator_content_template_variables"]
