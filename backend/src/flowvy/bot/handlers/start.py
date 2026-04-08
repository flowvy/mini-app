"""Handler for /start command."""

from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from dishka import FromDishka
from dishka.integrations.aiogram import inject

from flowvy.config import Settings
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.services.message_sender import MessageSender

router = Router(name="start")


@router.message(CommandStart())
@inject
async def cmd_start(
    message: Message,
    settings: FromDishka[Settings],
    sender: FromDishka[MessageSender],
    ps_repo: FromDishka[ProviderSettingsRepository],
) -> None:
    """Greet user and show Mini App button."""
    ps = await ps_repo.get()
    await sender.send_welcome(message.chat.id, settings, ps)
