"""Shared contracts for administrator-authored formatted text."""

from __future__ import annotations


def normalize_formatted_text(value: str) -> str:
    """Preserve CommonMark structure while normalizing transport line endings."""

    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


__all__ = ["normalize_formatted_text"]
