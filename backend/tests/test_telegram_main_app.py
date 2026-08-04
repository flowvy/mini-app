"""Telegram Main Mini App capability and referral contract tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiogram.exceptions import TelegramUnauthorizedError
from aiogram.methods import GetMe

from flowvy.telegram_main_app import (
    TelegramMainApp,
    discover_main_app,
    referral_code_from_start_param,
)


def test_main_app_builds_only_the_official_startapp_link() -> None:
    main_app = TelegramMainApp.from_bot_user(
        username="flowvy_testBot",
        has_main_web_app=True,
    )

    assert main_app.status == "ready"
    assert main_app.referral_url("FVY-2345-6789-ABCD-EFGH-JKMN") == (
        "https://t.me/flowvy_testBot?startapp=ref_FVY23456789ABCDEFGHJKMN"
    )


def test_main_app_link_is_unavailable_without_confirmed_capability() -> None:
    not_configured = TelegramMainApp.from_bot_user(
        username="flowvy_testBot",
        has_main_web_app=None,
    )

    assert not_configured.status == "main_app_not_configured"
    assert not_configured.referral_url("FVY-2345-6789-ABCD-EFGH-JKMN") is None
    assert TelegramMainApp.unavailable().referral_url("FVY-2345-6789-ABCD-EFGH-JKMN") is None


def test_start_param_parser_accepts_only_the_flowvy_contract() -> None:
    assert (
        referral_code_from_start_param("ref_FVY23456789ABCDEFGHJKMN") == "FVY23456789ABCDEFGHJKMN"
    )
    assert referral_code_from_start_param("ref_FVY-2345-6789-ABCD-EFGH-JKMN") is None
    assert referral_code_from_start_param("other_FVY23456789ABCDEFGHJKMN") is None
    assert referral_code_from_start_param(None) is None


@pytest.mark.asyncio
async def test_discovery_uses_get_me_and_retries_only_transient_failures() -> None:
    bot = AsyncMock()
    bot.get_me = AsyncMock(
        return_value=SimpleNamespace(
            username="flowvy_testBot",
            has_main_web_app=True,
        ),
    )

    discovered = await discover_main_app(bot)

    assert discovered.status == "ready"
    bot.get_me.assert_awaited_once_with()

    bot.get_me = AsyncMock(
        side_effect=[
            TimeoutError,
            SimpleNamespace(
                username="flowvy_testBot",
                has_main_web_app=False,
            ),
        ],
    )
    discovered = await discover_main_app(bot, retry_delay_seconds=0)
    assert discovered.status == "main_app_not_configured"
    assert bot.get_me.await_count == 2

    bot.get_me = AsyncMock(
        side_effect=TelegramUnauthorizedError(method=GetMe(), message="unauthorized"),
    )
    assert (
        await discover_main_app(bot, attempts=3, retry_delay_seconds=0)
    ).status == "telegram_unavailable"
    bot.get_me.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_discovery_fails_closed_after_bounded_transient_attempts() -> None:
    bot = AsyncMock()
    bot.get_me = AsyncMock(side_effect=TimeoutError)

    assert (
        await discover_main_app(bot, attempts=2, retry_delay_seconds=0)
    ).status == "telegram_unavailable"
    assert bot.get_me.await_count == 2
