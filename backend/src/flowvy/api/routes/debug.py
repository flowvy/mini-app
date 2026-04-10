"""Debug-only routes for local development without Telegram."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Request, status

from flowvy.schemas.devices import DevicesResponse
from flowvy.schemas.pulse import PulseResponse
from flowvy.schemas.subscription import SubscriptionResponse
from flowvy.services.devices import DevicesService
from flowvy.services.pulse import PulseService
from flowvy.services.remnawave import RemnawaveError
from flowvy.services.subscription import SubscriptionService

router = APIRouter(
    prefix="/api/debug",
    tags=["debug"],
    route_class=DishkaRoute,
)


def check_debug(request: Request) -> None:
    """Raise 404 if debug mode is disabled."""
    if not request.app.state.settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


@router.get("/subscription/{telegram_id}", response_model=SubscriptionResponse)
async def debug_subscription(
    telegram_id: int,
    request: Request,
    service: FromDishka[SubscriptionService] = None,  # type: ignore[assignment]
) -> SubscriptionResponse:
    """Fetch subscription without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        result = await service.get_for_user(telegram_id)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscription found for this telegram_id",
        )
    return result


@router.get("/empty-devices", response_model=DevicesResponse)
async def debug_devices_empty(request: Request) -> DevicesResponse:
    """Return empty devices list for visual testing. DEBUG only."""
    check_debug(request)
    return DevicesResponse(devices=[], total=0, limit=5)


@router.get("/devices/{telegram_id}", response_model=DevicesResponse)
async def debug_devices(
    telegram_id: int,
    request: Request,
    service: FromDishka[DevicesService] = None,  # type: ignore[assignment]
) -> DevicesResponse:
    """Fetch devices without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        result = await service.get_for_user(telegram_id)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscription found for this telegram_id",
        )
    return result


@router.delete(
    "/devices/{telegram_id}/{hwid}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def debug_delete_device(
    telegram_id: int,
    hwid: str,
    request: Request,
    service: FromDishka[DevicesService] = None,  # type: ignore[assignment]
) -> None:
    """Delete a single device without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        await service.delete_device(telegram_id, hwid)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc


@router.delete(
    "/devices/{telegram_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def debug_delete_all_devices(
    telegram_id: int,
    request: Request,
    service: FromDishka[DevicesService] = None,  # type: ignore[assignment]
) -> None:
    """Delete all devices without Telegram auth. DEBUG mode only."""
    check_debug(request)
    try:
        await service.delete_all(telegram_id)
    except RemnawaveError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Remnawave unavailable: {exc.detail}",
        ) from exc


@router.get("/pulse", response_model=PulseResponse)
async def debug_pulse(
    request: Request,
    service: FromDishka[PulseService] = None,  # type: ignore[assignment]
) -> PulseResponse:
    """Fetch pulse data without Telegram auth. DEBUG mode only."""
    check_debug(request)
    from flowvy.services.kuma import KumaError

    try:
        result = await service.get_pulse()
    except KumaError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Status page unavailable: {exc.detail}",
        ) from exc
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pulse is not enabled",
        )
    return result
