"""Validation helpers for the deliberately small Telegram HTML authoring contract."""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit


class TelegramHtmlError(ValueError):
    """Raised when operator-authored Telegram HTML is outside the supported subset."""


_SIMPLE_TAGS = frozenset(
    {
        "b",
        "strong",
        "i",
        "em",
        "u",
        "ins",
        "s",
        "strike",
        "del",
        "tg-spoiler",
        "code",
        "pre",
    }
)
_SUPPORTED_TAGS = _SIMPLE_TAGS | {"a", "blockquote", "tg-emoji"}
_SAFE_LINK_SCHEMES = frozenset({"http", "https", "tg"})
_EMOJI_RE = re.compile(
    "[\U0001f000-\U0001faff\U00002600-\U000027bf\U0000231a-\U000023f3\U00002b00-\U00002bff]"
)


class _TelegramHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.stack: list[tuple[str, int]] = []
        self.visible: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in _SUPPORTED_TAGS:
            raise TelegramHtmlError(f"Unsupported Telegram HTML tag: {tag}")
        if self.stack and self.stack[-1][0] == "tg-emoji":
            raise TelegramHtmlError("Custom emoji fallback cannot contain markup")

        attributes = dict(attrs)
        if len(attributes) != len(attrs):
            raise TelegramHtmlError(f"Duplicate attribute on <{tag}>")
        if tag in _SIMPLE_TAGS and attributes:
            raise TelegramHtmlError(f"Attributes are not supported on <{tag}>")
        if tag == "a":
            if set(attributes) != {"href"} or not attributes["href"]:
                raise TelegramHtmlError("Telegram links require one href attribute")
            href = html.unescape(attributes["href"] or "").strip()
            if urlsplit(href).scheme.lower() not in _SAFE_LINK_SCHEMES:
                raise TelegramHtmlError("Telegram links must use http, https, or tg")
        if tag == "blockquote":
            if set(attributes) - {"expandable"}:
                raise TelegramHtmlError("Unsupported blockquote attribute")
            if "expandable" in attributes and attributes["expandable"] not in {None, ""}:
                raise TelegramHtmlError("blockquote expandable does not accept a value")
        if tag == "tg-emoji":
            emoji_id = attributes.get("emoji-id")
            if set(attributes) != {"emoji-id"} or not emoji_id or not emoji_id.isdigit():
                raise TelegramHtmlError("Custom emoji require a numeric emoji-id")
            if len(emoji_id) > 32:
                raise TelegramHtmlError("Custom emoji ID is too long")
        self.stack.append((tag, len("".join(self.visible))))

    def handle_endtag(self, tag: str) -> None:
        if not self.stack or self.stack[-1][0] != tag:
            raise TelegramHtmlError(f"Unbalanced Telegram HTML closing tag: {tag}")
        opened_tag, visible_start = self.stack.pop()
        if opened_tag == "tg-emoji":
            fallback = "".join(self.visible)[visible_start:]
            if not fallback or len(fallback) > 8 or _EMOJI_RE.search(fallback) is None:
                raise TelegramHtmlError("Custom emoji require valid fallback emoji text")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        raise TelegramHtmlError(f"Self-closing Telegram HTML tag is not supported: {tag}")

    def handle_data(self, data: str) -> None:
        self.visible.append(data)

    def handle_entityref(self, name: str) -> None:
        if name not in {"lt", "gt", "amp", "quot"}:
            raise TelegramHtmlError(f"Unsupported HTML entity: &{name};")
        self.visible.append(html.unescape(f"&{name};"))

    def handle_charref(self, name: str) -> None:
        try:
            self.visible.append(html.unescape(f"&#{name};"))
        except ValueError as exc:
            raise TelegramHtmlError("Invalid numeric HTML entity") from exc

    def handle_comment(self, data: str) -> None:
        raise TelegramHtmlError("HTML comments are not supported")

    def handle_decl(self, decl: str) -> None:
        raise TelegramHtmlError("HTML declarations are not supported")

    def unknown_decl(self, data: str) -> None:
        raise TelegramHtmlError("HTML declarations are not supported")

    def finish(self) -> str:
        if self.stack:
            raise TelegramHtmlError(f"Unclosed Telegram HTML tag: {self.stack[-1][0]}")
        return "".join(self.visible)


def telegram_html_visible_text(value: str) -> str:
    """Validate Telegram HTML and return its user-visible fallback text."""

    parser = _TelegramHtmlParser()
    try:
        parser.feed(value)
        parser.close()
    except TelegramHtmlError:
        raise
    except Exception as exc:
        raise TelegramHtmlError("Invalid Telegram HTML") from exc
    return parser.finish()


def normalize_telegram_html(value: str) -> str:
    """Normalize line endings and validate the supported Telegram HTML subset."""

    normalized = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    telegram_html_visible_text(normalized)
    return normalized


__all__ = [
    "TelegramHtmlError",
    "normalize_telegram_html",
    "telegram_html_visible_text",
]
