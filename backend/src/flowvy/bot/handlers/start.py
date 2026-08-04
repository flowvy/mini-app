"""Handler for /start command."""

from __future__ import annotations

import contextlib
import logging

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import CommandStart
from aiogram.types import Message
from dishka import FromDishka
from dishka.integrations.aiogram import inject

from flowvy.config import Settings
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.services.message_sender import MessageSender
from flowvy.services.registration import (
    InvalidInviteError,
    InviteRateLimitError,
    RegistrationError,
    RegistrationIdentity,
    RegistrationService,
    RegistrationUnavailableError,
)
from flowvy.services.user import InactiveUserError

router = Router(name="start")
_logger = logging.getLogger(__name__)


def _identity(message: Message) -> RegistrationIdentity | None:
    if message.from_user is None:
        return None
    full_name = message.from_user.first_name
    if message.from_user.last_name:
        full_name = f"{full_name} {message.from_user.last_name}"
    return RegistrationIdentity(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        full_name=full_name,
    )


@router.message(CommandStart())
@inject
async def cmd_start(
    message: Message,
    settings: FromDishka[Settings],
    sender: FromDishka[MessageSender],
    ps_repo: FromDishka[ProviderSettingsRepository],
    registration: FromDishka[RegistrationService],
) -> None:
    """Register open users or explain invite-only onboarding."""
    identity = _identity(message)
    if identity is None:
        return
    try:
        lease_token = await registration.begin_bot_start(identity.telegram_id)
    except RegistrationUnavailableError:
        await sender.send(
            message.chat.id,
            "Registration is temporarily unavailable. Please try again later.",
        )
        return
    if lease_token is None:
        return

    stable_response = False
    try:
        try:
            user = await registration.resolve_existing(identity)
            if user is None:
                onboarding = await registration.get_status(identity)
                if onboarding.state == "invite_required":
                    await sender.send(
                        message.chat.id,
                        "Access is invite-only. Send your invite code in this chat.",
                    )
                    stable_response = True
                    return
                await registration.register_open(identity)
        except InvalidInviteError:
            await sender.send(
                message.chat.id,
                "This invite code is invalid or no longer available.",
            )
            stable_response = True
            return
        except InviteRateLimitError:
            await sender.send(message.chat.id, "Too many attempts. Try again later.")
            stable_response = True
            return
        except InactiveUserError:
            await sender.send(message.chat.id, "Your account is disabled.")
            stable_response = True
            return
        except RegistrationError as exc:
            _logger.warning("Bot registration failed with code %s", exc.code)
            await sender.send(
                message.chat.id,
                "Registration is temporarily unavailable. Please try again later.",
            )
            return
        ps = await ps_repo.get()
        await sender.send_welcome(message.chat.id, settings, ps)
        stable_response = True
    finally:
        await registration.finish_bot_start(
            identity.telegram_id,
            lease_token,
            stable_response=stable_response,
        )


@router.message(F.chat.type == "private", F.text, ~F.text.startswith("/"))
@inject
async def redeem_invite_message(
    message: Message,
    settings: FromDishka[Settings],
    sender: FromDishka[MessageSender],
    ps_repo: FromDishka[ProviderSettingsRepository],
    registration: FromDishka[RegistrationService],
) -> None:
    """Treat private text from an unknown user as an invite code, without FSM state."""
    identity = _identity(message)
    if identity is None or message.text is None:
        return
    try:
        if await registration.resolve_existing(identity) is not None:
            return
        onboarding = await registration.get_status(identity)
        if onboarding.state == "open":
            await registration.register_open(identity)
            ps = await ps_repo.get()
            await sender.send_welcome(message.chat.id, settings, ps)
            return
        # Remove code attempts from chat history to keep the onboarding chat tidy.
        with contextlib.suppress(TelegramAPIError):
            await message.delete()
        await registration.redeem(identity, message.text)
    except InvalidInviteError:
        await sender.send(message.chat.id, "This invite code is invalid or no longer available.")
        return
    except InviteRateLimitError:
        await sender.send(message.chat.id, "Too many attempts. Try again later.")
        return
    except (RegistrationUnavailableError, RegistrationError, InactiveUserError):
        await sender.send(
            message.chat.id,
            "Registration is temporarily unavailable. Please try again later.",
        )
        return

    ps = await ps_repo.get()
    await sender.send_welcome(message.chat.id, settings, ps)
