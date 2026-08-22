"""Universal message sender via Telegram Bot API."""

from __future__ import annotations

import hashlib
import html
import logging
from dataclasses import dataclass, replace
from pathlib import Path

from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import (
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from redis.asyncio import Redis

from flowvy.bot.templates import MessageTemplate, default_template, render
from flowvy.config import Settings
from flowvy.localization import product_text
from flowvy.models.provider_settings import ProviderSettings
from flowvy.services.operator_content import resolve_operator_content

logger = logging.getLogger(__name__)

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
        media_file_id: str | None = None,
        buttons: list[InlineButton] | None = None,
    ) -> Message | None:
        """Send message. On Telegram error (blocked, not found) — log, return None."""
        reply_markup = self._build_keyboard(buttons) if buttons else None
        media = None
        if media_file_id:
            media = media_file_id
        elif media_path:
            media = await self._resolve_media(media_path)
        elif media_url:
            media = media_url

        try:
            if media_type == "animation" and media is not None:
                result = await self._bot.send_animation(
                    chat_id=chat_id,
                    animation=media,
                    caption=text,
                    parse_mode=ParseMode.HTML,
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
                    parse_mode=ParseMode.HTML,
                    reply_markup=reply_markup,
                )
                if media_path and isinstance(media, FSInputFile) and result.photo:
                    await self._cache_file_id(media_path, result.photo[-1].file_id)
                return result
            return await self._bot.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode=ParseMode.HTML,
                reply_markup=reply_markup,
            )
        except TelegramBadRequest as exc:
            if media is not None and media_type in {"animation", "photo"}:
                logger.warning(
                    "Telegram rejected %s media; retrying without media: %s",
                    media_type,
                    exc,
                )
                try:
                    return await self._bot.send_message(
                        chat_id=chat_id,
                        text=text,
                        parse_mode=ParseMode.HTML,
                        reply_markup=reply_markup,
                    )
                except TelegramAPIError:
                    logger.exception("Failed to send Telegram media fallback")
                    return None
            logger.warning("Telegram rejected outgoing message: %s", exc)
            return None
        except TelegramAPIError:
            logger.exception("Failed to send Telegram message")
            return None

    async def send_welcome(
        self,
        chat_id: int,
        settings: Settings,
        provider_settings: ProviderSettings | None = None,
        locale: str | None = None,
    ) -> Message | None:
        """Send welcome message resolved from template + provider overrides."""
        tmpl = self.resolve_template("welcome", provider_settings, locale)
        app_name = product_text(locale, "common.appName")
        if provider_settings and provider_settings.app_name:
            app_name = provider_settings.app_name
        html_app_name = html.escape(app_name)
        text = render(tmpl.text, {"appName": html_app_name, "app_name": html_app_name})

        if not settings.webapp_url:
            return await self.send(chat_id=chat_id, text=text)

        button_text = (
            render(tmpl.button_text, {"appName": app_name, "app_name": app_name})
            if tmpl.button_text
            else None
        )
        buttons = (
            [InlineButton(text=button_text, web_app_url=settings.webapp_url)]
            if button_text
            else None
        )
        return await self.send(
            chat_id=chat_id,
            text=text,
            media_url=tmpl.media_url,
            media_path=tmpl.media_path,
            media_file_id=tmpl.media_file_id,
            media_type=tmpl.media_type,
            buttons=buttons,
        )

    async def send_invite_required(
        self,
        chat_id: int,
        provider_settings: ProviderSettings | None = None,
        locale: str | None = None,
    ) -> Message | None:
        """Send the locale-resolved invite prompt with optional provider media."""

        app_name = product_text(locale, "common.appName")
        template = html.escape(product_text(locale, "registration.inviteRequired"))
        media_type = None
        media_file_id = None
        if provider_settings is not None:
            if provider_settings.app_name:
                app_name = provider_settings.app_name
            content = resolve_operator_content(provider_settings, locale)
            if content.bot_invite_required:
                template = content.bot_invite_required
            media_type = getattr(provider_settings, "bot_invite_media_type", None)
            media_file_id = getattr(provider_settings, "bot_invite_media_file_id", None)
        escaped_name = html.escape(app_name)
        text = render(template, {"appName": escaped_name, "app_name": escaped_name})
        return await self.send(
            chat_id=chat_id,
            text=text,
            media_type=media_type,
            media_file_id=media_file_id,
        )

    @staticmethod
    def resolve_template(
        name: str,
        provider_settings: ProviderSettings | None,
        locale: str | None = None,
    ) -> MessageTemplate:
        """Resolve template: DEFAULTS base + provider_settings overrides."""
        base = default_template(name, locale)
        if provider_settings is None:
            return base

        overrides: dict[str, object] = {}
        content = resolve_operator_content(provider_settings, locale)
        welcome_text = content.welcome_text or provider_settings.welcome_text
        welcome_button_text = content.welcome_button_text or provider_settings.welcome_button_text
        if welcome_text is not None:
            overrides["text"] = welcome_text
        if provider_settings.welcome_media_file_id is not None:
            overrides["media_file_id"] = provider_settings.welcome_media_file_id
            overrides["media_url"] = None
            overrides["media_path"] = None
        elif provider_settings.welcome_media_url is not None:
            overrides["media_url"] = provider_settings.welcome_media_url
            overrides["media_path"] = None
        if provider_settings.welcome_media_type is not None:
            overrides["media_type"] = provider_settings.welcome_media_type
        if welcome_button_text is not None:
            overrides["button_text"] = welcome_button_text

        if not overrides:
            return base
        return replace(base, **overrides)

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
