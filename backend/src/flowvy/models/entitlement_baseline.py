"""Durable provider state captured before Flowvy applies paid access."""

from __future__ import annotations

import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, updated_at


class EntitlementBaseline(Base):
    """One immutable base-access source per local user."""

    __tablename__ = "entitlement_baselines"
    __table_args__ = (
        CheckConstraint(
            "(had_access AND profile_snapshot IS NOT NULL AND expires_at IS NOT NULL) OR "
            "(NOT had_access AND profile_snapshot IS NULL AND expires_at IS NULL)",
            name="ck_entitlement_baselines_access_shape",
        ),
        CheckConstraint(
            "profile_snapshot IS NULL OR jsonb_typeof(profile_snapshot) = 'object'",
            name="ck_entitlement_baselines_profile_object",
        ),
        CheckConstraint(
            "remnawave_user_id IS NULL OR remnawave_user_id > 0",
            name="ck_entitlement_baselines_provider_user",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        autoincrement=False,
    )
    had_access: Mapped[bool] = mapped_column(Boolean)
    remnawave_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    profile_snapshot: Mapped[dict[str, object] | None] = mapped_column(
        JSONB(none_as_null=True),
        nullable=True,
    )
    expires_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    captured_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[updated_at]


__all__ = ["EntitlementBaseline"]
