"""Public Telegram-authenticated onboarding routes."""

from __future__ import annotations

from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, status

from flowvy.api.deps import get_current_init_data
from flowvy.api.routes.users import build_user_response, identity_from_init_data
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.registration import (
    InviteRedeemRequest,
    OnboardingStatusResponse,
    RegistrationErrorDetail,
)
from flowvy.schemas.user import UserResponse
from flowvy.services.registration import (
    InvalidInviteError,
    InviteRateLimitError,
    InviteRequiredError,
    RegistrationError,
    RegistrationService,
    RegistrationUnavailableError,
)
from flowvy.services.user import InactiveUserError
from flowvy.telegram_main_app import referral_code_from_start_param

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"], route_class=DishkaRoute)
CurrentInitData = Annotated[WebAppInitData, Depends(get_current_init_data)]


def _registration_http_error(exc: RegistrationError) -> HTTPException:
    if isinstance(exc, InviteRateLimitError):
        http_status = status.HTTP_429_TOO_MANY_REQUESTS
    elif isinstance(exc, RegistrationUnavailableError):
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    elif isinstance(exc, InviteRequiredError):
        http_status = status.HTTP_403_FORBIDDEN
    elif isinstance(exc, InvalidInviteError):
        http_status = status.HTTP_400_BAD_REQUEST
    else:
        http_status = status.HTTP_409_CONFLICT
    return HTTPException(
        status_code=http_status,
        detail=RegistrationErrorDetail(code=exc.code, message=exc.message).model_dump(
            by_alias=True,
        ),
    )


def _inactive_user_http_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=RegistrationErrorDetail(
            code="account_disabled",
            message="User account is disabled",
        ).model_dump(by_alias=True),
    )


@router.get("", response_model=OnboardingStatusResponse)
async def get_onboarding_status(
    init_data: CurrentInitData,
    registration: FromDishka[RegistrationService],
) -> OnboardingStatusResponse:
    """Describe registration state, importing an exact provider-only identity if found."""
    try:
        onboarding = await registration.get_status(identity_from_init_data(init_data))
    except InactiveUserError as exc:
        raise _inactive_user_http_error() from exc
    except RegistrationError as exc:
        raise _registration_http_error(exc) from exc
    return onboarding.model_copy(
        update={
            "launch_invite_available": referral_code_from_start_param(init_data.start_param)
            is not None,
        },
    )


@router.post("/register", response_model=UserResponse)
async def register_open_user(
    init_data: CurrentInitData,
    registration: FromDishka[RegistrationService],
    ps_repo: FromDishka[ProviderSettingsRepository],
) -> UserResponse:
    """Register through the current open-registration policy."""
    try:
        user = await registration.register_open(identity_from_init_data(init_data))
    except InactiveUserError as exc:
        raise _inactive_user_http_error() from exc
    except RegistrationError as exc:
        raise _registration_http_error(exc) from exc
    return build_user_response(user, await ps_repo.get())


@router.post("/redeem", response_model=UserResponse)
async def redeem_invite(
    payload: InviteRedeemRequest,
    init_data: CurrentInitData,
    registration: FromDishka[RegistrationService],
    ps_repo: FromDishka[ProviderSettingsRepository],
) -> UserResponse:
    """Register through a reusable user-owned invite."""
    try:
        user = await registration.redeem(identity_from_init_data(init_data), payload.code)
    except InactiveUserError as exc:
        raise _inactive_user_http_error() from exc
    except RegistrationError as exc:
        raise _registration_http_error(exc) from exc
    return build_user_response(user, await ps_repo.get())


@router.post("/redeem-launch", response_model=UserResponse)
async def redeem_launch_invite(
    init_data: CurrentInitData,
    registration: FromDishka[RegistrationService],
    ps_repo: FromDishka[ProviderSettingsRepository],
) -> UserResponse:
    """Register from the invite carried by Telegram's validated Main Mini App initData."""
    code = referral_code_from_start_param(init_data.start_param)
    if code is None:
        raise _registration_http_error(InvalidInviteError())
    try:
        user = await registration.redeem(identity_from_init_data(init_data), code)
    except InactiveUserError as exc:
        raise _inactive_user_http_error() from exc
    except RegistrationError as exc:
        raise _registration_http_error(exc) from exc
    return build_user_response(user, await ps_repo.get())
