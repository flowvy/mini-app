"""Shared contracts for administrator-authored formatted text."""

from __future__ import annotations

import re

_LINK_RE = re.compile(r"\[([^\]]+)\]\([^\s)]+(?:\s+\"[^\"]*\")?\)")
_LIST_PREFIX_RE = re.compile(r"(?m)^\s*(?:[-+*]|\d+[.)])\s+")
_BLOCKQUOTE_PREFIX_RE = re.compile(r"(?m)^\s*>\s?")
_MARK_RE = re.compile(r"[*_~`]")


def normalize_formatted_text(value: str) -> str:
    """Preserve CommonMark structure while normalizing transport line endings."""

    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def formatted_text_visible_length(value: str) -> int:
    """Count visible text for Flowvy's small editor-generated CommonMark subset."""

    normalized = normalize_formatted_text(value)
    visible = _LINK_RE.sub(r"\1", normalized)
    visible = _LIST_PREFIX_RE.sub("", visible)
    visible = _BLOCKQUOTE_PREFIX_RE.sub("", visible)
    visible = _MARK_RE.sub("", visible)
    return len(visible)


__all__ = ["formatted_text_visible_length", "normalize_formatted_text"]
