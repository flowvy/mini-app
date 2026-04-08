"""User business logic."""

from __future__ import annotations

from flowvy.config import Settings
from flowvy.models.user import User, UserRole
from flowvy.repositories.user import UserRepository


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
        expected_role = self._expected_role(telegram_id)
        user = await self._repo.get_by_telegram_id(telegram_id)
        if user is not None:
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
        return await self._repo.create(
            id=telegram_id,
            username=username,
            full_name=full_name,
            role=expected_role,
        )
