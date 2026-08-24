"""Durable Support conversations, authorization and opaque attachment contracts."""

from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.api.factory import create_app
from flowvy.config import Settings
from flowvy.models.support_request import SupportAttachmentStatus
from flowvy.models.user import UserRole
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
    SupportUploadIntentInput,
)
from flowvy.services.r2_storage import R2ObjectMetadata
from flowvy.services.support_requests import (
    SupportAttachmentError,
    SupportAttachmentStorageUnavailableError,
    SupportRequestForbiddenError,
    SupportRequestService,
)
from flowvy.services.support_retention import SupportRetentionWorker

BOT_TOKEN = "000000:TEST"


def _init_data(user_id: int, *, username: str = "user") -> str:
    user = json.dumps(
        {"id": user_id, "first_name": "Test", "username": username},
        separators=(",", ":"),
    )
    params = {"auth_date": str(int(time.time())), "user": user}
    check = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256)
    params["hash"] = hmac.new(secret.digest(), check.encode(), hashlib.sha256).hexdigest()
    return urlencode(params)


class FakeStorage:
    def __init__(self, *, configured: bool = True) -> None:
        self.configured = configured
        self.objects: dict[str, R2ObjectMetadata] = {}
        self.deleted: list[str] = []

    def presign_upload(
        self,
        *,
        key: str,
        content_type: str,
        checksum_sha256: str,
        expires_seconds: int,
    ) -> tuple[str, dict[str, str]]:
        del expires_seconds
        self.objects[key] = R2ObjectMetadata(
            size_bytes=0,
            content_type=content_type,
            checksum_sha256=checksum_sha256,
        )
        return f"https://upload.invalid/{key}", {
            "Content-Type": content_type,
            "x-amz-checksum-sha256": checksum_sha256,
        }

    def presign_download(self, *, key: str, file_name: str, expires_seconds: int) -> str:
        del file_name, expires_seconds
        return f"https://download.invalid/{key}"

    async def head(self, key: str) -> R2ObjectMetadata:
        return self.objects[key]

    async def delete(self, key: str) -> None:
        self.deleted.append(key)

    async def check(self) -> bool:
        return self.configured


def _settings(*, admin_id: int | None = None, configured: bool = False) -> Settings:
    values: dict[str, object] = {
        "admin_telegram_ids": [admin_id] if admin_id is not None else [],
    }
    if configured:
        values.update(
            r2_account_id="a" * 32,
            r2_bucket_name="flowvy-support",
            r2_access_key_id="test-access-key",
            r2_secret_access_key="test-secret-key",
        )
    return Settings(_env_file=None, **values)


def _service(
    session: AsyncSession,
    storage: FakeStorage,
    settings: Settings,
) -> SupportRequestService:
    return SupportRequestService(
        SupportRequestRepository(session),
        SupportMessageRepository(session),
        SupportAttachmentRepository(session),
        UserRepository(session),
        SubscriptionRepository(session),
        storage,  # type: ignore[arg-type]
        settings,
    )


@pytest.mark.asyncio
async def test_text_requests_work_without_r2_and_enforce_owner_or_exact_admin(
    session: AsyncSession,
) -> None:
    user_id = 710_001
    other_id = 710_002
    admin_id = 710_003
    users = UserRepository(session)
    await users.create(id=user_id, username="user", full_name="User")
    await users.create(id=other_id, username="other", full_name="Other")
    await users.create(
        id=admin_id,
        username="admin",
        full_name="Support Agent",
        role=UserRole.ADMIN,
    )
    service = _service(session, FakeStorage(configured=False), _settings(admin_id=admin_id))

    capabilities = service.capabilities()
    assert capabilities.attachments_enabled is False
    created = await service.create_request(
        user_id,
        CreateSupportRequestInput(
            topic="connection",
            subject="Cannot connect",
            message="The profile stopped working.",
            client_platform="Telegram iOS",
        ),
    )

    assert created.number == 1
    assert created.status == "needs_reply"
    assert created.requester.id == user_id
    assert created.messages[0].author == "user"
    assert created.context.device == "Telegram iOS"
    assert [item.id for item in await service.list_requests(user_id)] == [created.id]
    assert [item.id for item in await service.list_requests(admin_id)] == [created.id]
    with pytest.raises(SupportRequestForbiddenError):
        await service.get_request(created.id, other_id)

    answered = await service.reply(
        created.id,
        admin_id,
        ReplySupportRequestInput(message="Please refresh the profile."),
    )
    assert answered.status == "waiting_user"
    assert [item.author for item in answered.messages] == ["user", "support"]

    resolved = await service.resolve(created.id, user_id)
    assert resolved.status == "resolved"
    reopened = await service.reply(
        created.id,
        user_id,
        ReplySupportRequestInput(message="That did not help."),
    )
    assert reopened.status == "needs_reply"
    assert len(reopened.messages) == 3


@pytest.mark.asyncio
async def test_attachment_intent_binds_type_size_checksum_and_treats_zip_as_opaque(
    session: AsyncSession,
) -> None:
    user_id = 720_001
    await UserRepository(session).create(id=user_id, username="user", full_name="User")
    storage = FakeStorage()
    service = _service(session, storage, _settings(configured=True))
    checksum = base64.b64encode(hashlib.sha256(b"encrypted zip bytes").digest()).decode()

    intent = await service.create_upload_intents(
        user_id,
        SupportUploadIntentInput.model_validate(
            {
                "files": [
                    {
                        "fileName": "flowvy-debug.zip",
                        "contentType": "application/zip",
                        "sizeBytes": 19,
                        "checksumSha256": checksum,
                    }
                ]
            }
        ),
    )
    assert len(intent.uploads) == 1
    assert intent.uploads[0].headers["x-amz-checksum-sha256"] == checksum

    attachment = await SupportAttachmentRepository(session).get_by_id(intent.uploads[0].id)
    assert attachment is not None
    assert attachment.kind == "zip"
    assert attachment.password_protected is False
    assert attachment.object_key is not None
    storage.objects[attachment.object_key] = R2ObjectMetadata(
        size_bytes=19,
        content_type="application/zip",
        checksum_sha256=checksum,
    )

    created = await service.create_request(
        user_id,
        CreateSupportRequestInput(
            topic="other",
            subject="Desktop diagnostics",
            message="Attached the password-protected client archive.",
            attachment_ids=[attachment.id],
        ),
    )
    assert created.messages[0].attachments[0].kind == "zip"
    assert attachment.status == SupportAttachmentStatus.ATTACHED

    download = await service.download(attachment.id, user_id)
    assert download.url.startswith("https://download.invalid/")


@pytest.mark.asyncio
async def test_attachment_intents_fail_closed_when_unconfigured_or_metadata_changes(
    session: AsyncSession,
) -> None:
    user_id = 730_001
    await UserRepository(session).create(id=user_id, username="user", full_name="User")
    checksum = base64.b64encode(hashlib.sha256(b"screen").digest()).decode()
    payload = SupportUploadIntentInput.model_validate(
        {
            "files": [
                {
                    "fileName": "screen.png",
                    "contentType": "image/png",
                    "sizeBytes": 6,
                    "checksumSha256": checksum,
                }
            ]
        }
    )
    unavailable = _service(session, FakeStorage(configured=False), _settings())
    with pytest.raises(SupportAttachmentStorageUnavailableError):
        await unavailable.create_upload_intents(user_id, payload)

    storage = FakeStorage()
    service = _service(session, storage, _settings(configured=True))
    intent = await service.create_upload_intents(user_id, payload)
    attachment = await SupportAttachmentRepository(session).get_by_id(intent.uploads[0].id)
    assert attachment is not None and attachment.object_key is not None
    storage.objects[attachment.object_key] = R2ObjectMetadata(
        size_bytes=7,
        content_type="image/png",
        checksum_sha256=checksum,
    )
    with pytest.raises(SupportAttachmentError, match="does not match"):
        await service.create_request(
            user_id,
            CreateSupportRequestInput(
                topic="connection",
                subject="Screenshot",
                message="See attachment.",
                attachment_ids=[attachment.id],
            ),
        )


def test_attachment_contract_rejects_paths_bad_checksums_and_invalid_limit_pair() -> None:
    with pytest.raises(ValidationError, match="Invalid attachment file name"):
        SupportUploadIntentInput.model_validate(
            {
                "files": [
                    {
                        "fileName": "bad\u0000.txt",
                        "contentType": "text/plain",
                        "sizeBytes": 1,
                        "checksumSha256": "A" * 44,
                    }
                ]
            }
        )
    with pytest.raises(ValidationError, match="MAX_TOTAL_BYTES"):
        Settings(
            _env_file=None,
            support_attachment_max_file_bytes=2_000_000,
            support_attachment_max_total_bytes=1_500_000,
        )
    with pytest.raises(ValidationError, match="valid 3-63 character bucket name"):
        Settings(
            _env_file=None,
            r2_account_id="a" * 32,
            r2_bucket_name="invalid.bucket",
            r2_access_key_id="EXAMPLE_ACCESS_KEY",
            r2_secret_access_key="EXAMPLE_SECRET_KEY",
        )


@pytest.mark.asyncio
async def test_resolve_schedules_attachment_deletion_and_reopen_cancels_it(
    session: AsyncSession,
) -> None:
    user_id = 740_001
    await UserRepository(session).create(id=user_id, username="user", full_name="User")
    storage = FakeStorage()
    settings = _settings(configured=True)
    service = _service(session, storage, settings)
    checksum = base64.b64encode(hashlib.sha256(b"log").digest()).decode()
    intent = await service.create_upload_intents(
        user_id,
        SupportUploadIntentInput.model_validate(
            {
                "files": [
                    {
                        "fileName": "log.txt",
                        "contentType": "text/plain",
                        "sizeBytes": 3,
                        "checksumSha256": checksum,
                    }
                ]
            }
        ),
    )
    attachment = await SupportAttachmentRepository(session).get_by_id(intent.uploads[0].id)
    assert attachment is not None and attachment.object_key is not None
    storage.objects[attachment.object_key] = R2ObjectMetadata(3, "text/plain", checksum)
    request = await service.create_request(
        user_id,
        CreateSupportRequestInput(
            topic="other",
            subject="Logs",
            message="Attached.",
            attachment_ids=[attachment.id],
        ),
    )

    before = datetime.datetime.now(datetime.UTC)
    await service.resolve(request.id, user_id)
    assert attachment.delete_after is not None
    assert attachment.delete_after >= before + datetime.timedelta(days=2, hours=23)
    await service.reopen(request.id, user_id)
    assert attachment.delete_after is None


@pytest.mark.asyncio
async def test_retention_deletes_r2_object_before_expired_conversation(
    engine: AsyncEngine,
) -> None:
    user_id = 750_001
    factory = async_sessionmaker(engine, expire_on_commit=False)
    storage = FakeStorage()
    settings = _settings(configured=True)
    checksum = base64.b64encode(hashlib.sha256(b"log").digest()).decode()
    async with factory() as session:
        await UserRepository(session).create(id=user_id, username="user", full_name="User")
        service = _service(session, storage, settings)
        intent = await service.create_upload_intents(
            user_id,
            SupportUploadIntentInput.model_validate(
                {
                    "files": [
                        {
                            "fileName": "log.txt",
                            "contentType": "text/plain",
                            "sizeBytes": 3,
                            "checksumSha256": checksum,
                        }
                    ]
                }
            ),
        )
        attachment = await SupportAttachmentRepository(session).get_by_id(intent.uploads[0].id)
        assert attachment is not None and attachment.object_key is not None
        key = attachment.object_key
        storage.objects[key] = R2ObjectMetadata(3, "text/plain", checksum)
        request = await service.create_request(
            user_id,
            CreateSupportRequestInput(
                topic="other",
                subject="Old logs",
                message="Attached.",
                attachment_ids=[attachment.id],
            ),
        )
        expired = datetime.datetime.now(datetime.UTC) - datetime.timedelta(seconds=1)
        persisted = await SupportRequestRepository(session).get_complete(request.id)
        assert persisted is not None
        persisted.expires_at = expired
        attachment.delete_after = expired
        await session.commit()

    deleted_objects, deleted_requests = await SupportRetentionWorker(
        factory,
        storage,  # type: ignore[arg-type]
        settings,
    ).run_once()

    assert (deleted_objects, deleted_requests) == (1, 1)
    assert storage.deleted == [key]
    async with factory() as session:
        assert await SupportRequestRepository(session).get_complete(request.id) is None


@pytest.mark.asyncio
async def test_support_request_http_contract_uses_authenticated_json_and_keeps_text_available(
    engine: AsyncEngine,
) -> None:
    user_id = 760_001
    other_id = 760_002
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        users = UserRepository(session)
        await users.create(id=user_id, username="user", full_name="User")
        await users.create(id=other_id, username="other", full_name="Other")
        await session.commit()

    app = create_app()
    headers = {"Authorization": f"tma {_init_data(user_id)}"}
    other_headers = {"Authorization": f"tma {_init_data(other_id, username='other')}"}
    async with AsyncClient(
        transport=ASGITransport(app=app),  # type: ignore[arg-type]
        base_url="http://test",
    ) as client:
        capabilities = await client.get("/api/support/capabilities", headers=headers)
        created = await client.post(
            "/api/support/requests",
            headers=headers,
            json={
                "topic": "connection",
                "subject": "Cannot connect",
                "message": "Text requests must work without R2.",
                "attachmentIds": [],
                "clientPlatform": "Telegram Android",
            },
        )
        request_id = created.json()["id"]
        listed = await client.get("/api/support/requests", headers=headers)
        denied = await client.get(f"/api/support/requests/{request_id}", headers=other_headers)
        resolved = await client.post(
            f"/api/support/requests/{request_id}/resolve",
            headers=headers,
        )

    assert capabilities.status_code == 200
    assert capabilities.json()["attachmentsEnabled"] is False
    assert created.status_code == 201
    assert created.json()["context"]["device"] == "Telegram Android"
    assert [item["id"] for item in listed.json()["requests"]] == [request_id]
    assert denied.status_code == 403
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
