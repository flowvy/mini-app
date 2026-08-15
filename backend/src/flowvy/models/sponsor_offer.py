"""Provider-neutral sponsor offers published to Flowvy users."""

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
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, created_at, updated_at, uuid_pk


class SponsorOffer(Base):
    """Administrator-authored presentation of one commerce rule."""

    __tablename__ = "sponsor_offers"
    __table_args__ = (
        CheckConstraint("provider IN ('tribute')", name="ck_sponsor_offers_provider"),
        CheckConstraint("char_length(title) BETWEEN 1 AND 100", name="ck_sponsor_offers_title"),
        CheckConstraint("char_length(description) <= 300", name="ck_sponsor_offers_description"),
        CheckConstraint("sort_order BETWEEN 1 AND 10000", name="ck_sponsor_offers_sort_order"),
        CheckConstraint(
            "expected_amount_minor IS NULL OR expected_amount_minor > 0",
            name="ck_sponsor_offers_expected_amount",
        ),
        CheckConstraint(
            "expected_payment_mode IS NULL OR expected_payment_mode IN ('one_time', 'recurring')",
            name="ck_sponsor_offers_expected_payment_mode",
        ),
        CheckConstraint(
            "expected_provider_period IS NULL OR expected_provider_period IN "
            "('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly')",
            name="ck_sponsor_offers_expected_provider_period",
        ),
        CheckConstraint(
            "(expected_payment_mode = 'recurring' AND expected_provider_period IS NOT NULL) OR "
            "(expected_payment_mode IS DISTINCT FROM 'recurring' "
            "AND expected_provider_period IS NULL)",
            name="ck_sponsor_offers_expected_schedule",
        ),
        CheckConstraint(
            "checkout_snapshot IS NULL OR jsonb_typeof(checkout_snapshot) = 'object'",
            name="ck_sponsor_offers_checkout_snapshot",
        ),
        CheckConstraint(
            "is_published = false OR checkout_snapshot IS NOT NULL",
            name="ck_sponsor_offers_published_snapshot",
        ),
        Index("ix_sponsor_offers_commerce_rule_id", "commerce_rule_id"),
    )

    id: Mapped[uuid_pk]
    provider: Mapped[str] = mapped_column(String(32), default="tribute")
    commerce_rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("commerce_rules.id", ondelete="RESTRICT"),
    )
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    expected_payment_mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    expected_provider_period: Mapped[str | None] = mapped_column(String(16), nullable=True)
    checkout_snapshot: Mapped[dict[str, object] | None] = mapped_column(
        JSONB(none_as_null=True),
        nullable=True,
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    created_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]


__all__ = ["SponsorOffer"]
