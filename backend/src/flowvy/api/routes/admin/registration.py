"""Admin registration policy and access-profile routes."""

from __future__ import annotations

import uuid

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status

from flowvy.api.routes.admin.deps import CurrentAdmin
from flowvy.schemas.registration import (
    AccessProfileInput,
    AccessProfileResponse,
    RegistrationOptionsResponse,
    RegistrationSettingsPatch,
    RegistrationSettingsResponse,
)
from flowvy.services.registration import RegistrationAdminError, RegistrationAdminService
from flowvy.services.remnawave import RemnawaveError

router = APIRouter(
    prefix="/api/admin/registration",
    tags=["admin-registration"],
    route_class=DishkaRoute,
)


def _admin_error(exc: Exception) -> HTTPException:
    if isinstance(exc, RemnawaveError):
        return HTTPException(status.HTTP_502_BAD_GATEWAY, "Remnawave unavailable")
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))


@router.get("", response_model=RegistrationSettingsResponse)
async def get_registration_settings(
    _admin: CurrentAdmin,
    service: FromDishka[RegistrationAdminService],
) -> RegistrationSettingsResponse:
    return await service.get_settings()


@router.patch("", response_model=RegistrationSettingsResponse)
async def patch_registration_settings(
    payload: RegistrationSettingsPatch,
    _admin: CurrentAdmin,
    service: FromDishka[RegistrationAdminService],
) -> RegistrationSettingsResponse:
    try:
        return await service.update_settings(payload)
    except RegistrationAdminError as exc:
        raise _admin_error(exc) from exc


@router.get("/options", response_model=RegistrationOptionsResponse)
async def get_registration_options(
    _admin: CurrentAdmin,
    service: FromDishka[RegistrationAdminService],
) -> RegistrationOptionsResponse:
    try:
        return await service.get_options()
    except RemnawaveError as exc:
        raise _admin_error(exc) from exc


@router.get("/access-profiles", response_model=list[AccessProfileResponse])
async def list_access_profiles(
    _admin: CurrentAdmin,
    service: FromDishka[RegistrationAdminService],
) -> list[AccessProfileResponse]:
    return await service.list_profiles()


@router.post(
    "/access-profiles",
    response_model=AccessProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_access_profile(
    payload: AccessProfileInput,
    admin: CurrentAdmin,
    service: FromDishka[RegistrationAdminService],
) -> AccessProfileResponse:
    try:
        return await service.create_profile(payload, admin.user.id)
    except (RegistrationAdminError, RemnawaveError) as exc:
        raise _admin_error(exc) from exc


@router.put("/access-profiles/{profile_id}", response_model=AccessProfileResponse)
async def update_access_profile(
    profile_id: uuid.UUID,
    payload: AccessProfileInput,
    _admin: CurrentAdmin,
    service: FromDishka[RegistrationAdminService],
) -> AccessProfileResponse:
    try:
        return await service.update_profile(profile_id, payload)
    except (RegistrationAdminError, RemnawaveError) as exc:
        raise _admin_error(exc) from exc


@router.delete("/access-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_access_profile(
    profile_id: uuid.UUID,
    _admin: CurrentAdmin,
    service: FromDishka[RegistrationAdminService],
) -> None:
    try:
        await service.deactivate_profile(profile_id)
    except RegistrationAdminError as exc:
        raise _admin_error(exc) from exc
