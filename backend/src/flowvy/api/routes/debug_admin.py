"""Debug-only admin routes for local development without Telegram."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status

from flowvy.api.routes.admin.settings import ALLOWED_MIME, MAX_FILE_SIZE
from flowvy.api.routes.debug import check_debug
from flowvy.schemas.admin_users import AdminUsersResponse
from flowvy.schemas.provider_settings import (
    KumaTestResponse,
    ProviderSettingsPatch,
    ProviderSettingsResponse,
    WelcomeMediaUploadResponse,
)
from flowvy.services.admin_users import AdminUsersService
from flowvy.services.dashboard import DashboardService
from flowvy.services.provider_settings import ProviderSettingsService
from flowvy.services.remnawave import RemnawaveError

router = APIRouter(
    prefix="/api/debug/admin",
    tags=["debug-admin"],
    route_class=DishkaRoute,
)


@router.get("/dashboard")
async def debug_admin_dashboard(
    request: Request,
    service: FromDishka[DashboardService] = None,  # type: ignore[assignment]
):
    """Fetch admin dashboard without Telegram auth. DEBUG mode only."""
    check_debug(request)
    return await service.get_dashboard()


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


@router.get("/settings", response_model=ProviderSettingsResponse)
async def debug_admin_settings(
    request: Request,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> ProviderSettingsResponse:
    """Read admin settings without Telegram auth. DEBUG mode only."""
    check_debug(request)
    return await service.get()


@router.patch("/settings", response_model=ProviderSettingsResponse)
async def debug_patch_admin_settings(
    patch: ProviderSettingsPatch,
    request: Request,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> ProviderSettingsResponse:
    """Update admin settings without Telegram auth. DEBUG mode only."""
    check_debug(request)
    return await service.update(patch)


@router.get("/settings/kuma/test", response_model=KumaTestResponse)
async def debug_test_kuma(
    request: Request,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> KumaTestResponse:
    """Test Kuma connection without Telegram auth. DEBUG mode only."""
    check_debug(request)
    return await service.test_kuma()


@router.post(
    "/settings/welcome-media",
    response_model=WelcomeMediaUploadResponse,
)
async def debug_upload_welcome_media(
    file: UploadFile,
    request: Request,
) -> WelcomeMediaUploadResponse:
    """Return fake file_id without Telegram. Does NOT write to DB."""
    check_debug(request)
    media_type = ALLOWED_MIME.get(file.content_type or "")
    if not media_type:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported file type")
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large")
    return WelcomeMediaUploadResponse(
        file_id=f"debug_file_id_{len(data)}",
        file_name=file.filename or "media",
        media_type=media_type,
    )
