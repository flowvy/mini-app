"""Admin users API routes."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, status

from flowvy.api.routes.admin.deps import CurrentAdmin
from flowvy.schemas.admin_users import AdminUserResponse, AdminUsersResponse
from flowvy.services.admin_users import AdminUsersService
from flowvy.services.remnawave import RemnawaveError

router = APIRouter(
    prefix="/api/admin",
    tags=["admin-users"],
    route_class=DishkaRoute,
)


@router.get("/users", response_model=AdminUsersResponse)
async def get_users(
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
    size: int = Query(default=25, ge=1, le=100),
    start: int = Query(default=0, ge=0),
) -> AdminUsersResponse:
    """Return paginated user list from Remnawave."""
    try:
        return await service.get_users(size, start)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave unavailable",
        ) from exc


@router.get("/users/search", response_model=AdminUsersResponse)
async def search_users(
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
    q: str = Query(min_length=1, max_length=200),
) -> AdminUsersResponse:
    """Search user by username, telegram_id, or email (exact match)."""
    try:
        return await service.search_user(q)
    except RemnawaveError as exc:
        if exc.status == 404:
            return AdminUsersResponse(users=[], total=0)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave unavailable",
        ) from exc


@router.get("/users/all", response_model=AdminUsersResponse)
async def get_all_users(
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> AdminUsersResponse:
    """Return all users from Remnawave (batched internally)."""
    try:
        return await service.get_all_users()
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave unavailable",
        ) from exc


@router.get("/users/{user_id}", response_model=AdminUserResponse)
async def get_user(
    user_id: int,
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> AdminUserResponse:
    """Return single user by its numeric provider ID."""
    try:
        return await service.get_user(user_id)
    except RemnawaveError as exc:
        if exc.status == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave unavailable",
        ) from exc


@router.post("/users/{user_id}/enable")
async def enable_user(
    user_id: int,
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> dict:
    """Enable a user."""
    try:
        await service.enable_user(user_id)
        return {"ok": True}
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave request failed",
        ) from exc


@router.post("/users/{user_id}/disable")
async def disable_user(
    user_id: int,
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> dict:
    """Disable a user."""
    try:
        await service.disable_user(user_id)
        return {"ok": True}
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave request failed",
        ) from exc


@router.post("/users/{user_id}/reset-traffic")
async def reset_traffic(
    user_id: int,
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> dict:
    """Reset traffic counters for a user."""
    try:
        await service.reset_user_traffic(user_id)
        return {"ok": True}
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave request failed",
        ) from exc


@router.post("/users/{user_id}/revoke")
async def revoke_subscription(
    user_id: int,
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> dict:
    """Revoke subscription link for a user."""
    try:
        await service.revoke_user_subscription(user_id)
        return {"ok": True}
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave request failed",
        ) from exc


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    _admin: CurrentAdmin,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> dict:
    """Permanently delete a user."""
    try:
        await service.delete_user(user_id)
        return {"ok": True}
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Remnawave request failed",
        ) from exc
