"""Local redirect attempts for provider-hosted sponsor checkout."""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, created_at, updated_at, uuid_pk


class SponsorCheckout(Base):
    """One local hand-off to Tribute; never proof of payment by itself."""

    __tablename__ = "sponsor_checkouts"
    __table_args__ = (
        CheckConstraint("provider IN ('tribute')", name="ck_sponsor_checkouts_provider"),
        CheckConstraint(
            "commerce_type IN ('donation', 'subscription')",
            name="ck_sponsor_checkouts_commerce_type",
        ),
        CheckConstraint(
            "payment_mode IN ('any', 'one_time', 'recurring')",
            name="ck_sponsor_checkouts_payment_mode",
        ),
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'expired')",
            name="ck_sponsor_checkouts_status",
        ),
        CheckConstraint(
            "jsonb_typeof(offer_snapshot) = 'object'",
            name="ck_sponsor_checkouts_offer_snapshot",
        ),
        Index(
            "uq_sponsor_checkouts_pending_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_sponsor_checkouts_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid_pk]
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
    )
    offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sponsor_offers.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider: Mapped[str] = mapped_column(String(32))
    commerce_type: Mapped[str] = mapped_column(String(32))
    payment_mode: Mapped[str] = mapped_column(String(16))
    external_item_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    offer_snapshot: Mapped[dict[str, object]] = mapped_column(JSONB)
    provider_event_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("tribute_webhook_events.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
    )
    expires_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]


__all__ = ["SponsorCheckout"]
