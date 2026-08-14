"""Persistence for durable entitlement decisions and provider work."""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from sqlalchemy import and_, exists, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import aliased

from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.repositories.base import BaseRepository


class EntitlementOperationRepository(BaseRepository[EntitlementOperation]):
    """Store semantic decisions once and expose bounded worker/admin queries."""

    model = EntitlementOperation

    async def create_once(self, **values: Any) -> EntitlementOperation | None:
        """Insert one semantic operation, returning none when it already exists."""
        stmt = (
            insert(EntitlementOperation)
            .values(**values)
            .on_conflict_do_nothing()
            .returning(EntitlementOperation)
        )
        return (await self._session.execute(stmt)).scalars().one_or_none()

    async def get_by_semantic_key(
        self,
        provider: str,
        semantic_key: str,
        *,
        for_update: bool = False,
    ) -> EntitlementOperation | None:
        stmt = select(EntitlementOperation).where(
            EntitlementOperation.provider == provider,
            EntitlementOperation.semantic_key == semantic_key,
        )
        if for_update:
            stmt = stmt.with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list_recent(self, *, limit: int) -> tuple[list[EntitlementOperation], bool]:
        stmt = (
            select(EntitlementOperation)
            .order_by(
                EntitlementOperation.provider_created_at.desc(),
                EntitlementOperation.created_at.desc(),
            )
            .limit(limit + 1)
        )
        rows = list((await self._session.scalars(stmt)).all())
        return rows[:limit], len(rows) > limit

    async def claim_next(
        self,
        now: datetime.datetime,
    ) -> EntitlementOperation | None:
        """Lock one due operation while excluding a currently active subject."""
        active_subject = select(EntitlementOperation.user_id).where(
            EntitlementOperation.status == "processing",
            EntitlementOperation.user_id.is_not(None),
        )
        stmt = (
            select(EntitlementOperation)
            .where(
                EntitlementOperation.status.in_(("pending", "retry")),
                or_(
                    EntitlementOperation.next_attempt_at.is_(None),
                    EntitlementOperation.next_attempt_at <= now,
                ),
                or_(
                    EntitlementOperation.user_id.is_(None),
                    EntitlementOperation.user_id.not_in(active_subject),
                ),
            )
            .order_by(
                EntitlementOperation.provider_created_at.asc(),
                EntitlementOperation.created_at.asc(),
            )
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        operation = (await self._session.execute(stmt)).scalar_one_or_none()
        if operation is None or operation.user_id is None:
            return operation

        # Registration uses the positive Telegram ID as its advisory-lock key. The
        # negative key creates a separate entitlement namespace while serializing
        # claims for one user before the partial unique index needs to intervene.
        acquired = await self._session.scalar(
            text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
            {"lock_key": -operation.user_id},
        )
        if acquired is not True:
            return None
        already_processing = await self._session.scalar(
            select(
                exists().where(
                    EntitlementOperation.status == "processing",
                    EntitlementOperation.user_id == operation.user_id,
                ),
            ),
        )
        return None if already_processing else operation

    async def recover_stale(
        self,
        cutoff: datetime.datetime,
        now: datetime.datetime,
    ) -> int:
        """Return abandoned processing leases to the retry queue."""
        result = await self._session.execute(
            select(EntitlementOperation)
            .where(
                EntitlementOperation.status == "processing",
                EntitlementOperation.locked_at < cutoff,
            )
            .with_for_update(skip_locked=True),
        )
        rows = list(result.scalars().all())
        for row in rows:
            row.status = "retry"
            row.reason_code = "worker_interrupted"
            row.next_attempt_at = now
            row.locked_at = None
        await self._session.flush()
        return len(rows)

    async def later_applied_grants(
        self,
        original: EntitlementOperation,
    ) -> list[EntitlementOperation]:
        """Return uncompensated later grants in stable order for refund replay."""
        refund = aliased(EntitlementOperation)
        already_refunded = exists(
            select(refund.id).where(
                refund.root_operation_id == EntitlementOperation.id,
                refund.operation_kind == "refund",
                refund.status == "applied",
            ),
        )
        stmt = (
            select(EntitlementOperation)
            .where(
                EntitlementOperation.user_id == original.user_id,
                EntitlementOperation.operation_kind == "grant",
                EntitlementOperation.status == "applied",
                or_(
                    EntitlementOperation.provider_created_at > original.provider_created_at,
                    and_(
                        EntitlementOperation.provider_created_at == original.provider_created_at,
                        EntitlementOperation.created_at > original.created_at,
                    ),
                ),
                ~already_refunded,
            )
            .order_by(
                EntitlementOperation.provider_created_at.asc(),
                EntitlementOperation.created_at.asc(),
            )
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_locked(self, operation_id: uuid.UUID) -> EntitlementOperation | None:
        return (
            await self._session.execute(
                select(EntitlementOperation)
                .where(EntitlementOperation.id == operation_id)
                .with_for_update(),
            )
        ).scalar_one_or_none()


__all__ = ["EntitlementOperationRepository"]
