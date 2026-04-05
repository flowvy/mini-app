"""Debug-only routes for local development without Telegram."""

from __future__ import annotations

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Request, status

from flowvy.schemas.subscription import SubscriptionResponse
from flowvy.services.remnawave import RemnawaveError
from flowvy.services.subscription import SubscriptionService

router = APIRouter(
    prefix="/api/debug",
    tags=["debug"],
    route_class=DishkaRoute,
)


@router.get("/subscription/{telegram_id}", response_model=SubscriptionResponse)
async def debug_subscription(
    telegram_id: int,
    request: Request,
    service: FromDishka[SubscriptionService] = None,  # type: ignore[assignment]
) -> SubscriptionResponse:
    """Fetch subscription without Telegram auth. DEBUG mode only."""
    if not request.app.state.settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

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
