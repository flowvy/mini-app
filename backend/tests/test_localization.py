"""Locale normalization, fallback, and product-copy contracts."""

from __future__ import annotations

import pytest

from flowvy.localization import (
    locale_from_accept_language,
    normalize_locale_map,
    product_text,
    render_placeholders,
    resolve_locale_map,
)
from flowvy.schemas.operator_content import OperatorContentLocale


def test_accept_language_uses_first_valid_bounded_language_range() -> None:
    assert locale_from_accept_language("ru-RU;q=0.9,en;q=0.8") == "ru-ru"
    assert locale_from_accept_language("*;q=1, invalid locale, en-US") == "en-us"
    assert locale_from_accept_language(None) == "en"


def test_locale_map_resolves_exact_base_default_then_english() -> None:
    localized = normalize_locale_map(
        {
            "en": {"inviteTitle": "Invite friends"},
            "ru": {"inviteTitle": "Позвать друзей"},
        },
        OperatorContentLocale,
    )

    exact = resolve_locale_map(localized, OperatorContentLocale, "ru-RU", "en")
    fallback = resolve_locale_map(localized, OperatorContentLocale, "de-DE", "en")

    assert exact is not None and exact.invite_title == "Позвать друзей"
    assert fallback is not None and fallback.invite_title == "Invite friends"


def test_locale_map_normalizes_tags_and_rejects_collisions() -> None:
    with pytest.raises(ValueError, match="Duplicate normalized locale"):
        normalize_locale_map(
            {
                "en-US": {"inviteTitle": "Invite"},
                "en_us": {"inviteTitle": "Share"},
            },
            OperatorContentLocale,
        )


def test_product_copy_and_bounded_placeholder_rendering_use_locale_catalog() -> None:
    template = product_text("unknown", "welcome.button")

    assert render_placeholders(template, {"appName": "Acme", "app_name": "Acme"}) == "Open Acme"


def test_russian_product_copy_uses_exact_then_base_locale_catalog() -> None:
    template = product_text("ru-RU", "welcome.button")

    assert render_placeholders(template, {"appName": "Acme", "app_name": "Acme"}) == "Открыть Acme"
    assert product_text("ru", "supportNotifications.manyAttachments") == "📎 Файлы: {{count}}"
