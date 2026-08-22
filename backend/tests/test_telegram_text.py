"""Operator-authored Telegram HTML contract tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from flowvy.schemas.operator_content import (
    OperatorContentLocale,
    operator_content_template_variables,
)
from flowvy.telegram_text import TelegramHtmlError, telegram_html_visible_text


def test_telegram_html_accepts_supported_formatting_and_custom_emoji() -> None:
    source = (
        '<b>Hello</b> <tg-emoji emoji-id="5368324170671202286">👍</tg-emoji> '
        '<a href="https://example.test/help">help</a>'
    )

    assert telegram_html_visible_text(source) == "Hello 👍 help"


@pytest.mark.parametrize(
    "source",
    [
        "<script>alert(1)</script>",
        '<a href="javascript:alert(1)">bad</a>',
        '<tg-emoji emoji-id="not-a-number">✨</tg-emoji>',
        '<tg-emoji emoji-id="123"></tg-emoji>',
        '<tg-emoji emoji-id="123">fallback</tg-emoji>',
        "<b>unclosed",
    ],
)
def test_telegram_html_rejects_unsupported_or_malformed_markup(source: str) -> None:
    with pytest.raises(TelegramHtmlError):
        telegram_html_visible_text(source)


def test_operator_content_enforces_caption_limit_after_worst_case_template_render() -> None:
    with pytest.raises(ValidationError, match="media caption limit"):
        OperatorContentLocale(welcome_text=("A" * 930) + "{{appName}}")


def test_operator_content_exposes_canonical_template_variables_for_admin() -> None:
    capabilities = operator_content_template_variables()

    assert capabilities["welcomeText"] == ["appName"]
    assert capabilities["inviteShareText"] == ["appName", "code"]
    assert "app_name" not in capabilities["welcomeText"]


def test_operator_commonmark_copy_preserves_formatting_with_visible_limit() -> None:
    content = OperatorContentLocale(
        invite_description="**Join {{appName}}**\n\n- Copy code\n- Share",
    )

    assert content.invite_description == "**Join {{appName}}**\n\n- Copy code\n- Share"
