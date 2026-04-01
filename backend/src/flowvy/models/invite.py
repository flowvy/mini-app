"""Invite ORM model."""

from __future__ import annotations

import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from flowvy.models.base import Base, created_at, uuid_pk

if TYPE_CHECKING:
    from flowvy.models.user import User


class Invite(Base):
    """Invitation code for invite-only access."""

    __tablename__ = "invites"

    id: Mapped[uuid_pk]
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
    )
    used_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
    )
    used_at: Mapped[datetime.datetime | None]
    expires_at: Mapped[datetime.datetime | None]
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[created_at]

    created_by: Mapped[User | None] = relationship(
        foreign_keys=[created_by_id],
        lazy="raise",
    )
    used_by: Mapped[User | None] = relationship(
        foreign_keys=[used_by_id],
        lazy="raise",
    )

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<Invite code={self.code!r} active={self.is_active}>"
