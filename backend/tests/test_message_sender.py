"""Tests for MessageSender service."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import FSInputFile

from flowvy.bot.templates import ASSETS_DIR
from flowvy.config import Settings
from flowvy.services.message_sender import InlineButton, MessageSender


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
    """Mock Redis client with no cached values."""
    mock = AsyncMock()
    mock.get.return_value = None
    return mock


@pytest.fixture
def sender(bot: AsyncMock, redis: AsyncMock) -> MessageSender:
    """Create MessageSender with mocked dependencies."""
    return MessageSender(bot, redis)


async def test_send_text_only(sender: MessageSender, bot: AsyncMock) -> None:
    """Text-only message calls bot.send_message."""
    result = await sender.send(chat_id=123, text="Hello")
    bot.send_message.assert_called_once()
    kw = bot.send_message.call_args.kwargs
    assert kw["chat_id"] == 123
    assert kw["text"] == "Hello"
    assert kw["reply_markup"] is None
    assert result is not None


async def test_send_animation_url(sender: MessageSender, bot: AsyncMock) -> None:
    """Animation URL calls bot.send_animation with caption."""
    await sender.send(
        chat_id=123,
        text="Caption",
        media_url="https://example.com/video.mp4",
        media_type="animation",
    )
    bot.send_animation.assert_called_once()
    kw = bot.send_animation.call_args.kwargs
    assert kw["animation"] == "https://example.com/video.mp4"
    assert kw["caption"] == "Caption"


async def test_send_photo_url(sender: MessageSender, bot: AsyncMock) -> None:
    """Photo URL calls bot.send_photo with caption."""
    await sender.send(
        chat_id=123,
        text="Caption",
        media_url="https://example.com/photo.jpg",
        media_type="photo",
    )
    bot.send_photo.assert_called_once()
    kw = bot.send_photo.call_args.kwargs
    assert kw["photo"] == "https://example.com/photo.jpg"
    assert kw["caption"] == "Caption"


async def test_send_with_buttons(sender: MessageSender, bot: AsyncMock) -> None:
    """Buttons are built into InlineKeyboardMarkup."""
    buttons = [
        InlineButton(text="Open", web_app_url="https://app.example.com"),
        InlineButton(text="Visit", url="https://example.com"),
    ]
    await sender.send(chat_id=123, text="Hello", buttons=buttons)
    kw = bot.send_message.call_args.kwargs
    markup = kw["reply_markup"]
    assert len(markup.inline_keyboard) == 2
    assert markup.inline_keyboard[0][0].web_app is not None
    assert markup.inline_keyboard[1][0].url == "https://example.com"


async def test_send_error_returns_none(sender: MessageSender, bot: AsyncMock) -> None:
    """Telegram API error is caught — returns None, does not raise."""
    bot.send_message.side_effect = TelegramForbiddenError(
        method=MagicMock(), message="Forbidden: bot was blocked by the user"
    )
    result = await sender.send(chat_id=123, text="Hello")
    assert result is None


async def test_invalid_media_falls_back_to_text(
    sender: MessageSender,
    bot: AsyncMock,
) -> None:
    """A rejected media attachment must not suppress the welcome message."""
    bot.send_animation.side_effect = TelegramBadRequest(
        method=MagicMock(),
        message="Bad Request: DOCUMENT_INVALID",
    )

    result = await sender.send(
        chat_id=123,
        text="Welcome",
        media_url="https://example.com/invalid.mp4",
        media_type="animation",
        buttons=[InlineButton(text="Open", web_app_url="https://app.example.com")],
    )

    assert result is not None
    bot.send_message.assert_awaited_once()
    fallback = bot.send_message.call_args.kwargs
    assert fallback["text"] == "Welcome"
    assert fallback["reply_markup"].inline_keyboard[0][0].web_app is not None


async def test_send_welcome_with_webapp(sender: MessageSender, bot: AsyncMock) -> None:
    """Welcome with webapp_url sends animation + web_app button."""
    settings = Settings(webapp_url="https://app.example.com")
    await sender.send_welcome(chat_id=123, settings=settings)
    bot.send_animation.assert_called_once()
    kw = bot.send_animation.call_args.kwargs
    assert "Welcome" in kw["caption"]
    markup = kw["reply_markup"]
    assert "Flowvy" in markup.inline_keyboard[0][0].text


async def test_send_welcome_custom_app_name(sender: MessageSender, bot: AsyncMock) -> None:
    """Welcome uses app_name from provider_settings."""
    settings = Settings(webapp_url="https://app.example.com")
    ps = MagicMock()
    ps.app_name = "MyVPN"
    ps.welcome_text = None
    ps.welcome_media_url = None
    ps.welcome_media_type = None
    ps.welcome_media_file_id = None
    ps.welcome_button_text = None
    await sender.send_welcome(chat_id=123, settings=settings, provider_settings=ps)
    bot.send_animation.assert_called_once()
    markup = bot.send_animation.call_args.kwargs["reply_markup"]
    assert "MyVPN" in markup.inline_keyboard[0][0].text


async def test_send_welcome_escapes_template_values_but_preserves_html(
    sender: MessageSender,
    bot: AsyncMock,
) -> None:
    settings = Settings(webapp_url="https://app.example.com")
    ps = SimpleNamespace(
        app_name="Shop & <Co>",
        content_default_locale="en",
        content_locales={
            "en": {
                "welcome_text": "<b>Hello {{appName}}</b>",
                "welcome_button_text": "Open {{appName}}",
            }
        },
        welcome_text=None,
        welcome_media_url=None,
        welcome_media_type=None,
        welcome_media_file_id=None,
        welcome_button_text=None,
    )

    await sender.send_welcome(123, settings, ps)

    sent = bot.send_animation.call_args.kwargs
    assert sent["caption"] == "<b>Hello Shop &amp; &lt;Co&gt;</b>"
    assert sent["parse_mode"] == ParseMode.HTML
    assert sent["reply_markup"].inline_keyboard[0][0].text == "Open Shop & <Co>"


async def test_send_invite_required_supports_html_custom_emoji_and_media(
    sender: MessageSender,
    bot: AsyncMock,
) -> None:
    ps = SimpleNamespace(
        app_name="Shop & Co",
        content_default_locale="en",
        content_locales={
            "en": {
                "bot_invite_required": (
                    "<b>Join {{appName}}</b> "
                    '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>'
                )
            }
        },
        bot_invite_media_type="photo",
        bot_invite_media_file_id="invite-photo-id",
    )

    await sender.send_invite_required(123, ps, "en-US")

    sent = bot.send_photo.call_args.kwargs
    assert sent["photo"] == "invite-photo-id"
    assert sent["caption"] == (
        '<b>Join Shop &amp; Co</b> <tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>'
    )
    assert sent["parse_mode"] == ParseMode.HTML


async def test_send_welcome_uses_operator_content_for_requested_locale(
    sender: MessageSender,
    bot: AsyncMock,
) -> None:
    settings = Settings(webapp_url="https://app.example.com")
    ps = MagicMock()
    ps.app_name = "MyVPN"
    ps.content_default_locale = "en"
    ps.content_locales = {
        "en": {"welcome_text": "Hello {{appName}}", "welcome_button_text": "Open"},
        "ru": {"welcome_text": "Привет, {{appName}}", "welcome_button_text": "Открыть"},
    }
    ps.welcome_text = None
    ps.welcome_media_url = None
    ps.welcome_media_type = None
    ps.welcome_media_file_id = None
    ps.welcome_button_text = None

    await sender.send_welcome(
        chat_id=123,
        settings=settings,
        provider_settings=ps,
        locale="ru-RU",
    )

    sent = bot.send_animation.call_args.kwargs
    assert sent["caption"] == "Привет, MyVPN"
    assert sent["reply_markup"].inline_keyboard[0][0].text == "Открыть"


async def test_send_welcome_no_webapp_url(sender: MessageSender, bot: AsyncMock) -> None:
    """Welcome without webapp_url sends text-only message."""
    settings = Settings(webapp_url="")
    await sender.send_welcome(chat_id=123, settings=settings)
    bot.send_message.assert_called_once()
    bot.send_animation.assert_not_called()


async def test_file_id_cached_after_upload(
    sender: MessageSender, bot: AsyncMock, redis: AsyncMock
) -> None:
    """After FSInputFile upload, file_id is cached in Redis."""
    path = ASSETS_DIR / "main_card.mp4"
    redis.get.return_value = None
    await sender.send(chat_id=123, text="Test", media_path=path, media_type="animation")
    anim_arg = bot.send_animation.call_args.kwargs["animation"]
    assert isinstance(anim_arg, FSInputFile)
    redis.set.assert_called_once()
    cached_value = redis.set.call_args.args[1]
    assert cached_value == "anim_file_id_123"


async def test_file_id_used_from_cache(
    sender: MessageSender, bot: AsyncMock, redis: AsyncMock
) -> None:
    """Cached file_id is used instead of FSInputFile."""
    path = Path("/fake/path/video.mp4")
    redis.get.return_value = b"cached_anim_id"
    await sender.send(chat_id=123, text="Test", media_path=path, media_type="animation")
    anim_arg = bot.send_animation.call_args.kwargs["animation"]
    assert anim_arg == "cached_anim_id"
    redis.set.assert_not_called()
