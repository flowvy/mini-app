"""Devices API routes."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, status

from flowvy.api.deps import get_current_init_data
from flowvy.schemas.devices import DevicesResponse
from flowvy.services.devices import DevicesService
from flowvy.services.remnawave import RemnawaveError

router = APIRouter(prefix="/api", tags=["devices"], route_class=DishkaRoute)

CurrentInitData = Annotated[WebAppInitData, Depends(get_current_init_data)]


@router.get("/me/devices", response_model=DevicesResponse)
async def get_my_devices(
    init_data: CurrentInitData,
    service: FromDishka[DevicesService] = None,  # type: ignore[assignment]
) -> DevicesResponse:
    """Return devices for the current user."""
    try:
        result = await service.get_for_user(init_data.user.id)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found",
        )

    return result


@router.delete("/me/devices/{hwid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_device(
    hwid: str,
    init_data: CurrentInitData,
    service: FromDishka[DevicesService] = None,  # type: ignore[assignment]
) -> None:
    """Delete a single device by HWID."""
    try:
        await service.delete_device(init_data.user.id, hwid)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc


@router.delete("/me/devices", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_my_devices(
    init_data: CurrentInitData,
    service: FromDishka[DevicesService] = None,  # type: ignore[assignment]
) -> None:
    """Delete all devices for the current user."""
    try:
        await service.delete_all(init_data.user.id)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc
