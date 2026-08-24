"""Bounded retention worker for Support messages and private R2 objects."""

from __future__ import annotations

import asyncio
import datetime

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.config import Settings
from flowvy.models.support_request import SupportAttachmentStatus
from flowvy.repositories.support_request import (
    SupportAttachmentRepository,
    SupportRequestRepository,
)
from flowvy.services.r2_storage import R2Storage, R2StorageUnavailableError

logger = structlog.get_logger()


class SupportRetentionWorker:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        storage: R2Storage,
        settings: Settings,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._storage = storage
        self._settings = settings

    async def run_once(self) -> tuple[int, int]:
        now = datetime.datetime.now(datetime.UTC)
        deleted_objects = 0
        deleted_requests = 0
        async with self._sessionmaker() as session:
            attachments = SupportAttachmentRepository(session)
            requests = SupportRequestRepository(session)
            candidates = await attachments.list_due_for_cleanup(
                now,
                limit=self._settings.support_retention_cleanup_batch_size,
            )
            remaining = self._settings.support_retention_cleanup_batch_size - len(candidates)
            if remaining > 0:
                candidates.extend(
                    await attachments.list_available_for_expired_requests(
                        now,
                        limit=remaining,
                    )
                )
            seen: set[object] = set()
            for attachment in candidates:
                if attachment.id in seen or attachment.object_key is None:
                    continue
                seen.add(attachment.id)
                try:
                    await self._storage.delete(attachment.object_key)
                except R2StorageUnavailableError:
                    logger.warning("support_attachment_cleanup_unavailable")
                    continue
                deleted_objects += 1
                if attachment.status == SupportAttachmentStatus.PENDING:
                    await session.delete(attachment)
                else:
                    attachment.status = SupportAttachmentStatus.DELETED
                    attachment.object_key = None
                    attachment.deleted_at = now
                    attachment.delete_after = None
            await session.flush()
            deleted_requests = await requests.delete_expired_without_objects(
                now,
                limit=self._settings.support_retention_cleanup_batch_size,
            )
            await session.commit()
        return deleted_objects, deleted_requests


async def run_support_retention(worker: SupportRetentionWorker, interval_seconds: int) -> None:
    while True:
        try:
            deleted_objects, deleted_requests = await worker.run_once()
            if deleted_objects or deleted_requests:
                logger.info(
                    "support_retention_cleanup_completed",
                    deleted_objects=deleted_objects,
                    deleted_requests=deleted_requests,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("support_retention_cleanup_failed")
        await asyncio.sleep(interval_seconds)


__all__ = ["SupportRetentionWorker", "run_support_retention"]
