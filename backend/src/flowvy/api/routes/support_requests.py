"""Authenticated in-app Support conversations and attachment intents."""

from __future__ import annotations

import uuid
from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.api.deps import get_current_active_init_data
from flowvy.schemas.support_requests import (
    CreateSupportRequestInput,
    ReplySupportRequestInput,
    SupportCapabilitiesResponse,
    SupportDownloadResponse,
    SupportRequestListResponse,
    SupportRequestResponse,
    SupportUploadIntentInput,
    SupportUploadIntentResponse,
)
from flowvy.services.support_notifications import SupportNotificationService
from flowvy.services.support_requests import (
    SupportAttachmentStorageUnavailableError,
    SupportRequestError,
    SupportRequestForbiddenError,
    SupportRequestNotFoundError,
    SupportRequestService,
)

router = APIRouter(prefix="/api/support", tags=["support"], route_class=DishkaRoute)
CurrentActiveUser = Annotated[WebAppInitData, Depends(get_current_active_init_data)]


def _support_error(exc: SupportRequestError) -> HTTPException:
    code = status.HTTP_422_UNPROCESSABLE_CONTENT
    if isinstance(exc, SupportRequestNotFoundError):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, SupportRequestForbiddenError):
        code = status.HTTP_403_FORBIDDEN
    elif isinstance(exc, SupportAttachmentStorageUnavailableError):
        code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HTTPException(code, detail={"code": exc.code, "message": str(exc)})


def _telegram_id(user: WebAppInitData) -> int:
    if user.user is None:  # pragma: no cover - guaranteed by the auth dependency
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram user is missing")
    return user.user.id


@router.get("/capabilities", response_model=SupportCapabilitiesResponse)
async def get_support_capabilities(
    _user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
) -> SupportCapabilitiesResponse:
    return service.capabilities()


@router.post("/uploads", response_model=SupportUploadIntentResponse)
async def create_support_uploads(
    payload: SupportUploadIntentInput,
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
) -> SupportUploadIntentResponse:
    try:
        return await service.create_upload_intents(_telegram_id(user), payload)
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


@router.get("/requests", response_model=SupportRequestListResponse)
async def list_support_requests(
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
) -> SupportRequestListResponse:
    try:
        return SupportRequestListResponse(requests=await service.list_requests(_telegram_id(user)))
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


@router.post(
    "/requests",
    response_model=SupportRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_support_request(
    payload: CreateSupportRequestInput,
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
    notifications: FromDishka[SupportNotificationService],
    session: FromDishka[AsyncSession],
) -> SupportRequestResponse:
    try:
        telegram_id = _telegram_id(user)
        response = await service.create_request(telegram_id, payload)
        await session.commit()
        await notifications.notify_new_request(response, actor_telegram_id=telegram_id)
        return response
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


@router.get("/requests/{request_id}", response_model=SupportRequestResponse)
async def get_support_request(
    request_id: uuid.UUID,
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
) -> SupportRequestResponse:
    try:
        return await service.get_request(request_id, _telegram_id(user))
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


@router.post("/requests/{request_id}/messages", response_model=SupportRequestResponse)
async def reply_to_support_request(
    request_id: uuid.UUID,
    payload: ReplySupportRequestInput,
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
    notifications: FromDishka[SupportNotificationService],
    session: FromDishka[AsyncSession],
) -> SupportRequestResponse:
    try:
        telegram_id = _telegram_id(user)
        response = await service.reply(request_id, telegram_id, payload)
        await session.commit()
        await notifications.notify_reply(response, actor_telegram_id=telegram_id)
        return response
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


@router.post("/requests/{request_id}/resolve", response_model=SupportRequestResponse)
async def resolve_support_request(
    request_id: uuid.UUID,
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
) -> SupportRequestResponse:
    try:
        return await service.resolve(request_id, _telegram_id(user))
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


@router.post("/requests/{request_id}/reopen", response_model=SupportRequestResponse)
async def reopen_support_request(
    request_id: uuid.UUID,
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
) -> SupportRequestResponse:
    try:
        return await service.reopen(request_id, _telegram_id(user))
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


@router.get("/attachments/{attachment_id}/download", response_model=SupportDownloadResponse)
async def download_support_attachment(
    attachment_id: uuid.UUID,
    user: CurrentActiveUser,
    service: FromDishka[SupportRequestService],
) -> SupportDownloadResponse:
    try:
        return await service.download(attachment_id, _telegram_id(user))
    except SupportRequestError as exc:
        raise _support_error(exc) from exc


__all__ = ["router"]
