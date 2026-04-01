"""User business logic."""

from __future__ import annotations

from flowvy.models.user import User
from flowvy.repositories.user import UserRepository


class UserService:
    """Operations on users: lookup, creation, profile sync."""

    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    async def get_or_create(
        self,
        telegram_id: int,
        username: str | None,
        full_name: str,
    ) -> User:
        """Return existing user or create a new one.

        If the user already exists but username/full_name changed,
        update the record to stay in sync with Telegram.
        """
        user = await self._repo.get_by_telegram_id(telegram_id)
        if user is not None:
            if user.username != username or user.full_name != full_name:
                user = await self._repo.update(
                    user,
                    username=username,
                    full_name=full_name,
                )
            return user
        return await self._repo.create(
            id=telegram_id,
            username=username,
            full_name=full_name,
        )
