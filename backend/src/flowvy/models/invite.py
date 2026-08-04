"""Invite ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from flowvy.models.base import Base, created_at, uuid_pk

if TYPE_CHECKING:
    from flowvy.models.user import User


class Invite(Base):
    """One reusable invitation code owned by one registered user."""

    __tablename__ = "invites"

    id: Mapped[uuid_pk]
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    created_by_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[created_at]

    created_by: Mapped[User] = relationship(back_populates="invite", lazy="raise")

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<Invite owner={self.created_by_id} active={self.is_active}>"
