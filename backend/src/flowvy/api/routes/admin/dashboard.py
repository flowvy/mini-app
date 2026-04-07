"""Admin dashboard route."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter

from flowvy.api.routes.admin.deps import CurrentAdmin
from flowvy.schemas.dashboard import DashboardResponse
from flowvy.services.dashboard import DashboardService

router = APIRouter(
    prefix="/api/admin",
    tags=["admin-dashboard"],
    route_class=DishkaRoute,
)


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    _admin: CurrentAdmin,
    service: FromDishka[DashboardService] = None,  # type: ignore[assignment]
) -> DashboardResponse:
    """Return aggregated dashboard data from Remnawave and bot metrics."""
    return await service.get_dashboard()
