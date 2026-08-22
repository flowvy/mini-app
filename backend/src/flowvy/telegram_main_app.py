"""Official Telegram Main Mini App capability and referral-link contract."""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlencode

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramNetworkError, TelegramServerError

ReferralStatus = Literal[
    "ready",
    "main_app_not_configured",
    "telegram_unavailable",
]

_BOT_USERNAME_RE = re.compile(r"[A-Za-z0-9_]{5,32}")
_INVITE_CODE_RE = re.compile(r"FVY[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{20}")
_START_PREFIX = "ref_"


@dataclass(frozen=True, slots=True)
class TelegramMainApp:
    """Cached result of the Bot API ``getMe`` Main Mini App capability check."""

    status: ReferralStatus
    bot_username: str | None = None

    @classmethod
    def unavailable(cls) -> TelegramMainApp:
        """Represent a bot profile that could not be verified."""
        return cls(status="telegram_unavailable")

    @classmethod
    def from_bot_user(cls, *, username: object, has_main_web_app: object) -> TelegramMainApp:
        """Build state only from fields returned by the official Bot API ``getMe`` method."""
        if not isinstance(username, str) or _BOT_USERNAME_RE.fullmatch(username) is None:
            return cls.unavailable()
        if has_main_web_app is not True:
            return cls(status="main_app_not_configured", bot_username=username)
        return cls(status="ready", bot_username=username)

    def referral_url(self, invite_code: str) -> str | None:
        """Build a bot deep link that creates the chat before opening the Mini App."""
        if self.status != "ready" or self.bot_username is None:
            return None
        compact_code = re.sub(r"[\s-]+", "", invite_code).upper()
        if _INVITE_CODE_RE.fullmatch(compact_code) is None:
            return None
        query = urlencode({"start": f"{_START_PREFIX}{compact_code}"})
        return f"https://t.me/{self.bot_username}?{query}"

    def referral_launch_url(self, invite_code: str) -> str | None:
        """Build the Main Mini App link carried by a referral-aware Welcome button."""
        if self.status != "ready" or self.bot_username is None:
            return None
        compact_code = re.sub(r"[\s-]+", "", invite_code).upper()
        if _INVITE_CODE_RE.fullmatch(compact_code) is None:
            return None
        query = urlencode({"startapp": f"{_START_PREFIX}{compact_code}"})
        return f"https://t.me/{self.bot_username}?{query}"


def referral_code_from_start_param(start_param: str | None) -> str | None:
    """Parse only Flowvy's strict Main Mini App start parameter."""
    if not isinstance(start_param, str) or not start_param.startswith(_START_PREFIX):
        return None
    code = start_param[len(_START_PREFIX) :].upper()
    return code if _INVITE_CODE_RE.fullmatch(code) is not None else None


async def discover_main_app(
    bot: Bot,
    *,
    timeout_seconds: float = 10.0,
    attempts: int = 2,
    retry_delay_seconds: float = 0.25,
) -> TelegramMainApp:
    """Read Main Mini App capability with a bounded retry for transient failures only."""
    if attempts < 1:
        raise ValueError("attempts must be positive")

    for attempt in range(attempts):
        try:
            async with asyncio.timeout(timeout_seconds):
                profile = await bot.me()
        except (TelegramNetworkError, TelegramServerError, TimeoutError):
            if attempt + 1 >= attempts:
                return TelegramMainApp.unavailable()
            await asyncio.sleep(retry_delay_seconds)
            continue
        except TelegramAPIError:
            return TelegramMainApp.unavailable()
        return TelegramMainApp.from_bot_user(
            username=profile.username,
            has_main_web_app=profile.has_main_web_app,
        )

    return TelegramMainApp.unavailable()


__all__ = [
    "ReferralStatus",
    "TelegramMainApp",
    "discover_main_app",
    "referral_code_from_start_param",
]
