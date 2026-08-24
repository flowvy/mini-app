"""Local-debug Support attachment storage status without Telegram credentials."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter

from flowvy.schemas.support_requests import (
    SupportStorageAdminResponse,
    SupportStorageTestResponse,
)
from flowvy.services.support_requests import SupportRequestService

router = APIRouter(
    prefix="/api/debug/admin/settings/support-storage",
    tags=["debug-support"],
    route_class=DishkaRoute,
)


@router.get("", response_model=SupportStorageAdminResponse)
async def get_debug_support_storage_status(
    service: FromDishka[SupportRequestService],
) -> SupportStorageAdminResponse:
    return service.storage_status()


@router.post("/test", response_model=SupportStorageTestResponse)
async def test_debug_support_storage(
    service: FromDishka[SupportRequestService],
) -> SupportStorageTestResponse:
    return await service.test_storage()


__all__ = ["router"]
