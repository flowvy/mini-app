"""Subscription ORM model."""

from __future__ import annotations

import datetime
import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from flowvy.models.base import Base, created_at, updated_at, uuid_pk

if TYPE_CHECKING:
    from flowvy.models.user import User


class SubscriptionStatus(enum.StrEnum):
    """Subscription lifecycle state."""

    ACTIVE = "active"
    EXPIRED = "expired"
    SUSPENDED = "suspended"


class Subscription(Base):
    """VPN subscription linked to Remnawave."""

    __tablename__ = "subscriptions"

    id: Mapped[uuid_pk]
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        index=True,
    )
    remnawave_uuid: Mapped[uuid.UUID | None] = mapped_column(unique=True)
    status: Mapped[SubscriptionStatus] = mapped_column(
        default=SubscriptionStatus.ACTIVE,
    )
    device_limit: Mapped[int | None] = mapped_column(default=None)
    expires_at: Mapped[datetime.datetime | None]
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]

    user: Mapped[User] = relationship(back_populates="subscriptions", lazy="raise")

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<Subscription id={self.id} user_id={self.user_id} status={self.status.value}>"
