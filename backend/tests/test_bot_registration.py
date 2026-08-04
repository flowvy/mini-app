"""Bot registration and invite onboarding behavior."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from flowvy.bot.handlers.start import cmd_start, redeem_invite_message
from flowvy.config import Settings
from flowvy.schemas.registration import OnboardingStatusResponse
from flowvy.services.registration import InvalidInviteError, RegistrationUnavailableError


def _message(text: str = "/start") -> SimpleNamespace:
    return SimpleNamespace(
        from_user=SimpleNamespace(
            id=123456,
            username="alice",
            first_name="Alice",
            last_name=None,
        ),
        chat=SimpleNamespace(id=123456),
        text=text,
        delete=AsyncMock(),
    )


@pytest.mark.asyncio
async def test_start_prompts_unknown_user_when_registration_is_invite_only() -> None:
    message = _message()
    sender = AsyncMock()
    registration = AsyncMock()
    registration.resolve_existing = AsyncMock(return_value=None)
    registration.get_status = AsyncMock(
        return_value=OnboardingStatusResponse(
            state="invite_required",
            registration_mode="invite_only",
        ),
    )

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        Settings(),
        sender,
        AsyncMock(),
        registration,
    )

    sender.send.assert_awaited_once_with(
        123456,
        "Access is invite-only. Send your invite code in this chat.",
    )
    registration.register_open.assert_not_awaited()


@pytest.mark.asyncio
async def test_start_welcomes_provider_only_user_without_invite_prompt() -> None:
    message = _message("/start ref_FVY23456789ABCDEFGHJKM")
    sender = AsyncMock()
    provider_settings = AsyncMock()
    provider_settings.get = AsyncMock(return_value=SimpleNamespace())
    registration = AsyncMock()
    registration.resolve_existing = AsyncMock(return_value=SimpleNamespace())

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        Settings(),
        sender,
        provider_settings,
        registration,
    )

    registration.get_status.assert_not_awaited()
    registration.redeem.assert_not_awaited()
    sender.send.assert_not_awaited()
    sender.send_welcome.assert_awaited_once()


@pytest.mark.asyncio
async def test_concurrent_duplicate_starts_send_one_welcome() -> None:
    sender = AsyncMock()
    provider_settings = AsyncMock()
    provider_settings.get = AsyncMock(return_value=SimpleNamespace())
    registration = AsyncMock()
    registration.begin_bot_start = AsyncMock(side_effect=["lease-token", None])
    registration.resolve_existing = AsyncMock(return_value=SimpleNamespace())

    await asyncio.gather(
        cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
            _message(),
            Settings(),
            sender,
            provider_settings,
            registration,
        ),
        cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
            _message(),
            Settings(),
            sender,
            provider_settings,
            registration,
        ),
    )

    registration.resolve_existing.assert_awaited_once()
    sender.send_welcome.assert_awaited_once()
    registration.finish_bot_start.assert_awaited_once_with(
        123456,
        "lease-token",
        stable_response=True,
    )


@pytest.mark.asyncio
async def test_transient_start_failure_releases_lease_without_cooldown() -> None:
    message = _message()
    sender = AsyncMock()
    registration = AsyncMock()
    registration.begin_bot_start = AsyncMock(return_value="lease-token")
    registration.resolve_existing = AsyncMock(side_effect=RegistrationUnavailableError)

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        Settings(),
        sender,
        AsyncMock(),
        registration,
    )

    sender.send.assert_awaited_once_with(
        123456,
        "Registration is temporarily unavailable. Please try again later.",
    )
    registration.finish_bot_start.assert_awaited_once_with(
        123456,
        "lease-token",
        stable_response=False,
    )


@pytest.mark.asyncio
async def test_private_text_registers_open_user_without_treating_it_as_a_code() -> None:
    message = _message("hello")
    sender = AsyncMock()
    provider_settings = AsyncMock()
    provider_settings.get = AsyncMock(return_value=SimpleNamespace())
    registration = AsyncMock()
    registration.resolve_existing = AsyncMock(return_value=None)
    registration.get_status = AsyncMock(
        return_value=OnboardingStatusResponse(state="open", registration_mode="open"),
    )

    await redeem_invite_message.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        Settings(),
        sender,
        provider_settings,
        registration,
    )

    registration.register_open.assert_awaited_once()
    registration.redeem.assert_not_awaited()
    message.delete.assert_not_awaited()
    sender.send_welcome.assert_awaited_once()


@pytest.mark.asyncio
async def test_bot_start_parameter_does_not_bypass_main_mini_app_invite_flow() -> None:
    message = _message("/start ref_FVY23456789ABCDEFGHJKM")
    sender = AsyncMock()
    registration = AsyncMock()
    registration.resolve_existing = AsyncMock(return_value=None)
    registration.get_status = AsyncMock(
        return_value=OnboardingStatusResponse(
            state="invite_required",
            registration_mode="invite_only",
        ),
    )

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        Settings(),
        sender,
        AsyncMock(),
        registration,
    )

    registration.redeem.assert_not_awaited()
    sender.send.assert_awaited_once_with(
        123456,
        "Access is invite-only. Send your invite code in this chat.",
    )
    sender.send_welcome.assert_not_awaited()


@pytest.mark.asyncio
async def test_invite_attempt_is_deleted_even_when_the_code_is_invalid() -> None:
    message = _message("FVY-WRONG-CODE")
    sender = AsyncMock()
    registration = AsyncMock()
    registration.resolve_existing = AsyncMock(return_value=None)
    registration.get_status = AsyncMock(
        return_value=OnboardingStatusResponse(
            state="invite_required",
            registration_mode="invite_only",
        ),
    )
    registration.redeem = AsyncMock(side_effect=InvalidInviteError)

    await redeem_invite_message.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        Settings(),
        sender,
        AsyncMock(),
        registration,
    )

    message.delete.assert_awaited_once()
    sender.send.assert_awaited_once_with(
        123456,
        "This invite code is invalid or no longer available.",
    )
