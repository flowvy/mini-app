"""Authenticated user sponsor state and provider checkout hand-off."""

from __future__ import annotations

import uuid
from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, Request, status

from flowvy.api.deps import get_current_active_init_data
from flowvy.api.locale import request_locale
from flowvy.schemas.commerce import (
    SponsorCheckoutRequest,
    SponsorCheckoutResponse,
    SponsorStateResponse,
)
from flowvy.services.sponsor import (
    SponsorCheckoutConflictError,
    SponsorOfferError,
    SponsorStateService,
)

router = APIRouter(prefix="/api/me/sponsor", tags=["sponsor"], route_class=DishkaRoute)
CurrentInitData = Annotated[WebAppInitData, Depends(get_current_active_init_data)]


@router.get("", response_model=SponsorStateResponse)
async def get_sponsor_state(
    request: Request,
    init_data: CurrentInitData,
    service: FromDishka[SponsorStateService],
) -> SponsorStateResponse:
    """Return local server-computed billing state without calling a payment provider."""
    return await service.get_state(init_data.user.id, request_locale(request))


@router.post(
    "/checkouts",
    response_model=SponsorCheckoutResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_sponsor_checkout(
    payload: SponsorCheckoutRequest,
    init_data: CurrentInitData,
    service: FromDishka[SponsorStateService],
) -> SponsorCheckoutResponse:
    """Record a local redirect intent; only a signed webhook can confirm payment."""
    try:
        return await service.start_checkout(init_data.user.id, payload.offer_id)
    except SponsorCheckoutConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except SponsorOfferError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.delete("/checkouts/{checkout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def abandon_sponsor_checkout(
    checkout_id: uuid.UUID,
    init_data: CurrentInitData,
    service: FromDishka[SponsorStateService],
) -> None:
    """Stop waiting for an owned local redirect attempt; never mutate Tribute."""
    try:
        await service.abandon_checkout(init_data.user.id, checkout_id)
    except SponsorOfferError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


__all__ = ["router"]
