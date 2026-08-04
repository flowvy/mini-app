"""User ORM model."""

from __future__ import annotations

import datetime
import enum
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
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
    invited_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    last_active_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=None,
    )
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]

    subscriptions: Mapped[list[Subscription]] = relationship(
        back_populates="user",
        lazy="raise",
    )
    invite: Mapped[Invite | None] = relationship(
        back_populates="created_by",
        uselist=False,
        lazy="raise",
    )
    inviter: Mapped[User | None] = relationship(
        remote_side="[User.id]",
        foreign_keys=[invited_by_id],
        back_populates="invitees",
        lazy="raise",
    )
    invitees: Mapped[list[User]] = relationship(
        foreign_keys="[User.invited_by_id]",
        back_populates="inviter",
        lazy="raise",
    )

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<User id={self.id} username={self.username!r}>"
