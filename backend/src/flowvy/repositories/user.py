"""User data access."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import func, select

from flowvy.models.user import User, UserRole
from flowvy.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User CRUD and queries."""

    model = User

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        """Find user by Telegram ID (same as primary key)."""
        return await self.get_by_id(telegram_id)

    async def get_by_telegram_ids(self, telegram_ids: Sequence[int]) -> list[User]:
        """Return local users matching Telegram IDs without per-user queries."""
        if not telegram_ids:
            return []
        stmt = select(User).where(User.id.in_(telegram_ids))
        return list((await self._session.scalars(stmt)).all())

    async def get_by_telegram_id_for_update(self, telegram_id: int) -> User | None:
        """Lock one local account while creating a user-scoped durable intent."""
        stmt = select(User).where(User.id == telegram_id).with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def get_admins(self) -> list[User]:
        """Return all users with admin role."""
        stmt = select(User).where(User.role == UserRole.ADMIN)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_active_admins(
        self,
        allowed_telegram_ids: Sequence[int],
        *,
        exclude_telegram_id: int | None = None,
    ) -> list[User]:
        """Return active DB admins still authorized by current environment policy."""
        if not allowed_telegram_ids:
            return []
        conditions = [
            User.id.in_(allowed_telegram_ids),
            User.role == UserRole.ADMIN,
            User.is_active.is_(True),
        ]
        if exclude_telegram_id is not None:
            conditions.append(User.id != exclude_telegram_id)
        stmt = select(User).where(*conditions).order_by(User.id)
        return list((await self._session.scalars(stmt)).all())

    async def count_invited_by(self, user_id: int) -> int:
        """Count direct registrations attributed to one inviter."""
        stmt = select(func.count(User.id)).where(User.invited_by_id == user_id)
        result = await self._session.execute(stmt)
        return int(result.scalar_one())

    async def ensure_exists(self, telegram_id: int, username: str) -> None:
        """Create user if not already present in the database."""
        existing = await self.get_by_telegram_id(telegram_id)
        if existing is None:
            await self.create(
                id=telegram_id,
                username=username,
                full_name=username,
            )
