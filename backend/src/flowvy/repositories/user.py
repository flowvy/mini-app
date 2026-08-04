"""User data access."""

from __future__ import annotations

from sqlalchemy import func, select

from flowvy.models.user import User, UserRole
from flowvy.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User CRUD and queries."""

    model = User

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        """Find user by Telegram ID (same as primary key)."""
        return await self.get_by_id(telegram_id)

    async def get_admins(self) -> list[User]:
        """Return all users with admin role."""
        stmt = select(User).where(User.role == UserRole.ADMIN)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

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
