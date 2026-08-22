"""Native Telegram prepared invite-share contract tests."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.exceptions import TelegramAPIError
from aiogram.types import InlineQueryResultArticle, InlineQueryResultCachedVideo

from flowvy.services.invite_share import InviteShareService, InviteShareUnavailableError


def _settings(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "app_name": "Flowvy & Friends",
        "content_default_locale": "en",
        "content_locales": {
            "en": {
                "invite_share_text": "Join <b>{{appName}}</b> with <code>{{code}}</code>",
                "invite_share_button_text": "Open {{appName}}",
            }
        },
        "invite_share_media_type": None,
        "invite_share_media_file_id": None,
        "invite_share_preview_mode": "small",
        "invite_share_allow_user_chats": True,
        "invite_share_allow_bot_chats": False,
        "invite_share_allow_group_chats": True,
        "invite_share_allow_channel_chats": False,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.mark.asyncio
async def test_prepares_html_article_with_referral_preview_and_fixed_button() -> None:
    bot = AsyncMock()
    expiration = datetime(2026, 8, 22, 12, tzinfo=UTC)
    bot.save_prepared_inline_message.return_value = SimpleNamespace(
        id="prepared-123",
        expiration_date=expiration,
    )
    repo = AsyncMock()
    repo.get.return_value = _settings()

    result = await InviteShareService(bot, repo).prepare(
        telegram_id=123,
        locale="en-US",
        invite_code="FVY-2345",
        referral_url="https://t.me/flowvy_testBot?start=ref_FVY2345",
    )

    assert result.id == "prepared-123"
    assert result.expiration_date == expiration
    call = bot.save_prepared_inline_message.await_args.kwargs
    assert call["user_id"] == 123
    assert call["allow_user_chats"] is True
    assert call["allow_bot_chats"] is False
    assert call["allow_group_chats"] is True
    assert call["allow_channel_chats"] is False
    assert call["request_timeout"] == 10
    prepared = call["result"]
    assert isinstance(prepared, InlineQueryResultArticle)
    assert prepared.input_message_content.message_text == (
        "Join <b>Flowvy &amp; Friends</b> with <code>FVY-2345</code>"
    )
    assert prepared.input_message_content.link_preview_options.url.endswith("ref_FVY2345")
    assert prepared.input_message_content.link_preview_options.prefer_small_media is True
    button = prepared.reply_markup.inline_keyboard[0][0]
    assert button.text == "Open Flowvy & Friends"
    assert button.url.endswith("ref_FVY2345")


@pytest.mark.asyncio
async def test_prepares_cached_video_without_separate_link_preview() -> None:
    bot = AsyncMock()
    bot.save_prepared_inline_message.return_value = SimpleNamespace(
        id="prepared-video",
        expiration_date=datetime(2026, 8, 22, 12, tzinfo=UTC),
    )
    repo = AsyncMock()
    repo.get.return_value = _settings(
        invite_share_media_type="video",
        invite_share_media_file_id="telegram-video-id",
    )

    await InviteShareService(bot, repo).prepare(
        telegram_id=123,
        locale="en",
        invite_code="FVY-2345",
        referral_url="https://t.me/flowvy_testBot?start=ref_FVY2345",
    )

    prepared = bot.save_prepared_inline_message.await_args.kwargs["result"]
    assert isinstance(prepared, InlineQueryResultCachedVideo)
    assert prepared.video_file_id == "telegram-video-id"
    assert prepared.input_message_content is None


@pytest.mark.asyncio
async def test_provider_failure_is_mapped_without_exposing_detail() -> None:
    bot = AsyncMock()
    bot.save_prepared_inline_message.side_effect = TelegramAPIError(
        MagicMock(),
        "private provider detail",
    )
    repo = AsyncMock()
    repo.get.return_value = _settings()

    with pytest.raises(InviteShareUnavailableError) as exc_info:
        await InviteShareService(bot, repo).prepare(
            telegram_id=123,
            locale="en",
            invite_code="FVY-2345",
            referral_url="https://t.me/flowvy_testBot?start=ref_FVY2345",
        )

    assert "private provider detail" not in str(exc_info.value)
