"""Universal message sender via Telegram Bot API."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import (
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from redis.asyncio import Redis

from flowvy.config import Settings
from flowvy.models.provider_settings import ProviderSettings

logger = logging.getLogger(__name__)

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
FILE_ID_PREFIX = "bot:file_id:"


@dataclass(frozen=True, slots=True)
class InlineButton:
    """Inline keyboard button descriptor."""

    text: str
    url: str | None = None
    web_app_url: str | None = None


class MessageSender:
    """Universal message sender with media support and file_id caching."""

    def __init__(self, bot: Bot, redis: Redis) -> None:
        self._bot = bot
        self._redis = redis

    async def send(
        self,
        chat_id: int,
        text: str,
        media_url: str | None = None,
        media_type: str | None = None,
        media_path: Path | None = None,
        buttons: list[InlineButton] | None = None,
    ) -> Message | None:
        """Send message. On Telegram error (blocked, not found) — log, return None."""
        reply_markup = self._build_keyboard(buttons) if buttons else None
        media = None
        if media_path:
            media = await self._resolve_media(media_path)
        elif media_url:
            media = media_url

        try:
            if media_type == "animation" and media is not None:
                result = await self._bot.send_animation(
                    chat_id=chat_id,
                    animation=media,
                    caption=text,
                    reply_markup=reply_markup,
                )
                if media_path and isinstance(media, FSInputFile) and result.animation:
                    await self._cache_file_id(media_path, result.animation.file_id)
                return result
            if media_type == "photo" and media is not None:
                result = await self._bot.send_photo(
                    chat_id=chat_id,
                    photo=media,
                    caption=text,
                    reply_markup=reply_markup,
                )
                if media_path and isinstance(media, FSInputFile) and result.photo:
                    await self._cache_file_id(media_path, result.photo[-1].file_id)
                return result
            return await self._bot.send_message(
                chat_id=chat_id,
                text=text,
                reply_markup=reply_markup,
            )
        except TelegramAPIError:
            logger.exception("Failed to send message to chat_id=%d", chat_id)
            return None

    async def send_welcome(
        self,
        chat_id: int,
        settings: Settings,
        provider_settings: ProviderSettings | None = None,
    ) -> Message | None:
        """Send welcome message with default template."""
        app_name = "Flowvy"
        if provider_settings and provider_settings.app_name:
            app_name = provider_settings.app_name

        text = "Welcome! \U0001f4f1\nManage your service directly in Telegram."

        if not settings.webapp_url:
            return await self.send(chat_id=chat_id, text=text)

        button = InlineButton(
            text=f"\U0001f680 Open {app_name}",
            web_app_url=settings.webapp_url,
        )
        media_path = ASSETS_DIR / "main_card.mp4"
        return await self.send(
            chat_id=chat_id,
            text=text,
            media_path=media_path,
            media_type="animation",
            buttons=[button],
        )

    def _build_keyboard(
        self,
        buttons: list[InlineButton],
    ) -> InlineKeyboardMarkup:
        """Build inline keyboard from button descriptors."""
        rows: list[list[InlineKeyboardButton]] = []
        for btn in buttons:
            if btn.web_app_url:
                rows.append(
                    [
                        InlineKeyboardButton(
                            text=btn.text,
                            web_app=WebAppInfo(url=btn.web_app_url),
                        )
                    ]
                )
            elif btn.url:
                rows.append([InlineKeyboardButton(text=btn.text, url=btn.url)])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    async def _resolve_media(self, media_path: Path) -> str | FSInputFile:
        """Return cached file_id or FSInputFile for upload."""
        cache_key = self._file_id_key(media_path)
        cached = await self._redis.get(cache_key)
        if cached:
            return cached.decode()
        return FSInputFile(media_path)

    async def _cache_file_id(self, media_path: Path, file_id: str) -> None:
        """Cache file_id in Redis for future sends."""
        cache_key = self._file_id_key(media_path)
        await self._redis.set(cache_key, file_id)

    @staticmethod
    def _file_id_key(media_path: Path) -> str:
        """Generate Redis key for file_id cache."""
        path_hash = hashlib.md5(
            str(media_path).encode(),
            usedforsecurity=False,
        ).hexdigest()
        return f"{FILE_ID_PREFIX}{path_hash}"
