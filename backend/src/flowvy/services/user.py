"""User business logic."""

from __future__ import annotations

from flowvy.config import Settings
from flowvy.models.user import User, UserRole
from flowvy.repositories.user import UserRepository


class InactiveUserError(Exception):
    """Raised when a disabled user tries to refresh or create a session."""


class UserService:
    """Operations on users: lookup, creation, profile sync."""

    def __init__(self, repo: UserRepository, settings: Settings) -> None:
        self._repo = repo
        self._settings = settings

    def _expected_role(self, telegram_id: int) -> UserRole:
        """Determine role based on ADMIN_TELEGRAM_IDS env var."""
        if telegram_id in self._settings.admin_telegram_ids:
            return UserRole.ADMIN
        return UserRole.USER

    def is_admin_identity(self, telegram_id: int) -> bool:
        """Return whether environment policy permits bootstrap admin access."""
        return self._expected_role(telegram_id) == UserRole.ADMIN

    async def get_existing(
        self,
        telegram_id: int,
        username: str | None,
        full_name: str,
    ) -> User | None:
        """Return and synchronize an existing user without creating a new one."""
        expected_role = self._expected_role(telegram_id)
        user = await self._repo.get_by_telegram_id(telegram_id)
        if user is None:
            return None
        if not user.is_active:
            raise InactiveUserError
        updates: dict[str, object] = {}
        if user.username != username:
            updates["username"] = username
        if user.full_name != full_name:
            updates["full_name"] = full_name
        if user.role != expected_role:
            updates["role"] = expected_role
        if updates:
            user = await self._repo.update(user, **updates)
        return user

    async def create_registered(
        self,
        telegram_id: int,
        username: str | None,
        full_name: str,
        *,
        invited_by_id: int | None = None,
    ) -> User:
        """Create a user only after registration policy has authorised it."""
        return await self._repo.create(
            id=telegram_id,
            username=username,
            full_name=full_name,
            role=self._expected_role(telegram_id),
            invited_by_id=invited_by_id,
        )

    async def get_active_by_id(self, user_id: int) -> User | None:
        """Return an active local user without synchronizing Telegram profile data."""
        user = await self._repo.get_by_id(user_id)
        return user if user is not None and user.is_active else None

    async def count_invited_by(self, user_id: int) -> int:
        """Return the number of direct registrations attributed to a user."""
        return await self._repo.count_invited_by(user_id)

    async def get_or_create(
        self,
        telegram_id: int,
        username: str | None,
        full_name: str,
    ) -> User:
        """Return existing user or create a new one.

        Syncs username, full_name with Telegram profile data.
        Syncs role with ADMIN_TELEGRAM_IDS env var (ENV is source of truth).
        """
        user = await self.get_existing(telegram_id, username, full_name)
        if user is not None:
            return user
        return await self.create_registered(telegram_id, username, full_name)
