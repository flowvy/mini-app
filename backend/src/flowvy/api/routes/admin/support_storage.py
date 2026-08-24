"""Read-only administration and connectivity check for Support attachment storage."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter

from flowvy.api.routes.admin.deps import CurrentAdmin
from flowvy.schemas.support_requests import (
    SupportStorageAdminResponse,
    SupportStorageTestResponse,
)
from flowvy.services.support_requests import SupportRequestService

router = APIRouter(
    prefix="/api/admin/settings/support-storage",
    tags=["admin-support"],
    route_class=DishkaRoute,
)


@router.get("", response_model=SupportStorageAdminResponse)
async def get_support_storage_status(
    _admin: CurrentAdmin,
    service: FromDishka[SupportRequestService],
) -> SupportStorageAdminResponse:
    return service.storage_status()


@router.post("/test", response_model=SupportStorageTestResponse)
async def test_support_storage(
    _admin: CurrentAdmin,
    service: FromDishka[SupportRequestService],
) -> SupportStorageTestResponse:
    return await service.test_storage()


__all__ = ["router"]
