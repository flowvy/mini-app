"""Handler for /start command."""

from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message
from dishka import FromDishka
from dishka.integrations.aiogram import inject

from flowvy.config import Settings
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.services.message_sender import MessageSender
from flowvy.services.registration import RegistrationService, RegistrationUnavailableError
from flowvy.telegram_main_app import referral_code_from_start_param

router = Router(name="start")


def _locale(message: Message) -> str | None:
    return getattr(message.from_user, "language_code", None)


@router.message(CommandStart())
@inject
async def cmd_start(
    message: Message,
    command: CommandObject,
    settings: FromDishka[Settings],
    sender: FromDishka[MessageSender],
    ps_repo: FromDishka[ProviderSettingsRepository],
    registration: FromDishka[RegistrationService],
) -> None:
    """Send one neutral Mini App launcher for every bot entry."""
    if message.from_user is None:
        return
    telegram_id = message.from_user.id
    lease_token = None
    try:
        lease_token = await registration.begin_bot_start(telegram_id)
    except RegistrationUnavailableError:
        # This launcher has no registration/provider side effect, so a failed
        # deduplication store must not block entry to the Mini App.
        pass
    else:
        if lease_token is None:
            return

    stable_response = False
    try:
        ps = await ps_repo.get()
        await sender.send_welcome(
            message.chat.id,
            settings,
            ps,
            _locale(message),
            referral_code=referral_code_from_start_param(command.args),
        )
        stable_response = True
    finally:
        if lease_token is not None:
            await registration.finish_bot_start(
                telegram_id,
                lease_token,
                stable_response=stable_response,
            )
