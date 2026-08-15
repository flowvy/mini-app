"""Provider-neutral payment-to-entitlement configuration."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, created_at, updated_at, uuid_pk


class CommerceRule(Base):
    """An administrator-authored provider event mapping; not a payment record."""

    __tablename__ = "commerce_rules"
    __table_args__ = (
        CheckConstraint("provider IN ('tribute')", name="ck_commerce_rules_provider"),
        CheckConstraint(
            "commerce_type IN ('donation', 'subscription')",
            name="ck_commerce_rules_commerce_type",
        ),
        CheckConstraint(
            "payment_mode IN ('any', 'one_time', 'recurring')",
            name="ck_commerce_rules_payment_mode",
        ),
        CheckConstraint(
            "calculation_type IN ('fixed', 'volume', 'provider_expiry')",
            name="ck_commerce_rules_calculation_type",
        ),
        CheckConstraint(
            "grant_mode IN ('extend', 'replace')",
            name="ck_commerce_rules_grant_mode",
        ),
        CheckConstraint(
            "(commerce_type = 'subscription' AND calculation_type = 'provider_expiry' "
            "AND grant_mode = 'replace') OR "
            "(commerce_type <> 'subscription' AND calculation_type <> 'provider_expiry')",
            name="ck_commerce_rules_subscription_expiry",
        ),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="ck_commerce_rules_currency"),
        CheckConstraint("priority BETWEEN 1 AND 10000", name="ck_commerce_rules_priority"),
        CheckConstraint(
            "jsonb_typeof(calculator) = 'object'",
            name="ck_commerce_rules_calculator_object",
        ),
        CheckConstraint(
            "(commerce_type = 'donation' AND external_item_id IS NULL) OR "
            "(commerce_type = 'subscription' "
            "AND external_item_id IS NOT NULL)",
            name="ck_commerce_rules_external_item",
        ),
        CheckConstraint(
            "(commerce_type = 'donation') OR "
            "(commerce_type = 'subscription' AND payment_mode = 'recurring')",
            name="ck_commerce_rules_payment_shape",
        ),
        Index("ix_commerce_rules_provider_priority", "provider", "priority", "created_at"),
    )

    id: Mapped[uuid_pk]
    provider: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(100))
    commerce_type: Mapped[str] = mapped_column(String(32))
    payment_mode: Mapped[str] = mapped_column(String(16))
    external_item_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    currency: Mapped[str] = mapped_column(String(3))
    calculation_type: Mapped[str] = mapped_column(String(16))
    calculator: Mapped[dict[str, object]] = mapped_column(JSONB)
    access_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("access_profiles.id", ondelete="RESTRICT"),
    )
    grant_mode: Mapped[str] = mapped_column(String(16))
    priority: Mapped[int] = mapped_column(Integer, default=100)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]


__all__ = ["CommerceRule"]
