"""FastAPI dependencies for authentication."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from aiogram.utils.web_app import WebAppInitData, safe_parse_webapp_init_data
from fastapi import HTTPException, Request, status
from redis.asyncio import Redis


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

    if init_data.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No user data in initData",
        )

    container = request.state.dishka_container
    redis: Redis = await container.get(Redis)
    await redis.hset("bot:last_seen", str(init_data.user.id), str(int(time.time())))

    return init_data
