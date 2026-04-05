"""Subscription API routes."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, status

from flowvy.api.deps import get_current_init_data
from flowvy.schemas.subscription import SubscriptionResponse
from flowvy.services.remnawave import RemnawaveError
from flowvy.services.subscription import SubscriptionService

router = APIRouter(prefix="/api", tags=["subscription"], route_class=DishkaRoute)

CurrentInitData = Annotated[WebAppInitData, Depends(get_current_init_data)]


@router.get("/me/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    init_data: CurrentInitData,
    service: FromDishka[SubscriptionService] = None,  # type: ignore[assignment]
) -> SubscriptionResponse:
    """Return aggregated subscription data for the current user."""
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
