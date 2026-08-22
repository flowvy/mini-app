"""Bounded welcome-media upload tests."""

from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.exceptions import TelegramAPIError
from fastapi import HTTPException, UploadFile

from flowvy.api.routes.admin.settings import (
    MAX_FILE_SIZE,
    upload_invite_share_media,
    upload_welcome_media,
)
from flowvy.media_upload import (
    EmptyMediaError,
    MediaTooLargeError,
    UploadInputFile,
    safe_media_filename,
    validate_media_size,
)


def _upload(
    content: bytes,
    *,
    size: int | None = None,
    filename: str = "welcome.png",
    content_type: str = "image/png",
) -> UploadFile:
    return UploadFile(
        BytesIO(content),
        size=len(content) if size is None else size,
        filename=filename,
        headers={"content-type": content_type},
    )


@pytest.mark.asyncio
async def test_size_scan_rejects_untrusted_smaller_metadata() -> None:
    upload = _upload(b"12345", size=1)
    with pytest.raises(MediaTooLargeError):
        await validate_media_size(upload, 4)


@pytest.mark.asyncio
async def test_size_scan_rejects_empty_file() -> None:
    with pytest.raises(EmptyMediaError):
        await validate_media_size(_upload(b""), 10)


@pytest.mark.asyncio
async def test_upload_input_file_streams_original_spooled_file() -> None:
    content = b"a" * (128 * 1024 + 7)
    upload = _upload(content, filename="../folder\\welcome.png")
    assert await validate_media_size(upload, len(content)) == len(content)

    input_file = UploadInputFile(upload)
    chunks = [chunk async for chunk in input_file.read(MagicMock())]

    assert b"".join(chunks) == content
    assert max(map(len, chunks)) <= 64 * 1024
    assert input_file.filename == "welcome.png"


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("../../photo.png", "photo.png"),
        ("..\\photo.png", "photo.png"),
        ("bad\x00name.png", "bad_name.png"),
        ("", "media"),
    ],
)
def test_provider_filename_is_sanitized(filename: str, expected: str) -> None:
    assert safe_media_filename(filename) == expected


@pytest.mark.asyncio
async def test_declared_oversize_is_rejected_before_bot_call() -> None:
    bot = AsyncMock()
    admin = SimpleNamespace(user=SimpleNamespace(id=123))
    upload = _upload(b"x", size=MAX_FILE_SIZE + 1)

    with pytest.raises(HTTPException) as exc_info:
        await upload_welcome_media(upload, admin, bot)

    assert exc_info.value.status_code == 400
    bot.send_photo.assert_not_awaited()


@pytest.mark.asyncio
async def test_route_streams_valid_photo_then_deletes_temporary_message() -> None:
    bot = AsyncMock()
    admin = SimpleNamespace(user=SimpleNamespace(id=123))
    content = b"image-content"
    upload = _upload(content)

    async def send_photo(*, chat_id: int, photo: UploadInputFile):
        assert chat_id == 123
        assert b"".join([chunk async for chunk in photo.read(bot)]) == content
        return SimpleNamespace(
            message_id=77,
            photo=[SimpleNamespace(file_id="telegram-file-id")],
        )

    bot.send_photo = AsyncMock(side_effect=send_photo)

    result = await upload_welcome_media(upload, admin, bot)

    assert result.file_id == "telegram-file-id"
    assert result.file_name == "welcome.png"
    assert result.media_type == "photo"
    bot.delete_message.assert_awaited_once_with(chat_id=123, message_id=77)


@pytest.mark.asyncio
async def test_provider_error_is_generic() -> None:
    bot = AsyncMock()
    admin = SimpleNamespace(user=SimpleNamespace(id=123))
    provider_error = TelegramAPIError(MagicMock(), "private provider detail")
    bot.send_photo = AsyncMock(side_effect=provider_error)

    with pytest.raises(HTTPException) as exc_info:
        await upload_welcome_media(_upload(b"image"), admin, bot)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Bot could not upload this media"
    assert "private provider detail" not in exc_info.value.detail


@pytest.mark.asyncio
async def test_delete_failure_keeps_successful_file_id() -> None:
    bot = AsyncMock()
    admin = SimpleNamespace(user=SimpleNamespace(id=123))
    bot.send_photo = AsyncMock(
        return_value=SimpleNamespace(
            message_id=77,
            photo=[SimpleNamespace(file_id="telegram-file-id")],
        )
    )
    bot.delete_message = AsyncMock(side_effect=TelegramAPIError(MagicMock(), "delete failed"))

    result = await upload_welcome_media(_upload(b"image"), admin, bot)

    assert result.file_id == "telegram-file-id"


@pytest.mark.asyncio
async def test_invite_share_mp4_is_uploaded_as_video() -> None:
    bot = AsyncMock()
    admin = SimpleNamespace(user=SimpleNamespace(id=123))
    bot.send_video.return_value = SimpleNamespace(
        message_id=78,
        video=SimpleNamespace(file_id="telegram-video-id"),
    )

    result = await upload_invite_share_media(
        _upload(b"video", filename="invite.mp4", content_type="video/mp4"),
        admin,
        bot,
    )

    assert result.media_type == "video"
    assert result.file_id == "telegram-video-id"
    bot.send_video.assert_awaited_once()
    bot.delete_message.assert_awaited_once_with(chat_id=123, message_id=78)
