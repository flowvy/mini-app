"""Shared admin authentication dependencies."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from aiogram.utils.web_app import WebAppInitData, safe_parse_webapp_init_data
from fastapi import Depends, Form, HTTPException, Request, status

from flowvy.api.deps import get_current_init_data
from flowvy.models.user import UserRole
from flowvy.repositories.user import UserRepository


async def get_current_admin(
    request: Request,
    init_data: Annotated[WebAppInitData, Depends(get_current_init_data)],
) -> WebAppInitData:
    """Verify the caller is an admin user."""
    container = request.state.dishka_container
    user_repo = await container.get(UserRepository)
    user = await user_repo.get_by_telegram_id(init_data.user.id)
    if not user or user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return init_data


async def get_current_admin_form(
    request: Request,
    init_data: str = Form(alias="initData"),
) -> WebAppInitData:
    """Verify admin from initData passed as a form field.

    Used for multipart/form-data endpoints where Authorization header
    is unreliable in Telegram WebView.
    """
    settings = request.app.state.settings
    try:
        parsed = safe_parse_webapp_init_data(
            token=settings.bot_token,
            init_data=init_data,
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid initData signature",
        ) from err

    now = datetime.now(UTC)
    if now - parsed.auth_date > timedelta(seconds=settings.init_data_ttl):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="initData expired",
        )
    if parsed.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No user data in initData",
        )

    container = request.state.dishka_container
    user_repo = await container.get(UserRepository)
    user = await user_repo.get_by_telegram_id(parsed.user.id)
    if not user or user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return parsed


CurrentAdmin = Annotated[WebAppInitData, Depends(get_current_admin)]
CurrentAdminForm = Annotated[WebAppInitData, Depends(get_current_admin_form)]
