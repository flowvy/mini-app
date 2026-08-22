"""Prepare one current user's invite as a native Telegram share message."""

from __future__ import annotations

import html

from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InlineQueryResultCachedGif,
    InlineQueryResultCachedPhoto,
    InlineQueryResultCachedVideo,
    InputTextMessageContent,
    LinkPreviewOptions,
)

from flowvy.localization import product_text, render_placeholders
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.registration import PreparedInviteShareResponse
from flowvy.services.operator_content import resolve_operator_content


class InviteShareUnavailableError(Exception):
    """Stable failure when Telegram cannot prepare the requested message."""


class InviteShareService:
    """Build allow-listed inline results and ask Telegram for a short-lived prepared ID."""

    def __init__(self, bot: Bot, settings: ProviderSettingsRepository) -> None:
        self._bot = bot
        self._settings = settings

    async def prepare(
        self,
        *,
        telegram_id: int,
        locale: str | None,
        invite_code: str,
        referral_url: str,
    ) -> PreparedInviteShareResponse:
        settings = await self._settings.get()
        content = resolve_operator_content(settings, locale)
        app_name = settings.app_name or product_text(locale, "common.appName")
        html_context = {
            "appName": html.escape(app_name),
            "app_name": html.escape(app_name),
            "code": html.escape(invite_code),
        }
        plain_context = {"appName": app_name, "app_name": app_name, "code": invite_code}
        message = render_placeholders(
            content.invite_share_text or product_text(locale, "inviteShare.text"),
            html_context,
        )
        button_text = render_placeholders(
            content.invite_share_button_text or product_text(locale, "inviteShare.button"),
            plain_context,
        )
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text=button_text, url=referral_url)]]
        )
        result = self._build_result(settings, message, referral_url, keyboard)
        try:
            prepared = await self._bot.save_prepared_inline_message(
                user_id=telegram_id,
                result=result,
                allow_user_chats=settings.invite_share_allow_user_chats,
                allow_bot_chats=settings.invite_share_allow_bot_chats,
                allow_group_chats=settings.invite_share_allow_group_chats,
                allow_channel_chats=settings.invite_share_allow_channel_chats,
                request_timeout=10,
            )
        except (TelegramAPIError, TimeoutError) as exc:
            raise InviteShareUnavailableError from exc
        return PreparedInviteShareResponse(
            id=prepared.id,
            expiration_date=prepared.expiration_date,
        )

    @staticmethod
    def _build_result(settings, message: str, referral_url: str, keyboard: InlineKeyboardMarkup):
        common = {
            "id": "flowvy-invite",
            "caption": message,
            "parse_mode": ParseMode.HTML,
            "reply_markup": keyboard,
        }
        if settings.invite_share_media_type == "photo":
            return InlineQueryResultCachedPhoto(
                photo_file_id=settings.invite_share_media_file_id,
                **common,
            )
        if settings.invite_share_media_type == "animation":
            return InlineQueryResultCachedGif(
                gif_file_id=settings.invite_share_media_file_id,
                **common,
            )
        if settings.invite_share_media_type == "video":
            return InlineQueryResultCachedVideo(
                video_file_id=settings.invite_share_media_file_id,
                title="Invite",
                **common,
            )

        preview_mode = settings.invite_share_preview_mode
        preview = LinkPreviewOptions(
            is_disabled=preview_mode == "hidden",
            url=referral_url if preview_mode != "hidden" else None,
            prefer_small_media=preview_mode == "small" or None,
            prefer_large_media=preview_mode == "large" or None,
        )
        return InlineQueryResultArticle(
            id="flowvy-invite",
            title="Invite",
            input_message_content=InputTextMessageContent(
                message_text=message,
                parse_mode=ParseMode.HTML,
                link_preview_options=preview,
            ),
            reply_markup=keyboard,
        )


__all__ = ["InviteShareService", "InviteShareUnavailableError"]
