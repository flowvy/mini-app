"""Reusable Remnawave access profile assigned during registration."""

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
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from flowvy.models.base import Base, created_at, updated_at, uuid_pk

if TYPE_CHECKING:
    from flowvy.models.user import User


class AccessValidityMode(enum.StrEnum):
    """How a registration grant determines the Remnawave expiration date."""

    DURATION = "duration"
    FIXED = "fixed"
    LIFETIME = "lifetime"


class AccessProfile(Base):
    """Version-neutral Remnawave fields reused by registration grants."""

    __tablename__ = "access_profiles"
    __table_args__ = (
        UniqueConstraint("name", name="uq_access_profiles_name"),
        CheckConstraint(
            "validity_mode IN ('duration', 'fixed', 'lifetime')",
            name="ck_access_profiles_validity_mode",
        ),
        CheckConstraint(
            "traffic_limit_strategy IN ('NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING')",
            name="ck_access_profiles_traffic_strategy",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'DISABLED', 'LIMITED', 'EXPIRED')",
            name="ck_access_profiles_status",
        ),
        CheckConstraint(
            "traffic_limit_bytes >= 0",
            name="ck_access_profiles_traffic_nonnegative",
        ),
        CheckConstraint(
            "hwid_device_limit IS NULL OR hwid_device_limit >= 0",
            name="ck_access_profiles_hwid_nonnegative",
        ),
        CheckConstraint(
            "(validity_mode = 'duration' AND validity_days IS NOT NULL "
            "AND validity_days > 0 AND fixed_expire_at IS NULL) OR "
            "(validity_mode = 'fixed' AND validity_days IS NULL "
            "AND fixed_expire_at IS NOT NULL) OR "
            "(validity_mode = 'lifetime' AND validity_days IS NULL "
            "AND fixed_expire_at IS NULL)",
            name="ck_access_profiles_validity_fields",
        ),
    )

    id: Mapped[uuid_pk]
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    validity_mode: Mapped[str] = mapped_column(String(16))
    validity_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fixed_expire_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    traffic_limit_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    traffic_limit_strategy: Mapped[str] = mapped_column(String(20), default="NO_RESET")
    hwid_device_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tag: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="ACTIVE")
    internal_squad_uuids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    external_squad_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]

    created_by: Mapped[User | None] = relationship(lazy="raise")


__all__ = ["AccessProfile", "AccessValidityMode"]
