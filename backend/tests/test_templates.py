"""Tests for message template registry and resolve logic."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from flowvy.bot.templates import ASSETS_DIR, DEFAULTS, MessageTemplate, render
from flowvy.services.message_sender import MessageSender


def test_render_replaces_placeholders() -> None:
    """Placeholders like {{ key }} are replaced with context values."""
    result = render("Hello {{ name }}, welcome to {{ app }}!", {"name": "Alex", "app": "Flowvy"})
    assert result == "Hello Alex, welcome to Flowvy!"


def test_render_no_placeholders() -> None:
    """String without placeholders is returned as-is."""
    result = render("No placeholders here", {"key": "value"})
    assert result == "No placeholders here"


def test_render_missing_key_left_as_is() -> None:
    """Unknown placeholder keys are left unchanged."""
    result = render("Hello {{ unknown }}", {})
    assert result == "Hello {{ unknown }}"


def test_render_mixed_known_unknown() -> None:
    """Known keys are replaced, unknown left as-is."""
    result = render("{{ a }} and {{ b }}", {"a": "yes"})
    assert result == "yes and {{ b }}"


def test_render_no_spaces_in_braces() -> None:
    """Placeholders without spaces like {{key}} also work."""
    result = render("{{name}} here", {"name": "Bob"})
    assert result == "Bob here"


def test_defaults_has_welcome() -> None:
    """DEFAULTS registry contains a 'welcome' template with expected fields."""
    assert "welcome" in DEFAULTS
    tmpl = DEFAULTS["welcome"]
    assert isinstance(tmpl, MessageTemplate)
    assert "Welcome" in tmpl.text
    assert '<tg-emoji emoji-id="5262526163959453517">☺</tg-emoji>' in tmpl.text
    assert tmpl.media_path == ASSETS_DIR / "main_card.mp4"
    assert tmpl.media_type == "animation"
    assert tmpl.button_text is not None
    assert "{{ app_name }}" in tmpl.button_text


def test_resolve_template_returns_default() -> None:
    """Without provider_settings, resolve returns DEFAULTS unchanged."""
    result = MessageSender.resolve_template("welcome", None)
    assert result == DEFAULTS["welcome"]


def test_resolve_template_ps_no_overrides() -> None:
    """PS with all welcome fields None returns DEFAULTS."""
    ps = MagicMock()
    ps.welcome_text = None
    ps.welcome_media_url = None
    ps.welcome_media_type = None
    ps.welcome_media_file_id = None
    ps.welcome_button_text = None
    result = MessageSender.resolve_template("welcome", ps)
    assert result == DEFAULTS["welcome"]


def test_resolve_template_ps_override_text() -> None:
    """PS welcome_text overrides default text."""
    ps = MagicMock()
    ps.welcome_text = "Custom welcome!"
    ps.welcome_media_url = None
    ps.welcome_media_type = None
    ps.welcome_media_file_id = None
    ps.welcome_button_text = None
    result = MessageSender.resolve_template("welcome", ps)
    assert result.text == "Custom welcome!"
    assert result.media_path == DEFAULTS["welcome"].media_path


def test_resolve_template_ps_override_media_url() -> None:
    """PS welcome_media_url overrides media and clears media_path."""
    ps = MagicMock()
    ps.welcome_text = None
    ps.welcome_media_url = "https://example.com/video.mp4"
    ps.welcome_media_type = None
    ps.welcome_media_file_id = None
    ps.welcome_button_text = None
    result = MessageSender.resolve_template("welcome", ps)
    assert result.media_url == "https://example.com/video.mp4"
    assert result.media_path is None


def test_resolve_template_ps_override_button() -> None:
    """PS welcome_button_text overrides default button."""
    ps = MagicMock()
    ps.welcome_text = None
    ps.welcome_media_url = None
    ps.welcome_media_type = None
    ps.welcome_media_file_id = None
    ps.welcome_button_text = "Launch {{ app_name }}"
    result = MessageSender.resolve_template("welcome", ps)
    assert result.button_text == "Launch {{ app_name }}"


def test_resolve_template_ps_override_file_id() -> None:
    """PS welcome_media_file_id overrides media_url and media_path."""
    ps = MagicMock()
    ps.welcome_text = None
    ps.welcome_media_url = "https://example.com/old.mp4"
    ps.welcome_media_type = "animation"
    ps.welcome_media_file_id = "fid_custom_123"
    ps.welcome_button_text = None
    result = MessageSender.resolve_template("welcome", ps)
    assert result.media_file_id == "fid_custom_123"
    assert result.media_url is None
    assert result.media_path is None
    assert result.media_type == "animation"


def test_resolve_template_unknown_name_raises() -> None:
    """Unknown template name raises KeyError."""
    with pytest.raises(KeyError):
        MessageSender.resolve_template("nonexistent", None)
