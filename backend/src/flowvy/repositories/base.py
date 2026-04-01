"""Generic base repository with async CRUD operations."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.models.base import Base


class BaseRepository[ModelT: Base]:
    """Base repository providing common CRUD for any model."""

    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        """Bind repository to a database session."""
        self._session = session

    async def get_by_id(self, entity_id: Any) -> ModelT | None:
        """Fetch a single record by primary key."""
        return await self._session.get(self.model, entity_id)

    async def get_all(
        self,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ModelT]:
        """Fetch a paginated list of records."""
        stmt = select(self.model).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> ModelT:
        """Insert a new record and return it."""
        instance = self.model(**kwargs)
        self._session.add(instance)
        await self._session.flush()
        await self._session.refresh(instance)
        return instance

    async def update(self, instance: ModelT, **kwargs: Any) -> ModelT:
        """Update fields on an existing record."""
        for key, value in kwargs.items():
            setattr(instance, key, value)
        await self._session.flush()
        await self._session.refresh(instance)
        return instance

    async def delete(self, instance: ModelT) -> None:
        """Remove a record from the database."""
        await self._session.delete(instance)
        await self._session.flush()
