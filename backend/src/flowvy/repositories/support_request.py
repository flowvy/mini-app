"""Persistence for durable Support conversations and attachment intents."""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import selectinload

from flowvy.models.support_request import (
    SupportAttachment,
    SupportAttachmentStatus,
    SupportMessage,
    SupportRequest,
)
from flowvy.repositories.base import BaseRepository


def _request_loads():
    return (
        selectinload(SupportRequest.requester),
        selectinload(SupportRequest.messages).selectinload(SupportMessage.attachments),
    )


class SupportRequestRepository(BaseRepository[SupportRequest]):
    model = SupportRequest

    async def list_for_user(self, user_id: int, *, limit: int = 100) -> list[SupportRequest]:
        stmt = (
            select(SupportRequest)
            .where(SupportRequest.user_id == user_id)
            .options(*_request_loads())
            .order_by(SupportRequest.last_activity_at.desc())
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())

    async def list_all_recent(self, *, limit: int = 200) -> list[SupportRequest]:
        stmt = (
            select(SupportRequest)
            .options(*_request_loads())
            .order_by(SupportRequest.last_activity_at.desc())
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_complete(self, request_id: uuid.UUID) -> SupportRequest | None:
        stmt = (
            select(SupportRequest)
            .where(SupportRequest.id == request_id)
            .options(*_request_loads())
            .execution_options(populate_existing=True)
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def delete_expired_without_objects(
        self,
        now: datetime.datetime,
        *,
        limit: int,
    ) -> int:
        retained_object = (
            select(SupportAttachment.id)
            .join(SupportMessage, SupportMessage.id == SupportAttachment.message_id)
            .where(
                SupportMessage.request_id == SupportRequest.id,
                SupportAttachment.status != SupportAttachmentStatus.DELETED,
                SupportAttachment.object_key.is_not(None),
            )
        )
        stmt = (
            select(SupportRequest)
            .where(
                SupportRequest.expires_at <= now,
                ~exists(retained_object),
            )
            .order_by(SupportRequest.expires_at.asc())
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
        requests = list((await self._session.scalars(stmt)).all())
        for request in requests:
            await self._session.delete(request)
        await self._session.flush()
        return len(requests)


class SupportMessageRepository(BaseRepository[SupportMessage]):
    model = SupportMessage


class SupportAttachmentRepository(BaseRepository[SupportAttachment]):
    model = SupportAttachment

    async def get_pending_for_owner(
        self,
        attachment_ids: list[uuid.UUID],
        owner_id: int,
        now: datetime.datetime,
    ) -> list[SupportAttachment]:
        if not attachment_ids:
            return []
        stmt = (
            select(SupportAttachment)
            .where(
                SupportAttachment.id.in_(attachment_ids),
                SupportAttachment.owner_id == owner_id,
                SupportAttachment.status == SupportAttachmentStatus.PENDING,
                SupportAttachment.upload_expires_at > now,
            )
            .with_for_update()
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_available(self, attachment_id: uuid.UUID) -> SupportAttachment | None:
        stmt = select(SupportAttachment).where(
            SupportAttachment.id == attachment_id,
            SupportAttachment.status == SupportAttachmentStatus.ATTACHED,
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list_due_for_cleanup(
        self,
        now: datetime.datetime,
        *,
        limit: int,
    ) -> list[SupportAttachment]:
        stmt = (
            select(SupportAttachment)
            .where(
                SupportAttachment.object_key.is_not(None),
                or_(
                    and_(
                        SupportAttachment.status == SupportAttachmentStatus.PENDING,
                        SupportAttachment.upload_expires_at <= now,
                    ),
                    and_(
                        SupportAttachment.status == SupportAttachmentStatus.ATTACHED,
                        SupportAttachment.delete_after.is_not(None),
                        SupportAttachment.delete_after <= now,
                    ),
                ),
            )
            .order_by(SupportAttachment.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())

    async def list_available_for_expired_requests(
        self,
        now: datetime.datetime,
        *,
        limit: int,
    ) -> list[SupportAttachment]:
        stmt = (
            select(SupportAttachment)
            .join(SupportMessage, SupportMessage.id == SupportAttachment.message_id)
            .join(SupportRequest, SupportRequest.id == SupportMessage.request_id)
            .where(
                SupportRequest.expires_at <= now,
                SupportAttachment.status == SupportAttachmentStatus.ATTACHED,
                SupportAttachment.object_key.is_not(None),
            )
            .order_by(SupportRequest.expires_at.asc())
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())


__all__ = [
    "SupportAttachmentRepository",
    "SupportMessageRepository",
    "SupportRequestRepository",
]
