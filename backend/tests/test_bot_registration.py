"""Bot entry behavior for the universal Mini App launcher."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from flowvy.bot.handlers.start import cmd_start
from flowvy.config import Settings
from flowvy.services.registration import RegistrationUnavailableError


def _message(text: str = "/start", language_code: str = "en") -> SimpleNamespace:
    return SimpleNamespace(
        from_user=SimpleNamespace(
            id=123456,
            username="alice",
            first_name="Alice",
            last_name=None,
            language_code=language_code,
        ),
        chat=SimpleNamespace(id=123456),
        text=text,
    )


def _command(args: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(args=args)


@pytest.mark.asyncio
@pytest.mark.parametrize("registration_mode", ["open", "invite_only"])
async def test_start_sends_the_same_neutral_welcome_without_registering(
    registration_mode: str,
) -> None:
    message = _message()
    sender = AsyncMock()
    registration = AsyncMock()
    registration.begin_bot_start = AsyncMock(return_value="lease-token")
    provider_settings = AsyncMock()
    configured = SimpleNamespace(registration_mode=registration_mode)
    provider_settings.get.return_value = configured
    settings = Settings()

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        _command(),
        settings,
        sender,
        provider_settings,
        registration,
    )

    registration.resolve_existing.assert_not_awaited()
    registration.get_status.assert_not_awaited()
    registration.register_open.assert_not_awaited()
    registration.redeem.assert_not_awaited()
    sender.send_welcome.assert_awaited_once_with(
        123456,
        settings,
        configured,
        "en",
        referral_code=None,
    )
    registration.finish_bot_start.assert_awaited_once_with(
        123456,
        "lease-token",
        stable_response=True,
    )


@pytest.mark.asyncio
async def test_referral_start_carries_only_a_strict_code_into_the_welcome_button() -> None:
    sender = AsyncMock()
    registration = AsyncMock()
    registration.begin_bot_start = AsyncMock(return_value="lease-token")
    provider_settings = AsyncMock()
    configured = SimpleNamespace()
    provider_settings.get.return_value = configured
    settings = Settings()

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        _message("/start ref_FVY23456789ABCDEFGHJKMN"),
        _command("ref_FVY23456789ABCDEFGHJKMN"),
        settings,
        sender,
        provider_settings,
        registration,
    )

    sender.send_welcome.assert_awaited_once_with(
        123456,
        settings,
        configured,
        "en",
        referral_code="FVY23456789ABCDEFGHJKMN",
    )


@pytest.mark.asyncio
async def test_malformed_start_payload_falls_back_to_the_neutral_launcher() -> None:
    sender = AsyncMock()
    registration = AsyncMock()
    registration.begin_bot_start = AsyncMock(return_value="lease-token")
    provider_settings = AsyncMock()
    configured = SimpleNamespace()
    provider_settings.get.return_value = configured
    settings = Settings()

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        _message("/start ref_FVY-BROKEN"),
        _command("ref_FVY-BROKEN"),
        settings,
        sender,
        provider_settings,
        registration,
    )

    sender.send_welcome.assert_awaited_once_with(
        123456,
        settings,
        configured,
        "en",
        referral_code=None,
    )


@pytest.mark.asyncio
async def test_concurrent_duplicate_starts_send_one_welcome() -> None:
    sender = AsyncMock()
    provider_settings = AsyncMock()
    provider_settings.get = AsyncMock(return_value=SimpleNamespace())
    registration = AsyncMock()
    registration.begin_bot_start = AsyncMock(side_effect=["lease-token", None])

    await asyncio.gather(
        cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
            _message(),
            _command(),
            Settings(),
            sender,
            provider_settings,
            registration,
        ),
        cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
            _message(),
            _command(),
            Settings(),
            sender,
            provider_settings,
            registration,
        ),
    )

    sender.send_welcome.assert_awaited_once()
    registration.finish_bot_start.assert_awaited_once_with(
        123456,
        "lease-token",
        stable_response=True,
    )


@pytest.mark.asyncio
async def test_redis_failure_does_not_block_the_neutral_welcome() -> None:
    message = _message()
    sender = AsyncMock()
    registration = AsyncMock()
    registration.begin_bot_start = AsyncMock(side_effect=RegistrationUnavailableError)
    provider_settings = AsyncMock()
    configured = SimpleNamespace()
    provider_settings.get.return_value = configured
    settings = Settings()

    await cmd_start.__dishka_orig_func__(  # type: ignore[attr-defined]
        message,
        _command(),
        settings,
        sender,
        provider_settings,
        registration,
    )

    sender.send_welcome.assert_awaited_once_with(
        123456,
        settings,
        configured,
        "en",
        referral_code=None,
    )
    registration.finish_bot_start.assert_not_awaited()
