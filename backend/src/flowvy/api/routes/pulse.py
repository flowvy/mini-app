"""Pulse (Uptime Kuma status) API route."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, status

from flowvy.api.deps import get_current_init_data
from flowvy.schemas.pulse import PulseResponse
from flowvy.services.kuma import KumaError
from flowvy.services.pulse import PulseService

router = APIRouter(prefix="/api", tags=["pulse"], route_class=DishkaRoute)

CurrentInitData = Annotated[WebAppInitData, Depends(get_current_init_data)]


@router.get("/pulse", response_model=PulseResponse)
async def get_pulse(
    _init_data: CurrentInitData,
    service: FromDishka[PulseService] = None,  # type: ignore[assignment]
) -> PulseResponse:
    """Return aggregated Uptime Kuma status page data."""
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
