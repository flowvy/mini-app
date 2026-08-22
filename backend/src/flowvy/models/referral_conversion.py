"""Durable first-payment referral conversions and optional rewards."""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, uuid_pk


class ReferralConversion(Base):
    """One invitee's first applied external payment and frozen reward decision."""

    __tablename__ = "referral_conversions"
    __table_args__ = (
        CheckConstraint(
            "reward_days IS NULL OR reward_days > 0",
            name="ck_referral_conversions_reward_days",
        ),
    )

    id: Mapped[uuid_pk]
    inviter_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    invitee_user_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    source_operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entitlement_operations.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )
    reward_operation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entitlement_operations.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
    )
    reward_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
    )


__all__ = ["ReferralConversion"]
