"""Message template registry with default values."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

_PLACEHOLDER_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


@dataclass(frozen=True, slots=True)
class MessageTemplate:
    """Immutable message template descriptor."""

    text: str
    media_url: str | None = None
    media_type: str | None = None
    media_path: Path | None = None
    button_text: str | None = None


DEFAULTS: dict[str, MessageTemplate] = {
    "welcome": MessageTemplate(
        text="Welcome! \U0001f4f1\nManage your service directly in Telegram.",
        media_path=ASSETS_DIR / "main_card.mp4",
        media_type="animation",
        button_text="\U0001f680 Open {{ app_name }}",
    ),
}


def render(template_str: str, context: dict[str, str]) -> str:
    """Replace ``{{ key }}`` placeholders with *context* values.

    Unknown keys are left as-is.
    """

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        return context.get(key, match.group(0))

    return _PLACEHOLDER_RE.sub(_replace, template_str)
