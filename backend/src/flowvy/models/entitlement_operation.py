"""Durable payment-to-access decisions and provider execution state."""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, uuid_pk


class EntitlementOperation(Base):
    """One immutable provider event decision with mutable delivery state."""

    __tablename__ = "entitlement_operations"
    __table_args__ = (
        CheckConstraint(
            "provider IN ('tribute')",
            name="ck_entitlement_operations_provider",
        ),
        CheckConstraint(
            "operation_kind IN ('grant', 'refund', 'review')",
            name="ck_entitlement_operations_kind",
        ),
        CheckConstraint(
            "status IN "
            "('pending', 'processing', 'retry', 'applied', 'review', 'resolved', 'cancelled')",
            name="ck_entitlement_operations_status",
        ),
        CheckConstraint(
            "amount_minor IS NULL OR amount_minor >= 0",
            name="ck_entitlement_operations_amount",
        ),
        CheckConstraint(
            "currency IS NULL OR currency ~ '^[A-Z]{3}$'",
            name="ck_entitlement_operations_currency",
        ),
        CheckConstraint(
            "duration_days IS NULL OR duration_days > 0",
            name="ck_entitlement_operations_duration",
        ),
        CheckConstraint(
            "grant_mode IS NULL OR grant_mode IN ('extend', 'replace')",
            name="ck_entitlement_operations_grant_mode",
        ),
        CheckConstraint(
            "attempt_count >= 0",
            name="ck_entitlement_operations_attempt_count",
        ),
        Index(
            "uq_entitlement_operations_provider_semantic_key",
            "provider",
            "semantic_key",
            unique=True,
            postgresql_where=text("semantic_key IS NOT NULL"),
        ),
        Index(
            "uq_entitlement_operations_processing_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'processing' AND user_id IS NOT NULL"),
        ),
        Index(
            "ix_entitlement_operations_status_next_attempt",
            "status",
            "next_attempt_at",
            "created_at",
        ),
        Index(
            "ix_entitlement_operations_user_created",
            "user_id",
            "created_at",
        ),
        Index(
            "ix_entitlement_operations_purchase",
            "provider",
            "purchase_id",
        ),
    )

    id: Mapped[uuid_pk]
    source_event_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("tribute_webhook_events.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
    )
    root_operation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entitlement_operations.id", ondelete="RESTRICT"),
        nullable=True,
    )
    provider: Mapped[str] = mapped_column(String(32))
    semantic_key: Mapped[str | None] = mapped_column(String(196), nullable=True)
    event_name: Mapped[str] = mapped_column(String(100))
    operation_kind: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider_created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    remnawave_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    purchase_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    transaction_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    external_item_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grant_mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("commerce_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    access_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("access_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    rule_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    profile_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    base_expiry: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    calculation_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    target_expiry: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    provider_expiry: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    locked_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    applied_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=func.now(),
    )
    operator_note: Mapped[str | None] = mapped_column(Text, nullable=True)


__all__ = ["EntitlementOperation"]
