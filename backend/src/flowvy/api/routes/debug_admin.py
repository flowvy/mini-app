"""Debug-only admin routes for local development without Telegram."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, Request, status

from flowvy.api.routes.debug import check_debug
from flowvy.schemas.admin_users import AdminUsersResponse
from flowvy.services.admin_users import AdminUsersService
from flowvy.services.remnawave import RemnawaveError

router = APIRouter(
    prefix="/api/debug/admin",
    tags=["debug-admin"],
    route_class=DishkaRoute,
)


@router.get("/users", response_model=AdminUsersResponse)
async def debug_admin_users(
    request: Request,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
    size: int = Query(default=25, ge=1, le=100),
    start: int = Query(default=0, ge=0),
) -> AdminUsersResponse:
    """Fetch admin users without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        return await service.get_users(size, start)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc


@router.get("/users/search", response_model=AdminUsersResponse)
async def debug_search_users(
    request: Request,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
    q: str = Query(min_length=1, max_length=200),
) -> AdminUsersResponse:
    """Search users without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        return await service.search_user(q)
    except RemnawaveError as exc:
        if exc.status == 404:
            return AdminUsersResponse(users=[], total=0)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc
