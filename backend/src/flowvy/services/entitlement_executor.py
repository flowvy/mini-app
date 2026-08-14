"""Recoverable provider executor for durable entitlement operations."""

from __future__ import annotations

import asyncio
import datetime
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.config import Settings
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.schemas.registration import AccessProfileInput
from flowvy.schemas.remnawave import RemnawaveUpdateUserRequest, RemnawaveUserData
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError

logger = logging.getLogger(__name__)


def _utc(value: datetime.datetime) -> datetime.datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=datetime.UTC)
    return value.astimezone(datetime.UTC)


def _same_expiry(left: datetime.datetime, right: datetime.datetime) -> bool:
    return _utc(left) == _utc(right)


class EntitlementExecutor:
    """Claim, reconcile, and apply one absolute provider state at a time."""

    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        remnawave: RemnawaveClient,
        settings: Settings,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._remnawave = remnawave
        self._settings = settings

    async def process_next(self) -> bool:
        """Process one due operation, returning false when the queue is empty."""
        operation_id = await self._claim_next()
        if operation_id is None:
            return False
        try:
            await self._process(operation_id)
        except RemnawaveError as exc:
            await self._record_provider_failure(operation_id, exc)
        except Exception:
            logger.exception("Entitlement executor failed")
            await self._record_unexpected_failure(operation_id)
        return True

    async def _claim_next(self) -> uuid.UUID | None:
        now = datetime.datetime.now(datetime.UTC)
        cutoff = now - datetime.timedelta(
            seconds=self._settings.tribute_entitlement_lease_seconds,
        )
        async with self._sessionmaker() as session, session.begin():
            operations = EntitlementOperationRepository(session)
            await operations.recover_stale(cutoff, now)
            operation = await operations.claim_next(now)
            if operation is None:
                return None
            operation.status = "processing"
            operation.reason_code = None
            operation.locked_at = now
            operation.next_attempt_at = None
            operation.attempt_count += 1
            await session.flush()
            return operation.id

    async def _process(self, operation_id: uuid.UUID) -> None:
        operation = await self._load(operation_id)
        if operation is None or operation.status != "processing":
            return
        if operation.remnawave_user_id is None or operation.telegram_user_id is None:
            await self._mark_review(operation_id, "provider_identity_missing")
            return
        provider_user = await self._remnawave.get_user_by_id(operation.remnawave_user_id)
        if provider_user.telegram_id != operation.telegram_user_id:
            await self._mark_review(operation_id, "provider_identity_mismatch")
            return

        if operation.operation_kind == "grant":
            request = await self._prepare_grant(operation_id, provider_user)
        elif operation.operation_kind == "refund":
            request = await self._prepare_refund(operation_id, provider_user)
        else:
            await self._mark_review(operation_id, "unsupported_operation")
            return
        if request is None:
            return

        target = request.expire_at
        if _same_expiry(provider_user.expire_at, target):
            await self._mark_applied(operation_id, provider_user)
            return
        updated = await self._remnawave.update_user_access(provider_user, request)
        if not _same_expiry(updated.expire_at, target):
            await self._mark_review(operation_id, "provider_state_mismatch")
            return
        await self._mark_applied(operation_id, updated)

    async def _prepare_grant(
        self,
        operation_id: uuid.UUID,
        provider_user: RemnawaveUserData,
    ) -> RemnawaveUpdateUserRequest | None:
        now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
        async with self._sessionmaker() as session, session.begin():
            operation = await EntitlementOperationRepository(session).get_locked(operation_id)
            if operation is None or operation.status != "processing":
                return None
            if operation.duration_days is None or operation.profile_snapshot is None:
                operation.status = "review"
                operation.reason_code = "grant_plan_incomplete"
                operation.locked_at = None
                return None
            try:
                profile = AccessProfileInput.model_validate(operation.profile_snapshot)
            except ValueError:
                operation.status = "review"
                operation.reason_code = "profile_snapshot_invalid"
                operation.locked_at = None
                return None
            if profile.status != "ACTIVE":
                operation.status = "review"
                operation.reason_code = "profile_not_grantable"
                operation.locked_at = None
                return None

            provider_expiry = _utc(provider_user.expire_at)
            if operation.target_expiry is None:
                base = max(now, provider_expiry) if operation.grant_mode == "extend" else now
                operation.base_expiry = provider_expiry
                operation.calculation_at = now
                operation.target_expiry = base + datetime.timedelta(days=operation.duration_days)
                operation.provider_expiry = provider_expiry
            elif operation.base_expiry is None:
                operation.status = "review"
                operation.reason_code = "grant_plan_incomplete"
                operation.locked_at = None
                return None
            elif not _same_expiry(provider_expiry, operation.base_expiry) and not _same_expiry(
                provider_expiry,
                operation.target_expiry,
            ):
                operation.status = "review"
                operation.reason_code = "provider_state_conflict"
                operation.provider_expiry = provider_expiry
                operation.locked_at = None
                return None

            return RemnawaveUpdateUserRequest(
                status="ACTIVE",
                traffic_limit_bytes=profile.traffic_limit_bytes,
                traffic_limit_strategy=profile.traffic_limit_strategy,
                expire_at=operation.target_expiry,
                description=profile.description,
                tag=profile.tag,
                hwid_device_limit=profile.hwid_device_limit,
                active_internal_squads=profile.internal_squad_uuids,
                external_squad_uuid=profile.external_squad_uuid,
            )

    async def _prepare_refund(
        self,
        operation_id: uuid.UUID,
        provider_user: RemnawaveUserData,
    ) -> RemnawaveUpdateUserRequest | None:
        now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
        async with self._sessionmaker() as session, session.begin():
            operations = EntitlementOperationRepository(session)
            refund = await operations.get_locked(operation_id)
            if refund is None or refund.status != "processing":
                return None
            if refund.root_operation_id is None:
                refund.status = "review"
                refund.reason_code = "refund_source_not_found"
                refund.locked_at = None
                return None
            original = await operations.get_locked(refund.root_operation_id)
            if original is None or original.base_expiry is None or original.target_expiry is None:
                refund.status = "review"
                refund.reason_code = "refund_history_incomplete"
                refund.locked_at = None
                return None

            desired = _utc(original.base_expiry)
            expected = _utc(original.target_expiry)
            for later in await operations.later_applied_grants(original):
                if (
                    later.calculation_at is None
                    or later.duration_days is None
                    or later.target_expiry is None
                ):
                    refund.status = "review"
                    refund.reason_code = "refund_history_incomplete"
                    refund.locked_at = None
                    return None
                calculated_at = _utc(later.calculation_at)
                base = (
                    max(calculated_at, desired) if later.grant_mode == "extend" else calculated_at
                )
                desired = base + datetime.timedelta(days=later.duration_days)
                expected = _utc(later.target_expiry)

            provider_expiry = _utc(provider_user.expire_at)
            if refund.target_expiry is None:
                if not _same_expiry(provider_expiry, expected):
                    refund.status = "review"
                    refund.reason_code = "provider_state_conflict"
                    refund.provider_expiry = provider_expiry
                    refund.locked_at = None
                    return None
                if desired <= now:
                    refund.status = "review"
                    refund.reason_code = "refund_requires_revocation"
                    refund.provider_expiry = provider_expiry
                    refund.locked_at = None
                    return None
                refund.base_expiry = provider_expiry
                refund.calculation_at = now
                refund.target_expiry = desired
                refund.provider_expiry = provider_expiry
            elif refund.base_expiry is None:
                refund.status = "review"
                refund.reason_code = "refund_history_incomplete"
                refund.locked_at = None
                return None
            elif not _same_expiry(provider_expiry, refund.base_expiry) and not _same_expiry(
                provider_expiry,
                refund.target_expiry,
            ):
                refund.status = "review"
                refund.reason_code = "provider_state_conflict"
                refund.provider_expiry = provider_expiry
                refund.locked_at = None
                return None
            return RemnawaveUpdateUserRequest(expire_at=refund.target_expiry)

    async def _load(self, operation_id: uuid.UUID) -> EntitlementOperation | None:
        async with self._sessionmaker() as session:
            return await EntitlementOperationRepository(session).get_by_id(operation_id)

    async def _mark_applied(
        self,
        operation_id: uuid.UUID,
        provider_user: RemnawaveUserData,
    ) -> None:
        now = datetime.datetime.now(datetime.UTC)
        async with self._sessionmaker() as session, session.begin():
            operation = await EntitlementOperationRepository(session).get_locked(operation_id)
            if operation is None or operation.status != "processing":
                return
            operation.status = "applied"
            operation.reason_code = None
            operation.provider_expiry = provider_user.expire_at
            operation.applied_at = now
            operation.locked_at = None
            operation.next_attempt_at = None
            if operation.user_id is not None:
                await SubscriptionRepository(session).upsert_from_remnawave(
                    user_id=operation.user_id,
                    remnawave_user_id=provider_user.provider_id,
                    remnawave_uuid=provider_user.uuid,
                    status=provider_user.status,
                    device_limit=provider_user.hwid_device_limit,
                    expires_at=provider_user.expire_at,
                )

    async def _mark_review(self, operation_id: uuid.UUID, reason: str) -> None:
        async with self._sessionmaker() as session, session.begin():
            operation = await EntitlementOperationRepository(session).get_locked(operation_id)
            if operation is None or operation.status != "processing":
                return
            operation.status = "review"
            operation.reason_code = reason
            operation.locked_at = None
            operation.next_attempt_at = None

    async def _record_provider_failure(
        self,
        operation_id: uuid.UUID,
        error: RemnawaveError,
    ) -> None:
        async with self._sessionmaker() as session, session.begin():
            operation = await EntitlementOperationRepository(session).get_locked(operation_id)
            if operation is None or operation.status != "processing":
                return
            retry = error.retryable and (
                operation.attempt_count < self._settings.tribute_entitlement_max_attempts
            )
            if retry:
                delay = min(300, 5 * (2 ** max(0, operation.attempt_count - 1)))
                operation.status = "retry"
                operation.reason_code = "provider_temporarily_unavailable"
                operation.next_attempt_at = datetime.datetime.now(
                    datetime.UTC,
                ) + datetime.timedelta(seconds=delay)
            else:
                operation.status = "review"
                operation.reason_code = (
                    "provider_unavailable" if error.retryable else "provider_rejected"
                )
                operation.next_attempt_at = None
            operation.locked_at = None

    async def _record_unexpected_failure(self, operation_id: uuid.UUID) -> None:
        error = RemnawaveError(502, "Internal executor failure", retryable=True)
        await self._record_provider_failure(operation_id, error)


async def run_entitlement_executor(
    executor: EntitlementExecutor,
    interval_seconds: int,
) -> None:
    """Continuously drain due work with a bounded idle interval."""
    while True:
        processed = await executor.process_next()
        if not processed:
            await asyncio.sleep(interval_seconds)


__all__ = ["EntitlementExecutor", "run_entitlement_executor"]
