"""Durable in-app Support requests, messages and opaque attachments."""

from __future__ import annotations

import datetime
import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from flowvy.models.base import Base, created_at, updated_at, uuid_pk

if TYPE_CHECKING:
    from flowvy.models.user import User


class SupportRequestStatus(enum.StrEnum):
    NEEDS_REPLY = "needs_reply"
    WAITING_USER = "waiting_user"
    RESOLVED = "resolved"


class SupportMessageAuthor(enum.StrEnum):
    USER = "user"
    SUPPORT = "support"


class SupportAttachmentStatus(enum.StrEnum):
    PENDING = "pending"
    ATTACHED = "attached"
    DELETED = "deleted"


class SupportRequest(Base):
    __tablename__ = "support_requests"
    __table_args__ = (
        CheckConstraint(
            "topic IN ('connection', 'subscription', 'devices', 'payment', 'other')",
            name="ck_support_requests_topic",
        ),
        CheckConstraint(
            "status IN ('needs_reply', 'waiting_user', 'resolved')",
            name="ck_support_requests_status",
        ),
        Index("ix_support_requests_status_activity", "status", "last_activity_at"),
        Index("ix_support_requests_user_activity", "user_id", "last_activity_at"),
    )

    id: Mapped[uuid_pk]
    number: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    topic: Mapped[str] = mapped_column(String(32))
    subject: Mapped[str] = mapped_column(String(120))
    status: Mapped[SupportRequestStatus] = mapped_column(
        String(24),
        default=SupportRequestStatus.NEEDS_REPLY,
        server_default=SupportRequestStatus.NEEDS_REPLY.value,
    )
    context: Mapped[dict[str, str | None]] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    resolved_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    last_activity_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    expires_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]

    requester: Mapped[User] = relationship(lazy="raise")
    messages: Mapped[list[SupportMessage]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SupportMessage.created_at",
        lazy="raise",
    )


class SupportMessage(Base):
    __tablename__ = "support_messages"
    __table_args__ = (
        CheckConstraint(
            "author_role IN ('user', 'support')",
            name="ck_support_messages_author_role",
        ),
        Index("ix_support_messages_request_created", "request_id", "created_at"),
    )

    id: Mapped[uuid_pk]
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("support_requests.id", ondelete="CASCADE"),
    )
    author_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    author_role: Mapped[SupportMessageAuthor] = mapped_column(String(16))
    author_name: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )

    request: Mapped[SupportRequest] = relationship(back_populates="messages", lazy="raise")
    attachments: Mapped[list[SupportAttachment]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SupportAttachment.created_at",
        lazy="raise",
    )


class SupportAttachment(Base):
    __tablename__ = "support_attachments"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('image', 'video', 'text', 'zip')",
            name="ck_support_attachments_kind",
        ),
        CheckConstraint(
            "status IN ('pending', 'attached', 'deleted')",
            name="ck_support_attachments_status",
        ),
        CheckConstraint("size_bytes > 0", name="ck_support_attachments_size"),
        Index("ix_support_attachments_cleanup", "status", "delete_after", "upload_expires_at"),
    )

    id: Mapped[uuid_pk]
    owner_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("support_messages.id", ondelete="CASCADE"),
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(16))
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    checksum_sha256: Mapped[str] = mapped_column(String(44))
    object_key: Mapped[str | None] = mapped_column(String(512), unique=True)
    status: Mapped[SupportAttachmentStatus] = mapped_column(
        String(16),
        default=SupportAttachmentStatus.PENDING,
        server_default=SupportAttachmentStatus.PENDING.value,
    )
    password_protected: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    upload_expires_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    delete_after: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )
    updated_at: Mapped[updated_at]

    message: Mapped[SupportMessage | None] = relationship(
        back_populates="attachments", lazy="raise"
    )


__all__ = [
    "SupportAttachment",
    "SupportAttachmentStatus",
    "SupportMessage",
    "SupportMessageAuthor",
    "SupportRequest",
    "SupportRequestStatus",
]
