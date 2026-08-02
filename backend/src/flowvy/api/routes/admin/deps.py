"""Shared admin authentication dependencies."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from fastapi import Depends, Form, HTTPException, Request, status

from flowvy.api.deps import get_current_init_data, parse_init_data
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
    settings = request.app.state.settings
    if (
        not user
        or not user.is_active
        or user.role != UserRole.ADMIN
        or init_data.user.id not in settings.admin_telegram_ids
    ):
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
    parsed = parse_init_data(init_data, settings)

    container = request.state.dishka_container
    user_repo = await container.get(UserRepository)
    user = await user_repo.get_by_telegram_id(parsed.user.id)
    if (
        not user
        or not user.is_active
        or user.role != UserRole.ADMIN
        or parsed.user.id not in settings.admin_telegram_ids
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return parsed


CurrentAdmin = Annotated[WebAppInitData, Depends(get_current_admin)]
CurrentAdminForm = Annotated[WebAppInitData, Depends(get_current_admin_form)]
