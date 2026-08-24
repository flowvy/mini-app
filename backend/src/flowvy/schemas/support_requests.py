"""HTTP contracts for durable Support requests and optional R2 attachments."""

from __future__ import annotations

import base64
import binascii
import datetime
import re
import uuid
from typing import Literal

from pydantic import Field, field_validator, model_validator

from flowvy.schemas.base import CamelModel
from flowvy.schemas.support_articles import SupportArticleTopic

SupportRequestStatusValue = Literal["needs_reply", "waiting_user", "resolved"]
SupportAttachmentKind = Literal["image", "video", "text", "zip"]
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def _plain(value: str) -> str:
    return " ".join(value.strip().split())


class SupportRequesterResponse(CamelModel):
    id: int
    full_name: str
    username: str | None = None


class SupportAttachmentResponse(CamelModel):
    id: uuid.UUID
    name: str
    kind: SupportAttachmentKind
    size_bytes: int
    password_protected: bool = False


class SupportMessageResponse(CamelModel):
    id: uuid.UUID
    author: Literal["user", "support"]
    author_name: str
    body: str
    created_at: datetime.datetime
    attachments: list[SupportAttachmentResponse]


class SupportRequestContextResponse(CamelModel):
    subscription_status: str | None = None
    device: str | None = None
    app_version: str | None = None


class SupportRequestSummaryResponse(CamelModel):
    id: uuid.UUID
    number: int
    topic: SupportArticleTopic
    subject: str
    status: SupportRequestStatusValue
    updated_at: datetime.datetime
    last_message_preview: str
    unread_count: int = 0
    requester: SupportRequesterResponse


class SupportRequestResponse(SupportRequestSummaryResponse):
    messages: list[SupportMessageResponse]
    context: SupportRequestContextResponse


class SupportRequestListResponse(CamelModel):
    requests: list[SupportRequestSummaryResponse]


class CreateSupportRequestInput(CamelModel):
    topic: SupportArticleTopic
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=4000)
    attachment_ids: list[uuid.UUID] = Field(default_factory=list, max_length=5)
    client_platform: str | None = Field(default=None, max_length=64)

    @field_validator("subject")
    @classmethod
    def normalize_subject(cls, value: str) -> str:
        normalized = _plain(value)
        if not normalized:
            raise ValueError("Subject is required")
        return normalized

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        normalized = value.replace("\r\n", "\n").replace("\r", "\n").strip()
        if not normalized:
            raise ValueError("Message is required")
        return normalized

    @field_validator("client_platform")
    @classmethod
    def normalize_platform(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _plain(value)
        return normalized or None


class ReplySupportRequestInput(CamelModel):
    message: str = Field(min_length=1, max_length=4000)
    attachment_ids: list[uuid.UUID] = Field(default_factory=list, max_length=5)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        return CreateSupportRequestInput.normalize_message(value)


class SupportUploadFileInput(CamelModel):
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=128)
    size_bytes: int = Field(gt=0)
    checksum_sha256: str = Field(min_length=44, max_length=44)

    @field_validator("file_name")
    @classmethod
    def normalize_file_name(cls, value: str) -> str:
        normalized = value.replace("\\", "/").rsplit("/", 1)[-1].strip()
        if not normalized or _CONTROL_RE.search(normalized):
            raise ValueError("Invalid attachment file name")
        return normalized

    @field_validator("content_type")
    @classmethod
    def normalize_content_type(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("checksum_sha256")
    @classmethod
    def validate_checksum(cls, value: str) -> str:
        try:
            decoded = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Invalid SHA-256 checksum") from exc
        if len(decoded) != 32:
            raise ValueError("Invalid SHA-256 checksum")
        return value


class SupportUploadIntentInput(CamelModel):
    files: list[SupportUploadFileInput] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def validate_unique_files(self) -> SupportUploadIntentInput:
        identities = [
            (item.file_name, item.size_bytes, item.checksum_sha256) for item in self.files
        ]
        if len(set(identities)) != len(identities):
            raise ValueError("Duplicate attachment metadata")
        return self


class SupportUploadTargetResponse(CamelModel):
    id: uuid.UUID
    upload_url: str
    headers: dict[str, str]
    expires_at: datetime.datetime


class SupportUploadIntentResponse(CamelModel):
    uploads: list[SupportUploadTargetResponse]


class SupportCapabilitiesResponse(CamelModel):
    attachments_enabled: bool
    max_files: int
    max_file_bytes: int
    max_total_bytes: int
    allowed_extensions: list[str]
    attachment_retention_days: int
    request_retention_days: int


class SupportStorageAdminResponse(SupportCapabilitiesResponse):
    configured: bool
    bucket_name: str | None = None
    endpoint: str | None = None
    required_environment: list[str]


class SupportStorageTestResponse(CamelModel):
    ok: bool
    error_code: str | None = None


class SupportDownloadResponse(CamelModel):
    url: str
    expires_at: datetime.datetime
    file_name: str


__all__ = [
    "CreateSupportRequestInput",
    "ReplySupportRequestInput",
    "SupportAttachmentKind",
    "SupportAttachmentResponse",
    "SupportCapabilitiesResponse",
    "SupportDownloadResponse",
    "SupportMessageResponse",
    "SupportRequestContextResponse",
    "SupportRequestListResponse",
    "SupportRequestResponse",
    "SupportRequestSummaryResponse",
    "SupportStorageAdminResponse",
    "SupportStorageTestResponse",
    "SupportUploadFileInput",
    "SupportUploadIntentInput",
    "SupportUploadIntentResponse",
    "SupportUploadTargetResponse",
]
