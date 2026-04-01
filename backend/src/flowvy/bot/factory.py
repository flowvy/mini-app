"""Bot and dispatcher factory functions."""

from __future__ import annotations

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from flowvy.bot.handlers import include_routers
from flowvy.config import Settings


def create_bot(settings: Settings) -> Bot:
    """Create aiogram Bot instance with HTML parse mode."""
    return Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


def create_dispatcher() -> Dispatcher:
    """Create aiogram Dispatcher with all routers included."""
    dp = Dispatcher()
    include_routers(dp)
    return dp
