"""User API routes."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, Request, status

from flowvy.api.deps import get_current_init_data
from flowvy.models.provider_settings import ProviderSettings
from flowvy.models.user import User
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.registration import UserInviteResponse
from flowvy.schemas.user import BrandingResponse, FeaturesResponse, UserResponse
from flowvy.services.registration import (
    RegistrationIdentity,
    RegistrationRequiredError,
    RegistrationService,
    RegistrationUnavailableError,
)
from flowvy.services.user import InactiveUserError
from flowvy.telegram_main_app import TelegramMainApp

router = APIRouter(prefix="/api", tags=["users"], route_class=DishkaRoute)

CurrentInitData = Annotated[WebAppInitData, Depends(get_current_init_data)]


def identity_from_init_data(init_data: WebAppInitData) -> RegistrationIdentity:
    """Convert validated Telegram data into the shared registration identity."""
    tg_user = init_data.user
    full_name = tg_user.first_name
    if tg_user.last_name:
        full_name = f"{tg_user.first_name} {tg_user.last_name}"
    return RegistrationIdentity(
        telegram_id=tg_user.id,
        username=tg_user.username,
        full_name=full_name,
    )


def build_user_response(user: User, settings: ProviderSettings) -> UserResponse:
    """Present one local user with provider-neutral feature and branding flags."""
    response = UserResponse.model_validate(user)
    response.features = FeaturesResponse(pulse=settings.pulse_provider != "disabled")
    response.branding = BrandingResponse(
        app_name=settings.app_name,
        logo_url=settings.logo_url,
    )
    return response


def build_user_invite_response(
    invite: UserInviteResponse,
    main_app: TelegramMainApp,
) -> UserInviteResponse:
    """Attach a referral link only when Telegram confirms the Main Mini App capability."""
    return invite.model_copy(
        update={
            "referral_url": main_app.referral_url(invite.code),
            "referral_status": main_app.status,
        },
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    init_data: CurrentInitData,
    registration: FromDishka[RegistrationService] = None,  # type: ignore[assignment]
    ps_repo: FromDishka[ProviderSettingsRepository] = None,  # type: ignore[assignment]
) -> UserResponse:
    """Return the current authenticated user with feature flags."""
    identity = identity_from_init_data(init_data)
    ps = await ps_repo.get()
    try:
        user = await registration.resolve_existing(identity)
        if user is None:
            user = await registration.bootstrap_admin(identity)
    except InactiveUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "account_disabled", "message": "User account is disabled"},
        ) from exc
    except RegistrationRequiredError as exc:
        code = (
            "invite_required" if ps.registration_mode == "invite_only" else "registration_required"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": code, "message": "Registration is required"},
        ) from exc
    except RegistrationUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return build_user_response(user, ps)


@router.get("/me/invite", response_model=UserInviteResponse)
async def get_my_invite(
    init_data: CurrentInitData,
    request: Request,
    registration: FromDishka[RegistrationService] = None,  # type: ignore[assignment]
) -> UserInviteResponse:
    """Return the current user's reusable code and direct referral count."""
    try:
        invite = await registration.get_user_invite(identity_from_init_data(init_data))
        return build_user_invite_response(invite, request.app.state.telegram_main_app)
    except InactiveUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "account_disabled", "message": "User account is disabled"},
        ) from exc
    except RegistrationRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
