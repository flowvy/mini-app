"""User ORM model."""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from flowvy.models.base import Base, bigint_pk, created_at, updated_at

if TYPE_CHECKING:
    from flowvy.models.invite import Invite
    from flowvy.models.subscription import Subscription


class UserRole(enum.StrEnum):
    """User access level."""

    USER = "user"
    ADMIN = "admin"


class User(Base):
    """Telegram user who interacts with the bot or Mini App."""

    __tablename__ = "users"

    id: Mapped[bigint_pk]
    username: Mapped[str | None] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(default=UserRole.USER)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]

    subscriptions: Mapped[list[Subscription]] = relationship(
        back_populates="user",
        lazy="raise",
    )
    created_invites: Mapped[list[Invite]] = relationship(
        foreign_keys="[Invite.created_by_id]",
        overlaps="created_by",
        lazy="raise",
    )

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<User id={self.id} username={self.username!r}>"
