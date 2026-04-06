"""Shared admin authentication dependencies."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from fastapi import Depends, HTTPException, Request, status

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


CurrentAdmin = Annotated[WebAppInitData, Depends(get_current_admin)]
