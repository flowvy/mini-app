"""Bounded streaming adapter from FastAPI uploads to aiogram InputFile."""

from __future__ import annotations

import re
from collections.abc import AsyncGenerator

from aiogram import Bot
from aiogram.types import InputFile
from fastapi import UploadFile

UPLOAD_CHUNK_SIZE = 64 * 1024


class MediaUploadError(ValueError):
    """Base error for media that must not be sent to Telegram."""


class MediaTooLargeError(MediaUploadError):
    """Raised before provider upload when the local byte limit is exceeded."""


class EmptyMediaError(MediaUploadError):
    """Raised before provider upload for an empty file."""


def safe_media_filename(value: str | None) -> str:
    """Strip paths/control characters from the provider-facing filename."""
    filename = (value or "media").replace("\\", "/").rsplit("/", 1)[-1]
    filename = re.sub(r"[\x00-\x1f\x7f]", "_", filename).strip()
    return filename[:255] or "media"


async def validate_media_size(upload: UploadFile, max_bytes: int) -> int:
    """Scan a spooled UploadFile without creating a second in-memory copy."""
    if upload.size is not None and upload.size > max_bytes:
        raise MediaTooLargeError

    await upload.seek(0)
    total = 0
    while chunk := await upload.read(UPLOAD_CHUNK_SIZE):
        if total + len(chunk) > max_bytes:
            raise MediaTooLargeError
        total += len(chunk)
    await upload.seek(0)
    if total == 0:
        raise EmptyMediaError
    return total


class UploadInputFile(InputFile):
    """Stream an already validated Starlette spooled upload to aiogram."""

    def __init__(self, upload: UploadFile) -> None:
        super().__init__(
            filename=safe_media_filename(upload.filename),
            chunk_size=UPLOAD_CHUNK_SIZE,
        )
        self._upload = upload

    async def read(self, bot: Bot) -> AsyncGenerator[bytes, None]:
        """Yield bounded chunks for aiogram's multipart encoder."""
        await self._upload.seek(0)
        while chunk := await self._upload.read(self.chunk_size):
            yield chunk
