"""Admin settings API routes."""

from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import InputFile
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, UploadFile, status

from flowvy.api.routes.admin.deps import CurrentAdmin, CurrentAdminForm
from flowvy.media_upload import (
    EmptyMediaError,
    MediaTooLargeError,
    UploadInputFile,
    safe_media_filename,
    validate_media_size,
)
from flowvy.schemas.provider_settings import (
    BeszelTestRequest,
    BeszelTestResponse,
    KumaTestRequest,
    KumaTestResponse,
    ProviderSettingsPatch,
    ProviderSettingsResponse,
    TributeTestResponse,
    WelcomeMediaUploadResponse,
)
from flowvy.services.provider_settings import ProviderSettingsError, ProviderSettingsService

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
    try:
        return await service.update(patch)
    except ProviderSettingsError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.get("/settings/kuma/test", response_model=KumaTestResponse)
async def test_kuma(
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> KumaTestResponse:
    """Test Uptime Kuma connection using saved URL and slug."""
    return await service.test_kuma()


@router.get("/settings/beszel/test", response_model=BeszelTestResponse)
async def test_beszel(
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> BeszelTestResponse:
    """Test Beszel authentication and systems read access."""
    return await service.test_beszel()


@router.post("/settings/kuma/test", response_model=KumaTestResponse)
async def test_kuma_candidate(
    candidate: KumaTestRequest,
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> KumaTestResponse:
    """Test an unsaved Kuma URL and slug without changing settings."""
    return await service.test_kuma_candidate(candidate.url, candidate.slug)


@router.post("/settings/beszel/test", response_model=BeszelTestResponse)
async def test_beszel_candidate(
    candidate: BeszelTestRequest,
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> BeszelTestResponse:
    """Test an unsaved Beszel URL without changing settings."""
    return await service.test_beszel_candidate(candidate.url)


@router.post("/settings/tribute/test", response_model=TributeTestResponse)
async def test_tribute(
    _admin: CurrentAdmin,
    service: FromDishka[ProviderSettingsService] = None,  # type: ignore[assignment]
) -> TributeTestResponse:
    """Check configured Tribute API access with one read-only subscriptions request."""
    return await service.test_tribute()


@router.post(
    "/settings/welcome-media",
    response_model=WelcomeMediaUploadResponse,
)
async def upload_welcome_media(
    file: UploadFile,
    admin: CurrentAdminForm,
    bot: FromDishka[Bot] = None,  # type: ignore[assignment]
) -> WelcomeMediaUploadResponse:
    """Upload the configured Welcome attachment. Does NOT write to DB."""
    media_type = ALLOWED_MIME.get(file.content_type or "")
    if not media_type:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported file type")

    try:
        await validate_media_size(file, MAX_FILE_SIZE)
    except MediaTooLargeError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "File too large (max 10 MB)",
        ) from exc
    except EmptyMediaError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty") from exc

    upload: InputFile = UploadInputFile(file)
    try:
        if media_type == "animation":
            msg = await bot.send_animation(
                chat_id=admin.user.id,
                animation=upload,
            )
            file_id = msg.animation.file_id
        else:
            msg = await bot.send_photo(chat_id=admin.user.id, photo=upload)
            file_id = msg.photo[-1].file_id
    except TelegramAPIError as exc:
        logger.exception("Failed to upload configured bot-message media")
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Bot could not upload this media",
        ) from exc

    try:
        await bot.delete_message(
            chat_id=admin.user.id,
            message_id=msg.message_id,
        )
    except TelegramAPIError:
        logger.warning("Failed to delete temporary bot-message media", exc_info=True)

    return WelcomeMediaUploadResponse(
        file_id=file_id,
        file_name=safe_media_filename(file.filename),
        media_type=media_type,
    )
