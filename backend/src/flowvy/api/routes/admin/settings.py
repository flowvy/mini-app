"""Admin settings API routes."""

from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import BufferedInputFile
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, UploadFile, status

from flowvy.api.routes.admin.deps import CurrentAdmin, CurrentAdminForm
from flowvy.schemas.provider_settings import (
    KumaTestResponse,
    ProviderSettingsPatch,
    ProviderSettingsResponse,
    WelcomeMediaUploadResponse,
)
from flowvy.services.provider_settings import ProviderSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin-settings"],
    route_class=DishkaRoute,
)

ALLOWED_MIME = {
    "image/jpeg": "photo",
    "image/png": "photo",
    "image/webp": "photo",
    "image/gif": "animation",
    "video/mp4": "animation",
}
MAX_FILE_SIZE = 10 * 1024 * 1024


@router.get("/settings", response_model=ProviderSettingsResponse)
async def get_settings(
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> ProviderSettingsResponse:
    """Return current provider settings."""
    return await service.get()


@router.patch("/settings", response_model=ProviderSettingsResponse)
async def patch_settings(
    patch: ProviderSettingsPatch,
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> ProviderSettingsResponse:
    """Partial update of provider settings."""
    return await service.update(patch)


@router.get("/settings/kuma/test", response_model=KumaTestResponse)
async def test_kuma(
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> KumaTestResponse:
    """Test Uptime Kuma connection using saved URL and slug."""
    return await service.test_kuma()


@router.post(
    "/settings/welcome-media",
    response_model=WelcomeMediaUploadResponse,
)
async def upload_welcome_media(
    file: UploadFile,
    admin: CurrentAdminForm,
    bot: FromDishka[Bot] = None,  # type: ignore[assignment]
) -> WelcomeMediaUploadResponse:
    """Upload file via Bot to get file_id. Does NOT write to DB."""
    media_type = ALLOWED_MIME.get(file.content_type or "")
    if not media_type:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported file type")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large (max 10 MB)")

    buf = BufferedInputFile(data, filename=file.filename or "media")
    try:
        if media_type == "animation":
            msg = await bot.send_animation(
                chat_id=admin.user.id,
                animation=buf,
            )
            file_id = msg.animation.file_id
        else:
            msg = await bot.send_photo(chat_id=admin.user.id, photo=buf)
            file_id = msg.photo[-1].file_id
        await bot.delete_message(
            chat_id=admin.user.id,
            message_id=msg.message_id,
        )
    except TelegramAPIError as exc:
        logger.exception("Failed to upload welcome media via bot")
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Bot cannot send message to your chat: {exc}",
        ) from exc

    return WelcomeMediaUploadResponse(
        file_id=file_id,
        file_name=file.filename or "media",
        media_type=media_type,
    )
