"""Persistence for append-only entitlement operator actions."""

from __future__ import annotations

import uuid

from sqlalchemy import select, text

from flowvy.models.entitlement_operation_action import EntitlementOperationAction
from flowvy.repositories.base import BaseRepository


class EntitlementOperationActionRepository(BaseRepository[EntitlementOperationAction]):
    """Record idempotent actions and expose bounded latest-action projections."""

    model = EntitlementOperationAction

    async def lock_request(self, request_id: uuid.UUID) -> None:
        """Serialize reuse of one client request UUID across all operations."""
        await self._session.scalar(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:request_id, 0))"),
            {"request_id": str(request_id)},
        )

    async def get_by_request_id(
        self,
        request_id: uuid.UUID,
    ) -> EntitlementOperationAction | None:
        return (
            await self._session.execute(
                select(EntitlementOperationAction).where(
                    EntitlementOperationAction.request_id == request_id,
                ),
            )
        ).scalar_one_or_none()

    async def latest_for_operations(
        self,
        operation_ids: list[uuid.UUID],
    ) -> dict[uuid.UUID, EntitlementOperationAction]:
        if not operation_ids:
            return {}
        stmt = (
            select(EntitlementOperationAction)
            .where(EntitlementOperationAction.operation_id.in_(operation_ids))
            .distinct(EntitlementOperationAction.operation_id)
            .order_by(
                EntitlementOperationAction.operation_id,
                EntitlementOperationAction.created_at.desc(),
                EntitlementOperationAction.id.desc(),
            )
        )
        rows = list((await self._session.scalars(stmt)).all())
        return {row.operation_id: row for row in rows}


__all__ = ["EntitlementOperationActionRepository"]
