"""Debug-only admin routes for local development without Telegram."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status

from flowvy.api.routes.admin.settings import ALLOWED_MIME, MAX_FILE_SIZE
from flowvy.api.routes.debug import check_debug
from flowvy.schemas.admin_users import AdminUserResponse, AdminUsersResponse
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


def _502(exc: RemnawaveError, verb: str = "unavailable") -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, f"Remnawave {verb}: {exc.detail}")


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
        raise _502(exc) from exc


@router.get("/users/all", response_model=AdminUsersResponse)
async def debug_admin_users_all(
    request: Request,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> AdminUsersResponse:
    """Fetch all admin users without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        return await service.get_all_users()
    except RemnawaveError as exc:
        raise _502(exc) from exc


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
        raise _502(exc) from exc


@router.get("/users/{uuid}", response_model=AdminUserResponse)
async def debug_admin_user(
    uuid: str,
    request: Request,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> AdminUserResponse:
    """Fetch single admin user without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        return await service.get_user(uuid)
    except RemnawaveError as exc:
        if exc.status == 404:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found") from exc
        raise _502(exc) from exc


@router.post("/users/{uuid}/{action}")
async def debug_user_action(
    uuid: str,
    action: str,
    request: Request,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> dict:
    """Proxy user actions without Telegram auth. DEBUG mode only."""
    check_debug(request)
    actions = {
        "enable": service.enable_user,
        "disable": service.disable_user,
        "reset-traffic": service.reset_user_traffic,
        "revoke": service.revoke_user_subscription,
    }
    handler = actions.get(action)
    if not handler:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown action: {action}")
    try:
        await handler(uuid)
        return {"ok": True}
    except RemnawaveError as exc:
        raise _502(exc, "error") from exc


@router.delete("/users/{uuid}")
async def debug_delete_user(
    uuid: str,
    request: Request,
    service: FromDishka[AdminUsersService] = None,  # type: ignore[assignment]
) -> dict:
    """Delete user without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        await service.delete_user(uuid)
        return {"ok": True}
    except RemnawaveError as exc:
        raise _502(exc, "error") from exc


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
