"""Handler for /start command."""

from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from dishka import FromDishka
from dishka.integrations.aiogram import inject

from flowvy.config import Settings

router = Router(name="start")


@router.message(CommandStart())
@inject
async def cmd_start(message: Message, settings: FromDishka[Settings]) -> None:
    """Greet user and show Mini App button if webapp_url is configured."""
    text = "Welcome to Flowvy! Tap the button below to open the app."

    if settings.webapp_url:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="Open Flowvy",
                        web_app=WebAppInfo(url=settings.webapp_url),
                    )
                ]
            ]
        )
        await message.answer(text, reply_markup=keyboard)
    else:
        await message.answer(text)
