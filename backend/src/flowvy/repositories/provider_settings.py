"""Repository for provider_settings singleton."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.models.provider_settings import ProviderSettings


class ProviderSettingsRepository:
    """Data-access for the single ProviderSettings row (id=1)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self) -> ProviderSettings:
        """Return the singleton row, creating it if missing."""
        stmt = select(ProviderSettings).where(ProviderSettings.id == 1)
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            row = ProviderSettings(id=1)
            self._session.add(row)
            await self._session.flush()
            await self._session.refresh(row)
        return row

    async def update_partial(
        self,
        data: dict[str, Any],
    ) -> ProviderSettings:
        """Merge non-None fields into the singleton row."""
        row = await self.get()
        for key, value in data.items():
            setattr(row, key, value)
        await self._session.flush()
        await self._session.refresh(row)
        return row
