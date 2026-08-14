"""Append-only administrator actions on payment entitlement operations."""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, uuid_pk


class EntitlementOperationAction(Base):
    """One attributable, idempotent operator decision."""

    __tablename__ = "entitlement_operation_actions"
    __table_args__ = (
        CheckConstraint(
            "action IN ('retry', 'resolve')",
            name="ck_entitlement_operation_actions_action",
        ),
        CheckConstraint(
            "previous_status IN "
            "('pending', 'processing', 'retry', 'applied', 'review', 'resolved', 'cancelled')",
            name="ck_entitlement_operation_actions_previous_status",
        ),
        CheckConstraint(
            "actor_telegram_id >= 0",
            name="ck_entitlement_operation_actions_actor_telegram_id",
        ),
        CheckConstraint(
            "(action = 'retry' AND note IS NULL) OR "
            "(action = 'resolve' AND char_length(note) BETWEEN 1 AND 500)",
            name="ck_entitlement_operation_actions_note",
        ),
        Index(
            "ix_entitlement_operation_actions_operation_created",
            "operation_id",
            "created_at",
        ),
    )

    id: Mapped[uuid_pk]
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entitlement_operations.id", ondelete="RESTRICT"),
    )
    actor_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_telegram_id: Mapped[int] = mapped_column(BigInteger)
    action: Mapped[str] = mapped_column(String(16))
    previous_status: Mapped[str] = mapped_column(String(16))
    previous_reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
    )


__all__ = ["EntitlementOperationAction"]
