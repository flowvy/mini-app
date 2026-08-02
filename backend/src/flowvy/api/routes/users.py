"""User API routes."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, status

from flowvy.api.deps import get_current_init_data
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.user import BrandingResponse, FeaturesResponse, UserResponse
from flowvy.services.user import InactiveUserError, UserService

router = APIRouter(prefix="/api", tags=["users"], route_class=DishkaRoute)

CurrentInitData = Annotated[WebAppInitData, Depends(get_current_init_data)]


@router.get("/me", response_model=UserResponse)
async def get_me(
    init_data: CurrentInitData,
    user_service: FromDishka[UserService] = None,  # type: ignore[assignment]
    ps_repo: FromDishka[ProviderSettingsRepository] = None,  # type: ignore[assignment]
) -> UserResponse:
    """Return the current authenticated user with feature flags."""
    tg_user = init_data.user
    full_name = tg_user.first_name
    if tg_user.last_name:
        full_name = f"{tg_user.first_name} {tg_user.last_name}"

    try:
        user = await user_service.get_or_create(
            telegram_id=tg_user.id,
            username=tg_user.username,
            full_name=full_name,
        )
    except InactiveUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        ) from exc
    ps = await ps_repo.get()
    response = UserResponse.model_validate(user)
    response.features = FeaturesResponse(pulse=ps.pulse_provider != "disabled")
    response.branding = BrandingResponse(
        app_name=ps.app_name,
        logo_url=ps.logo_url,
    )
    return response
