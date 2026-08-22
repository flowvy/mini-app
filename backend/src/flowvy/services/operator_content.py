"""Resolve allow-listed operator content for one requested locale."""

from __future__ import annotations

from flowvy.localization import DEFAULT_LOCALE, resolve_locale_map
from flowvy.models.provider_settings import ProviderSettings
from flowvy.schemas.operator_content import OperatorContentLocale


def resolve_operator_content(
    settings: ProviderSettings,
    locale: str | None,
) -> OperatorContentLocale:
    """Return one public content bundle with exact/base/default locale fallback."""

    raw_locales = getattr(settings, "content_locales", {})
    if not isinstance(raw_locales, dict):
        raw_locales = {}
    default_locale = getattr(settings, "content_default_locale", DEFAULT_LOCALE)
    if not isinstance(default_locale, str):
        default_locale = DEFAULT_LOCALE
    return (
        resolve_locale_map(
            raw_locales,
            OperatorContentLocale,
            locale,
            default_locale,
        )
        or OperatorContentLocale()
    )


__all__ = ["resolve_operator_content"]
