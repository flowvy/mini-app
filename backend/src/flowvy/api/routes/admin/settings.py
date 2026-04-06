"""Admin settings API routes."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter

from flowvy.api.routes.admin.deps import CurrentAdmin
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
