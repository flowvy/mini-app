"""Recoverable provider executor for durable entitlement operations."""

from __future__ import annotations

import asyncio
import datetime
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.config import Settings
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.entitlement_baseline import EntitlementBaselineRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.referral_conversion import ReferralConversionRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.registration import AccessProfileInput
from flowvy.schemas.remnawave import (
    RemnawaveCreateUserRequest,
    RemnawaveUpdateUserRequest,
    RemnawaveUserData,
)
from flowvy.services.access_profile_snapshot import access_profile_snapshot
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError

logger = logging.getLogger(__name__)


def _utc(value: datetime.datetime) -> datetime.datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=datetime.UTC)
    return value.astimezone(datetime.UTC)


def _provider_expiry(value: datetime.datetime) -> datetime.datetime:
    """Normalize to the millisecond precision observed at the Remnawave boundary."""
    normalized = _utc(value)
    return normalized.replace(microsecond=(normalized.microsecond // 1000) * 1000)


def _same_expiry(left: datetime.datetime, right: datetime.datetime) -> bool:
    return _provider_expiry(left) == _provider_expiry(right)


def _profile_request(
    profile: AccessProfileInput,
    expire_at: datetime.datetime,
) -> RemnawaveUpdateUserRequest:
    """Build an explicit full-profile update, including nullable fields to clear."""
    return RemnawaveUpdateUserRequest(
        status="ACTIVE",
        traffic_limit_bytes=profile.traffic_limit_bytes,
        traffic_limit_strategy=profile.traffic_limit_strategy,
        expire_at=_provider_expiry(expire_at),
        description=profile.description,
        tag=profile.tag,
        hwid_device_limit=profile.hwid_device_limit,
        active_internal_squads=profile.internal_squad_uuids,
        external_squad_uuid=profile.external_squad_uuid,
    )


def _create_request(
    telegram_id: int,
    request: RemnawaveUpdateUserRequest,
) -> RemnawaveCreateUserRequest:
    """Convert a validated paid-access target into the official create-user subset."""
    if (
        request.status != "ACTIVE"
        or request.traffic_limit_bytes is None
        or request.traffic_limit_strategy is None
        or request.active_internal_squads is None
    ):
        raise ValueError("Paid access target is incomplete")
    return RemnawaveCreateUserRequest(
        username=f"tg_{telegram_id}",
        status=request.status,
        traffic_limit_bytes=request.traffic_limit_bytes,
        traffic_limit_strategy=request.traffic_limit_strategy,
        expire_at=request.expire_at,
        description=request.description,
        tag=request.tag,
        telegram_id=telegram_id,
        hwid_device_limit=request.hwid_device_limit,
        active_internal_squads=request.active_internal_squads,
        external_squad_uuid=request.external_squad_uuid,
    )


def _matches_request(
    provider_user: RemnawaveUserData,
    request: RemnawaveUpdateUserRequest,
) -> bool:
    """Compare every explicitly requested access field, not expiry alone."""
    if not _same_expiry(provider_user.expire_at, request.expire_at):
        return False
    comparisons = {
        "status": provider_user.status,
        "traffic_limit_bytes": provider_user.traffic_limit_bytes,
        "traffic_limit_strategy": provider_user.traffic_limit_strategy,
        "description": provider_user.description,
        "tag": provider_user.tag,
        "hwid_device_limit": provider_user.hwid_device_limit,
        "external_squad_uuid": provider_user.external_squad_uuid,
    }
    for field, current in comparisons.items():
        if field in request.model_fields_set:
            desired = getattr(request, field)
            if field == "external_squad_uuid":
                desired = str(desired) if desired is not None else None
            if current != desired:
                return False
    if "active_internal_squads" in request.model_fields_set:
        current_squads = {item.uuid for item in provider_user.active_internal_squads}
        desired_squads = {str(item) for item in request.active_internal_squads or []}
        if current_squads != desired_squads:
            return False
    return True


def _provider_profile_snapshot(provider_user: RemnawaveUserData) -> dict[str, object]:
    """Capture only the documented access fields Flowvy can restore exactly."""
    return AccessProfileInput(
        name="Captured base access",
        validity_mode="fixed",
        fixed_expire_at=provider_user.expire_at,
        traffic_limit_bytes=provider_user.traffic_limit_bytes,
        traffic_limit_strategy=provider_user.traffic_limit_strategy,  # type: ignore[arg-type]
        hwid_device_limit=provider_user.hwid_device_limit,
        tag=provider_user.tag,
        description=provider_user.description,
        status="ACTIVE",
        internal_squad_uuids=[
            uuid.UUID(item.uuid) for item in provider_user.active_internal_squads
        ],
        external_squad_uuid=(
            uuid.UUID(provider_user.external_squad_uuid)
            if provider_user.external_squad_uuid is not None
            else None
        ),
    ).model_dump(mode="json")


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
        if operation.telegram_user_id is None or operation.user_id is None:
            await self._mark_review(operation_id, "provider_identity_missing")
            return
        provider_user = (
            await self._remnawave.get_user_by_id(operation.remnawave_user_id)
            if operation.remnawave_user_id is not None
            else await self._remnawave.get_user_by_telegram_id(operation.telegram_user_id)
        )
        if provider_user is not None and provider_user.telegram_id != operation.telegram_user_id:
            await self._mark_review(operation_id, "provider_identity_mismatch")
            return

        if operation.operation_kind == "grant":
            if not await self._ensure_baseline(operation_id, provider_user):
                return
            request = await self._prepare_grant(operation_id, provider_user)
        elif operation.operation_kind == "refund":
            if provider_user is None:
                await self._mark_review(operation_id, "provider_identity_missing")
                return
            request = await self._prepare_refund(operation_id, provider_user)
        elif operation.operation_kind == "restore":
            if provider_user is None:
                await self._mark_review(operation_id, "provider_identity_missing")
                return
            request = await self._prepare_restore(operation_id, provider_user)
        else:
            await self._mark_review(operation_id, "unsupported_operation")
            return
        if request is None:
            return

        if provider_user is None:
            try:
                create_request = _create_request(operation.telegram_user_id, request)
            except ValueError:
                await self._mark_review(operation_id, "grant_plan_incomplete")
                return
            created = await self._remnawave.create_user(create_request)
            if not _matches_request(created, request):
                await self._mark_review(operation_id, "provider_state_mismatch")
                return
            await self._mark_applied(operation_id, created)
            return
        if _matches_request(provider_user, request):
            await self._mark_applied(operation_id, provider_user)
            return
        updated = await self._remnawave.update_user_access(provider_user, request)
        if not _matches_request(updated, request):
            await self._mark_review(operation_id, "provider_state_mismatch")
            return
        await self._mark_applied(operation_id, updated)

    async def _ensure_baseline(
        self,
        operation_id: uuid.UUID,
        provider_user: RemnawaveUserData | None,
    ) -> bool:
        """Capture the pre-paid provider state exactly once before any mutation."""
        now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
        async with self._sessionmaker() as session, session.begin():
            operation = await EntitlementOperationRepository(session).get_locked(operation_id)
            if operation is None or operation.status != "processing" or operation.user_id is None:
                return False
            baselines = EntitlementBaselineRepository(session)
            baseline = await baselines.get_by_id(operation.user_id)
            if baseline is not None:
                if (
                    baseline.remnawave_user_id is not None
                    and provider_user is not None
                    and baseline.remnawave_user_id != provider_user.provider_id
                ):
                    operation.status = "review"
                    operation.reason_code = "provider_identity_mismatch"
                    operation.locked_at = None
                    return False
                return True

            if provider_user is None:
                await baselines.create_once(
                    user_id=operation.user_id,
                    had_access=False,
                    remnawave_user_id=None,
                    profile_snapshot=None,
                    expires_at=None,
                )
                return True
            if provider_user.status in {"LIMITED", "UNKNOWN"}:
                operation.status = "review"
                operation.reason_code = "provider_state_not_restorable"
                operation.provider_expiry = provider_user.expire_at
                operation.locked_at = None
                return False
            had_access = provider_user.status == "ACTIVE" and _utc(provider_user.expire_at) > now
            try:
                snapshot = _provider_profile_snapshot(provider_user) if had_access else None
            except (TypeError, ValueError):
                operation.status = "review"
                operation.reason_code = "provider_state_not_restorable"
                operation.provider_expiry = provider_user.expire_at
                operation.locked_at = None
                return False
            await baselines.create_once(
                user_id=operation.user_id,
                had_access=had_access,
                remnawave_user_id=provider_user.provider_id,
                profile_snapshot=snapshot,
                expires_at=provider_user.expire_at if had_access else None,
            )
            return True

    async def _prepare_grant(
        self,
        operation_id: uuid.UUID,
        provider_user: RemnawaveUserData | None,
    ) -> RemnawaveUpdateUserRequest | None:
        now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
        async with self._sessionmaker() as session, session.begin():
            operations = EntitlementOperationRepository(session)
            operation = await operations.get_locked(operation_id)
            if operation is None or operation.status != "processing":
                return None
            if operation.user_id is None:
                operation.status = "review"
                operation.reason_code = "provider_identity_missing"
                operation.locked_at = None
                return None
            absolute_target = (
                operation.duration_days is None and operation.target_expiry is not None
            )
            if operation.profile_snapshot is None or (
                operation.duration_days is None and not absolute_target
            ):
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

            provider_expiry = _utc(provider_user.expire_at) if provider_user is not None else now
            latest_provider = await operations.latest_applied_provider_operation(operation.user_id)
            if provider_user is not None and latest_provider is not None:
                expected_provider_expiry = latest_provider.target_expiry
                if (
                    expected_provider_expiry is not None
                    and not _same_expiry(provider_expiry, expected_provider_expiry)
                    and (
                        operation.target_expiry is None
                        or not _same_expiry(provider_expiry, operation.target_expiry)
                    )
                ):
                    operation.status = "review"
                    operation.reason_code = "provider_state_conflict"
                    operation.provider_expiry = provider_expiry
                    operation.locked_at = None
                    return None

            paid_grants = await operations.uncompensated_applied_grants(operation.user_id)
            paid_expiries = [
                _utc(item.target_expiry)
                for item in paid_grants
                if item.target_expiry is not None and _utc(item.target_expiry) > now
            ]
            latest_paid_expiry = max(paid_expiries, default=None)
            if absolute_target:
                assert operation.target_expiry is not None
                operation.target_expiry = _provider_expiry(operation.target_expiry)
                if operation.target_expiry <= now:
                    operation.status = "review"
                    operation.reason_code = "provider_entitlement_expired"
                    operation.provider_expiry = provider_expiry
                    operation.locked_at = None
                    return None
                if operation.base_expiry is None:
                    if (
                        latest_paid_expiry is not None
                        and latest_paid_expiry > operation.target_expiry
                    ):
                        operation.status = "review"
                        operation.reason_code = "paid_state_ahead"
                        operation.provider_expiry = provider_expiry
                        operation.locked_at = None
                        return None
                    operation.base_expiry = provider_expiry
                    operation.calculation_at = now
                    operation.provider_expiry = provider_expiry
                elif (
                    provider_user is not None
                    and not _same_expiry(
                        provider_expiry,
                        operation.base_expiry,
                    )
                    and not _same_expiry(provider_expiry, operation.target_expiry)
                ):
                    operation.status = "review"
                    operation.reason_code = "provider_state_conflict"
                    operation.provider_expiry = provider_expiry
                    operation.locked_at = None
                    return None
            elif operation.target_expiry is None:
                assert operation.duration_days is not None
                base = (
                    max(now, latest_paid_expiry)
                    if operation.grant_mode == "extend" and latest_paid_expiry is not None
                    else now
                )
                operation.base_expiry = provider_expiry
                operation.calculation_at = now
                operation.target_expiry = base + datetime.timedelta(days=operation.duration_days)
                operation.provider_expiry = provider_expiry
            elif operation.base_expiry is None:
                operation.status = "review"
                operation.reason_code = "grant_plan_incomplete"
                operation.locked_at = None
                return None
            elif (
                provider_user is not None
                and not _same_expiry(
                    provider_expiry,
                    operation.base_expiry,
                )
                and not _same_expiry(provider_expiry, operation.target_expiry)
            ):
                operation.status = "review"
                operation.reason_code = "provider_state_conflict"
                operation.provider_expiry = provider_expiry
                operation.locked_at = None
                return None

            return _profile_request(profile, operation.target_expiry)

    async def _prepare_refund(
        self,
        operation_id: uuid.UUID,
        provider_user: RemnawaveUserData,
    ) -> RemnawaveUpdateUserRequest | None:
        now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
        async with self._sessionmaker() as session, session.begin():
            operations = EntitlementOperationRepository(session)
            refund = await operations.get_locked(operation_id)
            if refund is None or refund.status != "processing" or refund.user_id is None:
                return None
            if refund.root_operation_id is None:
                refund.status = "review"
                refund.reason_code = "refund_source_not_found"
                refund.locked_at = None
                return None
            original = await operations.get_locked(refund.root_operation_id)
            if original is None or original.target_expiry is None:
                refund.status = "review"
                refund.reason_code = "refund_history_incomplete"
                refund.locked_at = None
                return None

            baseline = await EntitlementBaselineRepository(session).get_by_id(refund.user_id)
            if baseline is None:
                refund.status = "review"
                refund.reason_code = "baseline_missing"
                refund.locked_at = None
                return None

            desired_paid_expiry: datetime.datetime | None = None
            desired_profile: AccessProfileInput | None = None
            for grant in await operations.uncompensated_applied_grants(
                refund.user_id,
                exclude_id=original.id,
            ):
                if grant.target_expiry is None or grant.profile_snapshot is None:
                    refund.status = "review"
                    refund.reason_code = "refund_history_incomplete"
                    refund.locked_at = None
                    return None
                try:
                    desired_profile = AccessProfileInput.model_validate(grant.profile_snapshot)
                except ValueError:
                    refund.status = "review"
                    refund.reason_code = "profile_snapshot_invalid"
                    refund.locked_at = None
                    return None
                if grant.duration_days is None:
                    desired_paid_expiry = _utc(grant.target_expiry)
                else:
                    if grant.calculation_at is None:
                        refund.status = "review"
                        refund.reason_code = "refund_history_incomplete"
                        refund.locked_at = None
                        return None
                    calculated_at = _utc(grant.calculation_at)
                    base = (
                        max(calculated_at, desired_paid_expiry)
                        if grant.grant_mode == "extend" and desired_paid_expiry is not None
                        else calculated_at
                    )
                    desired_paid_expiry = base + datetime.timedelta(days=grant.duration_days)
            if desired_paid_expiry is not None and desired_paid_expiry <= now:
                desired_paid_expiry = None
                desired_profile = None

            provider_expiry = _utc(provider_user.expire_at)
            if refund.target_expiry is None:
                latest_provider = await operations.latest_applied_provider_operation(
                    refund.user_id
                )
                expected = (
                    latest_provider.target_expiry
                    if latest_provider is not None
                    else original.target_expiry
                )
                if expected is None or not _same_expiry(provider_expiry, expected):
                    refund.status = "review"
                    refund.reason_code = "provider_state_conflict"
                    refund.provider_expiry = provider_expiry
                    refund.locked_at = None
                    return None
                refund.base_expiry = provider_expiry
                refund.calculation_at = now
                refund.provider_expiry = provider_expiry
                if desired_paid_expiry is not None and desired_profile is not None:
                    refund.target_expiry = desired_paid_expiry
                    refund.profile_snapshot = desired_profile.model_dump(mode="json")
                elif (
                    baseline.had_access
                    and baseline.expires_at is not None
                    and baseline.profile_snapshot is not None
                    and _utc(baseline.expires_at) > now
                ):
                    refund.target_expiry = _utc(baseline.expires_at)
                    refund.profile_snapshot = baseline.profile_snapshot
                else:
                    refund.target_expiry = now
                    refund.profile_snapshot = None
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
            if refund.profile_snapshot is None:
                return RemnawaveUpdateUserRequest(
                    status="DISABLED",
                    expire_at=refund.target_expiry,
                )
            try:
                profile = AccessProfileInput.model_validate(refund.profile_snapshot)
            except ValueError:
                refund.status = "review"
                refund.reason_code = "profile_snapshot_invalid"
                refund.locked_at = None
                return None
            return _profile_request(profile, refund.target_expiry)

    async def _prepare_restore(
        self,
        operation_id: uuid.UUID,
        provider_user: RemnawaveUserData,
    ) -> RemnawaveUpdateUserRequest | None:
        """Restore the durable pre-paid source after the effective paid term ends."""
        now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
        async with self._sessionmaker() as session, session.begin():
            operations = EntitlementOperationRepository(session)
            restore = await operations.get_locked(operation_id)
            if restore is None or restore.status != "processing" or restore.user_id is None:
                return None
            baseline = await EntitlementBaselineRepository(session).get_by_id(restore.user_id)
            if baseline is None or restore.base_expiry is None:
                restore.status = "review"
                restore.reason_code = "baseline_missing"
                restore.locked_at = None
                return None
            provider_expiry = _utc(provider_user.expire_at)
            if not _same_expiry(provider_expiry, restore.base_expiry) and (
                restore.target_expiry is None
                or not _same_expiry(provider_expiry, restore.target_expiry)
            ):
                restore.status = "review"
                restore.reason_code = "provider_state_conflict"
                restore.provider_expiry = provider_expiry
                restore.locked_at = None
                return None
            restore.calculation_at = restore.calculation_at or now
            restore.provider_expiry = provider_expiry
            if (
                baseline.had_access
                and baseline.expires_at is not None
                and baseline.profile_snapshot is not None
                and _utc(baseline.expires_at) > now
            ):
                restore.target_expiry = _utc(baseline.expires_at)
                try:
                    profile = AccessProfileInput.model_validate(baseline.profile_snapshot)
                except ValueError:
                    restore.status = "review"
                    restore.reason_code = "profile_snapshot_invalid"
                    restore.locked_at = None
                    return None
                return _profile_request(profile, restore.target_expiry)
            restore.target_expiry = restore.target_expiry or now
            return RemnawaveUpdateUserRequest(
                status="DISABLED",
                expire_at=restore.target_expiry,
            )

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
            operation.remnawave_user_id = provider_user.provider_id
            if operation.user_id is not None:
                await SubscriptionRepository(session).upsert_from_remnawave(
                    user_id=operation.user_id,
                    remnawave_user_id=provider_user.provider_id,
                    remnawave_uuid=provider_user.uuid,
                    status=provider_user.status,
                    device_limit=provider_user.hwid_device_limit,
                    expires_at=provider_user.expire_at,
                )
                if operation.operation_kind in {"grant", "refund"}:
                    operations = EntitlementOperationRepository(session)
                    await operations.cancel_scheduled_restores(
                        operation.user_id,
                        "superseded_by_effective_access",
                    )
                    await session.flush()
                    paid_grants = await operations.uncompensated_applied_grants(
                        operation.user_id,
                    )
                    paid_remains = any(
                        item.target_expiry is not None and _utc(item.target_expiry) > now
                        for item in paid_grants
                    )
                    if (
                        paid_remains
                        and operation.target_expiry is not None
                        and _utc(operation.target_expiry) > now
                    ):
                        await self._schedule_restore(
                            session,
                            operation,
                            provider_user,
                        )
                await self._create_referral_reward(session, operation, now)

    async def _create_referral_reward(
        self,
        session: AsyncSession,
        source: EntitlementOperation,
        now: datetime.datetime,
    ) -> None:
        """Create one inviter grant after an invitee's first applied Tribute payment."""
        if (
            source.provider != "tribute"
            or source.operation_kind != "grant"
            or source.status != "applied"
            or source.user_id is None
        ):
            return
        invitee = await UserRepository(session).get_by_telegram_id(source.user_id)
        if invitee is None or invitee.invited_by_id is None:
            return

        inviter_id = invitee.invited_by_id
        inviter = await UserRepository(session).get_by_telegram_id(inviter_id)
        settings = await ProviderSettingsRepository(session).get()
        reward_days = settings.referral_reward_days if settings.referral_reward_enabled else None
        profile = (
            await AccessProfileRepository(session).get_active(
                settings.referral_reward_access_profile_id
            )
            if settings.referral_reward_access_profile_id is not None
            else None
        )

        reason_code: str | None = None
        if not settings.referral_reward_enabled:
            reason_code = "referral_reward_disabled"
        elif inviter is None or not inviter.is_active or inviter.id == invitee.id:
            reason_code = "referral_inviter_unavailable"
        elif reward_days is None:
            reason_code = "referral_reward_invalid"
        elif (
            profile is None or profile.validity_mode != "automation" or profile.status != "ACTIVE"
        ):
            reason_code = "referral_profile_unavailable"

        conversion = await ReferralConversionRepository(session).create_once(
            inviter_user_id=inviter_id,
            invitee_user_id=invitee.id,
            source_operation_id=source.id,
            reward_days=reward_days,
            reason_code=reason_code,
        )
        if conversion is None or reason_code is not None or inviter is None or profile is None:
            return

        semantic_key = f"referral:invitee:{invitee.id}"
        operations = EntitlementOperationRepository(session)
        reward = await operations.create_once(
            provider="flowvy",
            semantic_key=semantic_key,
            event_name="referral_reward",
            operation_kind="grant",
            status="pending",
            provider_created_at=now,
            telegram_user_id=inviter.id,
            user_id=inviter.id,
            duration_days=reward_days,
            grant_mode="extend",
            access_profile_id=profile.id,
            profile_snapshot=access_profile_snapshot(profile),
        )
        if reward is None:
            reward = await operations.get_by_semantic_key("flowvy", semantic_key)
        if reward is not None:
            conversion.reward_operation_id = reward.id
            await session.flush()

    async def _schedule_restore(
        self,
        session: AsyncSession,
        source: EntitlementOperation,
        provider_user: RemnawaveUserData,
    ) -> None:
        """Schedule one idempotent return to the captured base source."""
        if (
            source.user_id is None
            or source.telegram_user_id is None
            or source.target_expiry is None
        ):
            return
        baseline = await EntitlementBaselineRepository(session).get_by_id(source.user_id)
        if baseline is None:
            return
        due_at = _utc(source.target_expiry)
        restore_target = (
            _utc(baseline.expires_at)
            if baseline.had_access
            and baseline.expires_at is not None
            and _utc(baseline.expires_at) > due_at
            else None
        )
        await EntitlementOperationRepository(session).create_once(
            provider="tribute",
            semantic_key=f"effective_access:restore:{source.id}",
            event_name="effective_access_restore",
            operation_kind="restore",
            status="pending",
            root_operation_id=source.id,
            provider_created_at=datetime.datetime.now(datetime.UTC),
            telegram_user_id=source.telegram_user_id,
            user_id=source.user_id,
            remnawave_user_id=provider_user.provider_id,
            profile_snapshot=baseline.profile_snapshot if restore_target is not None else None,
            base_expiry=due_at,
            target_expiry=restore_target,
            next_attempt_at=due_at,
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
