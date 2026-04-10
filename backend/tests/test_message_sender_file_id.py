"""Tests for MessageSender file_id support."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from flowvy.config import Settings
from flowvy.services.message_sender import MessageSender


@pytest.fixture
def bot() -> AsyncMock:
    """Mock aiogram Bot with configured return values."""
    mock = AsyncMock()
    msg = MagicMock()
    msg.animation = MagicMock()
    msg.animation.file_id = "anim_file_id_123"
    photo_size = MagicMock()
    photo_size.file_id = "photo_file_id_123"
    msg.photo = [photo_size]
    mock.send_message.return_value = msg
    mock.send_animation.return_value = msg
    mock.send_photo.return_value = msg
    return mock


@pytest.fixture
def redis() -> AsyncMock:
    """Mock Redis client."""
    mock = AsyncMock()
    mock.get.return_value = None
    return mock


@pytest.fixture
def sender(bot: AsyncMock, redis: AsyncMock) -> MessageSender:
    """Create MessageSender with mocked dependencies."""
    return MessageSender(bot, redis)


async def test_send_with_file_id(sender: MessageSender, bot: AsyncMock) -> None:
    """media_file_id string is passed directly to bot.send_animation."""
    await sender.send(
        chat_id=123,
        text="Hi",
        media_file_id="fid_123",
        media_type="animation",
    )
    bot.send_animation.assert_called_once()
    assert bot.send_animation.call_args.kwargs["animation"] == "fid_123"


async def test_file_id_priority_over_url_and_path(
    sender: MessageSender,
    bot: AsyncMock,
) -> None:
    """media_file_id takes priority over media_url and media_path."""
    await sender.send(
        chat_id=123,
        text="Hi",
        media_file_id="fid_abc",
        media_url="https://example.com/v.mp4",
        media_path=Path("/fake.mp4"),
        media_type="animation",
    )
    assert bot.send_animation.call_args.kwargs["animation"] == "fid_abc"


async def test_send_welcome_with_file_id(
    sender: MessageSender,
    bot: AsyncMock,
) -> None:
    """PS with welcome_media_file_id sends file_id, not default media_path."""
    settings = Settings(webapp_url="https://app.example.com")
    ps = MagicMock(
        app_name=None,
        welcome_text=None,
        welcome_media_url=None,
        welcome_media_type="photo",
        welcome_media_file_id="fid_photo_999",
        welcome_button_text=None,
    )
    await sender.send_welcome(
        chat_id=123,
        settings=settings,
        provider_settings=ps,
    )
    bot.send_photo.assert_called_once()
    assert bot.send_photo.call_args.kwargs["photo"] == "fid_photo_999"


async def test_send_photo_with_file_id(
    sender: MessageSender,
    bot: AsyncMock,
) -> None:
    """media_file_id with type=photo calls bot.send_photo."""
    await sender.send(
        chat_id=123,
        text="Photo",
        media_file_id="fid_photo_abc",
        media_type="photo",
    )
    bot.send_photo.assert_called_once()
    assert bot.send_photo.call_args.kwargs["photo"] == "fid_photo_abc"
    bot.send_animation.assert_not_called()
