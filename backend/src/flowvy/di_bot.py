"""Dishka DI provider for bot and messaging services."""

from __future__ import annotations

from aiogram import Bot
from dishka import Provider, Scope, provide
from redis.asyncio import Redis

from flowvy.bot.factory import create_bot
from flowvy.config import Settings
from flowvy.services.message_sender import MessageSender


class BotProvider(Provider):
    """Provides Bot and MessageSender (APP scope)."""

    @provide(scope=Scope.APP)
    def get_bot(self, settings: Settings) -> Bot:
        """Create aiogram Bot instance via factory."""
        return create_bot(settings)

    @provide(scope=Scope.APP)
    def get_message_sender(self, bot: Bot, redis: Redis) -> MessageSender:
        """Create universal message sender."""
        return MessageSender(bot, redis)
