"""Admin settings API routes."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, Request, status

from flowvy.api.deps import get_current_init_data
from flowvy.models.user import UserRole
from flowvy.repositories.user import UserRepository
from flowvy.schemas.provider_settings import (
    KumaTestResponse,
    ProviderSettingsPatch,
    ProviderSettingsResponse,
)
from flowvy.services.provider_settings import ProviderSettingsService

router = APIRouter(
    prefix="/api/admin",
    tags=["admin-settings"],
    route_class=DishkaRoute,
)


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


@router.get("/settings", response_model=ProviderSettingsResponse)
async def get_settings(
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> ProviderSettingsResponse:
    """Return current provider settings."""
    return await service.get()


@router.patch("/settings", response_model=ProviderSettingsResponse)
async def patch_settings(
    patch: ProviderSettingsPatch,
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> ProviderSettingsResponse:
    """Partial update of provider settings."""
    return await service.update(patch)


@router.get("/settings/kuma/test", response_model=KumaTestResponse)
async def test_kuma(
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> KumaTestResponse:
    """Test Uptime Kuma connection using saved URL and slug."""
    return await service.test_kuma()
