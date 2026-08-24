"""Durable in-app Support conversations and private attachment intents."""

from __future__ import annotations

import datetime
import pathlib
import uuid
from dataclasses import dataclass

from flowvy.config import Settings
from flowvy.models.support_request import (
    SupportAttachment,
    SupportAttachmentStatus,
    SupportMessage,
    SupportMessageAuthor,
    SupportRequest,
    SupportRequestStatus,
)
from flowvy.models.user import User, UserRole
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.support_request import (
    SupportAttachmentRepository,
    SupportMessageRepository,
    SupportRequestRepository,
)
from flowvy.repositories.user import UserRepository
from flowvy.schemas.support_requests import (
    CreateSupportRequestInput,
    ReplySupportRequestInput,
    SupportAttachmentResponse,
    SupportCapabilitiesResponse,
    SupportDownloadResponse,
    SupportMessageResponse,
    SupportRequestContextResponse,
    SupportRequesterResponse,
    SupportRequestResponse,
    SupportRequestSummaryResponse,
    SupportStorageAdminResponse,
    SupportStorageTestResponse,
    SupportUploadFileInput,
    SupportUploadIntentInput,
    SupportUploadIntentResponse,
    SupportUploadTargetResponse,
)
from flowvy.services.r2_storage import (
    R2ObjectNotFoundError,
    R2Storage,
    R2StorageUnavailableError,
    support_download_expiry,
)

_MAX_FILES = 5
_ALLOWED_FILES: dict[str, tuple[str, frozenset[str]]] = {
    ".jpg": ("image", frozenset({"image/jpeg"})),
    ".jpeg": ("image", frozenset({"image/jpeg"})),
    ".png": ("image", frozenset({"image/png"})),
    ".webp": ("image", frozenset({"image/webp"})),
    ".heic": ("image", frozenset({"image/heic"})),
    ".heif": ("image", frozenset({"image/heif"})),
    ".mp4": ("video", frozenset({"video/mp4"})),
    ".mov": ("video", frozenset({"video/quicktime"})),
    ".webm": ("video", frozenset({"video/webm"})),
    ".m4v": ("video", frozenset({"video/mp4", "video/x-m4v"})),
    ".txt": ("text", frozenset({"text/plain"})),
    ".zip": ("zip", frozenset({"application/zip", "application/x-zip-compressed"})),
}


class SupportRequestError(Exception):
    code = "support_request_invalid"


class SupportRequestNotFoundError(SupportRequestError):
    code = "support_request_not_found"


class SupportRequestForbiddenError(SupportRequestError):
    code = "support_request_forbidden"


class SupportAttachmentError(SupportRequestError):
    code = "support_attachment_invalid"


class SupportAttachmentStorageUnavailableError(SupportRequestError):
    code = "support_attachment_storage_unavailable"


@dataclass(frozen=True, slots=True)
class _Actor:
    user: User
    is_admin: bool


class SupportRequestService:
    def __init__(
        self,
        requests: SupportRequestRepository,
        messages: SupportMessageRepository,
        attachments: SupportAttachmentRepository,
        users: UserRepository,
        subscriptions: SubscriptionRepository,
        storage: R2Storage,
        settings: Settings,
    ) -> None:
        self._requests = requests
        self._messages = messages
        self._attachments = attachments
        self._users = users
        self._subscriptions = subscriptions
        self._storage = storage
        self._settings = settings

    def capabilities(self) -> SupportCapabilitiesResponse:
        return SupportCapabilitiesResponse(
            attachments_enabled=self._storage.configured,
            max_files=_MAX_FILES,
            max_file_bytes=self._settings.support_attachment_max_file_bytes,
            max_total_bytes=self._settings.support_attachment_max_total_bytes,
            allowed_extensions=list(_ALLOWED_FILES),
            attachment_retention_days=self._settings.support_attachment_retention_days,
            request_retention_days=self._settings.support_request_retention_days,
        )

    def storage_status(self) -> SupportStorageAdminResponse:
        capabilities = self.capabilities()
        return SupportStorageAdminResponse(
            **capabilities.model_dump(),
            configured=self._storage.configured,
            bucket_name=self._settings.r2_bucket_name or None,
            endpoint=self._settings.r2_endpoint,
            required_environment=[
                "R2_ACCOUNT_ID",
                "R2_BUCKET_NAME",
                "R2_ACCESS_KEY_ID",
                "R2_SECRET_ACCESS_KEY",
            ],
        )

    async def test_storage(self) -> SupportStorageTestResponse:
        if not self._storage.configured:
            return SupportStorageTestResponse(ok=False, error_code="r2_not_configured")
        try:
            ok = await self._storage.check()
        except R2StorageUnavailableError:
            ok = False
        return SupportStorageTestResponse(
            ok=ok,
            error_code=None if ok else "r2_unreachable",
        )

    async def list_requests(self, telegram_id: int) -> list[SupportRequestSummaryResponse]:
        actor = await self._actor(telegram_id)
        requests = (
            await self._requests.list_all_recent()
            if actor.is_admin
            else await self._requests.list_for_user(actor.user.id)
        )
        return [self._summary_response(item) for item in requests]

    async def get_request(self, request_id: uuid.UUID, telegram_id: int) -> SupportRequestResponse:
        request = await self._owned_request(request_id, telegram_id)
        return self._detail_response(request)

    async def create_upload_intents(
        self,
        telegram_id: int,
        payload: SupportUploadIntentInput,
    ) -> SupportUploadIntentResponse:
        actor = await self._actor(telegram_id)
        if not self._storage.configured:
            raise SupportAttachmentStorageUnavailableError("Attachment storage is not configured")
        self._validate_files(payload.files)
        now = datetime.datetime.now(datetime.UTC)
        pending_until = now + datetime.timedelta(
            seconds=self._settings.support_pending_upload_ttl_seconds
        )
        upload_until = now + datetime.timedelta(
            seconds=self._settings.support_upload_url_ttl_seconds
        )
        uploads: list[SupportUploadTargetResponse] = []
        for item in payload.files:
            attachment_id = uuid.uuid4()
            extension = pathlib.PurePath(item.file_name).suffix.lower()
            kind = _ALLOWED_FILES[extension][0]
            key = f"support/objects/{actor.user.id}/{attachment_id}"
            attachment = await self._attachments.create(
                id=attachment_id,
                owner_id=actor.user.id,
                original_filename=item.file_name,
                kind=kind,
                content_type=item.content_type,
                size_bytes=item.size_bytes,
                checksum_sha256=item.checksum_sha256,
                object_key=key,
                status=SupportAttachmentStatus.PENDING,
                password_protected=False,
                upload_expires_at=pending_until,
            )
            try:
                url, headers = self._storage.presign_upload(
                    key=key,
                    content_type=item.content_type,
                    checksum_sha256=item.checksum_sha256,
                    expires_seconds=self._settings.support_upload_url_ttl_seconds,
                )
            except R2StorageUnavailableError as exc:
                raise SupportAttachmentStorageUnavailableError(
                    "Attachment storage is unavailable"
                ) from exc
            uploads.append(
                SupportUploadTargetResponse(
                    id=attachment.id,
                    upload_url=url,
                    headers=headers,
                    expires_at=upload_until,
                )
            )
        return SupportUploadIntentResponse(uploads=uploads)

    async def create_request(
        self,
        telegram_id: int,
        payload: CreateSupportRequestInput,
    ) -> SupportRequestResponse:
        actor = await self._actor(telegram_id)
        now = datetime.datetime.now(datetime.UTC)
        attachments = await self._verified_pending(
            payload.attachment_ids,
            actor.user.id,
            now,
        )
        subscriptions = await self._subscriptions.get_by_user_id(actor.user.id)
        subscription_status = next(
            (str(item.status) for item in subscriptions if str(item.status) == "active"),
            str(subscriptions[0].status) if subscriptions else None,
        )
        request = await self._requests.create(
            user_id=actor.user.id,
            topic=payload.topic,
            subject=payload.subject,
            status=SupportRequestStatus.NEEDS_REPLY,
            context={
                "subscription_status": subscription_status,
                "device": payload.client_platform,
                "app_version": self._settings.version,
            },
            last_activity_at=now,
            expires_at=self._request_expiry(now),
        )
        message = await self._messages.create(
            request_id=request.id,
            author_id=actor.user.id,
            author_role=SupportMessageAuthor.USER,
            author_name=actor.user.full_name,
            body=payload.message,
        )
        await self._attach(message, attachments)
        return self._detail_response(await self._reload(request.id))

    async def reply(
        self,
        request_id: uuid.UUID,
        telegram_id: int,
        payload: ReplySupportRequestInput,
    ) -> SupportRequestResponse:
        request, actor = await self._owned_request_with_actor(request_id, telegram_id)
        now = datetime.datetime.now(datetime.UTC)
        attachments = await self._verified_pending(
            payload.attachment_ids,
            actor.user.id,
            now,
        )
        author_role = SupportMessageAuthor.SUPPORT if actor.is_admin else SupportMessageAuthor.USER
        message = await self._messages.create(
            request_id=request.id,
            author_id=actor.user.id,
            author_role=author_role,
            author_name=actor.user.full_name,
            body=payload.message,
        )
        await self._attach(message, attachments)
        self._clear_attachment_deletion(request)
        await self._requests.update(
            request,
            status=(
                SupportRequestStatus.WAITING_USER
                if actor.is_admin
                else SupportRequestStatus.NEEDS_REPLY
            ),
            resolved_at=None,
            last_activity_at=now,
            expires_at=self._request_expiry(now),
        )
        return self._detail_response(await self._reload(request.id))

    async def resolve(self, request_id: uuid.UUID, telegram_id: int) -> SupportRequestResponse:
        request = await self._owned_request(request_id, telegram_id)
        now = datetime.datetime.now(datetime.UTC)
        delete_after = now + datetime.timedelta(
            days=self._settings.support_attachment_retention_days
        )
        for message in request.messages:
            for attachment in message.attachments:
                if attachment.status == SupportAttachmentStatus.ATTACHED:
                    attachment.delete_after = delete_after
        await self._requests.update(
            request,
            status=SupportRequestStatus.RESOLVED,
            resolved_at=now,
            last_activity_at=now,
            expires_at=self._request_expiry(now),
        )
        return self._detail_response(await self._reload(request.id))

    async def reopen(self, request_id: uuid.UUID, telegram_id: int) -> SupportRequestResponse:
        request = await self._owned_request(request_id, telegram_id)
        now = datetime.datetime.now(datetime.UTC)
        self._clear_attachment_deletion(request)
        await self._requests.update(
            request,
            status=SupportRequestStatus.NEEDS_REPLY,
            resolved_at=None,
            last_activity_at=now,
            expires_at=self._request_expiry(now),
        )
        return self._detail_response(await self._reload(request.id))

    async def download(
        self,
        attachment_id: uuid.UUID,
        telegram_id: int,
    ) -> SupportDownloadResponse:
        actor = await self._actor(telegram_id)
        attachment = await self._attachments.get_available(attachment_id)
        if attachment is None or attachment.object_key is None:
            raise SupportRequestNotFoundError("Attachment was not found")
        if not actor.is_admin and attachment.owner_id != actor.user.id:
            raise SupportRequestForbiddenError("Attachment access is forbidden")
        seconds, expires_at = support_download_expiry()
        try:
            url = self._storage.presign_download(
                key=attachment.object_key,
                file_name=attachment.original_filename,
                expires_seconds=seconds,
            )
        except R2StorageUnavailableError as exc:
            raise SupportAttachmentStorageUnavailableError(
                "Attachment storage is unavailable"
            ) from exc
        return SupportDownloadResponse(
            url=url,
            expires_at=expires_at,
            file_name=attachment.original_filename,
        )

    async def _actor(self, telegram_id: int) -> _Actor:
        user = await self._users.get_by_telegram_id(telegram_id)
        if user is None or not user.is_active:
            raise SupportRequestForbiddenError("Active user account required")
        return _Actor(
            user=user,
            is_admin=(
                user.role == UserRole.ADMIN and telegram_id in self._settings.admin_telegram_ids
            ),
        )

    async def _owned_request(
        self,
        request_id: uuid.UUID,
        telegram_id: int,
    ) -> SupportRequest:
        request, _actor = await self._owned_request_with_actor(request_id, telegram_id)
        return request

    async def _owned_request_with_actor(
        self,
        request_id: uuid.UUID,
        telegram_id: int,
    ) -> tuple[SupportRequest, _Actor]:
        actor = await self._actor(telegram_id)
        request = await self._requests.get_complete(request_id)
        if request is None:
            raise SupportRequestNotFoundError("Support request was not found")
        if not actor.is_admin and request.user_id != actor.user.id:
            raise SupportRequestForbiddenError("Support request access is forbidden")
        return request, actor

    async def _verified_pending(
        self,
        attachment_ids: list[uuid.UUID],
        owner_id: int,
        now: datetime.datetime,
    ) -> list[SupportAttachment]:
        if not attachment_ids:
            return []
        if not self._storage.configured:
            raise SupportAttachmentStorageUnavailableError("Attachment storage is not configured")
        if len(set(attachment_ids)) != len(attachment_ids):
            raise SupportAttachmentError("Attachment IDs must be unique")
        attachments = await self._attachments.get_pending_for_owner(
            attachment_ids,
            owner_id,
            now,
        )
        if len(attachments) != len(attachment_ids):
            raise SupportAttachmentError("Attachment intent is missing or expired")
        by_id = {item.id: item for item in attachments}
        ordered = [by_id[attachment_id] for attachment_id in attachment_ids]
        for attachment in ordered:
            if attachment.object_key is None:
                raise SupportAttachmentError("Attachment object is unavailable")
            try:
                metadata = await self._storage.head(attachment.object_key)
            except R2ObjectNotFoundError as exc:
                raise SupportAttachmentError("Attachment upload is incomplete") from exc
            except R2StorageUnavailableError as exc:
                raise SupportAttachmentStorageUnavailableError(
                    "Attachment storage is unavailable"
                ) from exc
            if (
                metadata.size_bytes != attachment.size_bytes
                or metadata.content_type != attachment.content_type
                or metadata.checksum_sha256 != attachment.checksum_sha256
            ):
                raise SupportAttachmentError("Uploaded attachment metadata does not match")
        return ordered

    async def _attach(
        self,
        message: SupportMessage,
        attachments: list[SupportAttachment],
    ) -> None:
        for attachment in attachments:
            attachment.message_id = message.id
            attachment.status = SupportAttachmentStatus.ATTACHED
            attachment.delete_after = None

    def _validate_files(self, files: list[SupportUploadFileInput]) -> None:
        if len(files) > _MAX_FILES:
            raise SupportAttachmentError(f"No more than {_MAX_FILES} attachments are allowed")
        total = sum(item.size_bytes for item in files)
        if total > self._settings.support_attachment_max_total_bytes:
            raise SupportAttachmentError("Total attachment size is too large")
        for item in files:
            extension = pathlib.PurePath(item.file_name).suffix.lower()
            allowed = _ALLOWED_FILES.get(extension)
            if allowed is None or item.content_type not in allowed[1]:
                raise SupportAttachmentError("Attachment type is not allowed")
            if item.size_bytes > self._settings.support_attachment_max_file_bytes:
                raise SupportAttachmentError("Attachment is too large")

    def _request_expiry(self, now: datetime.datetime) -> datetime.datetime:
        return now + datetime.timedelta(days=self._settings.support_request_retention_days)

    @staticmethod
    def _clear_attachment_deletion(request: SupportRequest) -> None:
        for message in request.messages:
            for attachment in message.attachments:
                if attachment.status == SupportAttachmentStatus.ATTACHED:
                    attachment.delete_after = None

    async def _reload(self, request_id: uuid.UUID) -> SupportRequest:
        request = await self._requests.get_complete(request_id)
        if request is None:  # pragma: no cover - the row is held by the current transaction
            raise SupportRequestNotFoundError("Support request was not found")
        return request

    @classmethod
    def _detail_response(cls, request: SupportRequest) -> SupportRequestResponse:
        summary = cls._summary_response(request)
        context = request.context or {}
        return SupportRequestResponse(
            **summary.model_dump(),
            messages=[cls._message_response(item) for item in request.messages],
            context=SupportRequestContextResponse(
                subscription_status=context.get("subscription_status"),
                device=context.get("device"),
                app_version=context.get("app_version"),
            ),
        )

    @classmethod
    def _summary_response(cls, request: SupportRequest) -> SupportRequestSummaryResponse:
        last_message = request.messages[-1].body if request.messages else ""
        preview = " ".join(last_message.split())
        if len(preview) > 160:
            preview = f"{preview[:157].rstrip()}…"
        return SupportRequestSummaryResponse(
            id=request.id,
            number=request.number,
            topic=request.topic,
            subject=request.subject,
            status=request.status,
            updated_at=request.last_activity_at,
            last_message_preview=preview,
            unread_count=0,
            requester=SupportRequesterResponse(
                id=request.requester.id,
                full_name=request.requester.full_name,
                username=request.requester.username,
            ),
        )

    @staticmethod
    def _message_response(message: SupportMessage) -> SupportMessageResponse:
        return SupportMessageResponse(
            id=message.id,
            author=message.author_role,
            author_name=message.author_name,
            body=message.body,
            created_at=message.created_at,
            attachments=[
                SupportAttachmentResponse(
                    id=item.id,
                    name=item.original_filename,
                    kind=item.kind,
                    size_bytes=item.size_bytes,
                    password_protected=item.password_protected,
                )
                for item in message.attachments
                if item.status == SupportAttachmentStatus.ATTACHED
            ],
        )


__all__ = [
    "SupportAttachmentError",
    "SupportAttachmentStorageUnavailableError",
    "SupportRequestError",
    "SupportRequestForbiddenError",
    "SupportRequestNotFoundError",
    "SupportRequestService",
]
