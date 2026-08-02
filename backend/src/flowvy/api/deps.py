"""FastAPI dependencies for authentication."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import structlog
from aiogram.utils.web_app import WebAppInitData, safe_parse_webapp_init_data
from fastapi import HTTPException, Request, status
from redis.asyncio import Redis
from redis.exceptions import RedisError

from flowvy.config import Settings
from flowvy.repositories.user import UserRepository

logger = structlog.get_logger()
_MAX_FUTURE_SKEW = timedelta(seconds=30)


def parse_init_data(raw_init_data: str, settings: Settings) -> WebAppInitData:
    """Validate Telegram initData without touching infrastructure."""
    if not settings.bot_token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram authentication is unavailable",
        )
    if not raw_init_data.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing initData",
        )

    try:
        init_data = safe_parse_webapp_init_data(
            token=settings.bot_token,
            init_data=raw_init_data,
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid initData signature",
        ) from err

    now = datetime.now(UTC)
    if now - init_data.auth_date > timedelta(seconds=settings.init_data_ttl):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="initData expired",
        )
    if init_data.auth_date - now > _MAX_FUTURE_SKEW:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="initData auth_date is in the future",
        )
    if init_data.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No user data in initData",
        )
    return init_data


async def get_current_init_data(request: Request) -> WebAppInitData:
    """Extract and validate Telegram initData from Authorization header.

    Expected header format: ``Authorization: tma <raw_init_data>``.
    After successful validation, records last-seen timestamp in Redis.

    Raises:
        HTTPException(401): on missing/invalid/expired initData.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("tma "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    raw_init_data = auth_header.removeprefix("tma ")
    settings = request.app.state.settings
    init_data = parse_init_data(raw_init_data, settings)

    container = request.state.dishka_container
    try:
        redis: Redis = await container.get(Redis)
        await redis.hset("bot:last_seen", str(init_data.user.id), str(int(time.time())))
    except RedisError:
        logger.warning("auth_last_seen_redis_unavailable")

    return init_data


async def get_current_active_init_data(request: Request) -> WebAppInitData:
    """Authenticate Telegram initData and require an active local user."""
    init_data = await get_current_init_data(request)
    container = request.state.dishka_container
    user_repo = await container.get(UserRepository)
    user = await user_repo.get_by_telegram_id(init_data.user.id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active user account required",
        )
    return init_data
