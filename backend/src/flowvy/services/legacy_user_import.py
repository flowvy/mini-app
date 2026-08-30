"""Idempotent import of pre-Flowvy users and their expiring legacy access."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.models.access_profile import AccessProfile
from flowvy.models.entitlement_baseline import EntitlementBaseline
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.subscription import Subscription
from flowvy.repositories.entitlement_baseline import EntitlementBaselineRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.services.access_profile_snapshot import access_profile_snapshot

LEGACY_ACCESS_EVENT = "legacy_access_import"
LEGACY_RESTORE_EVENT = "legacy_access_restore"
FREE_EXPIRES_AT = datetime.datetime(2099, 12, 31, 23, 59, 59, tzinfo=datetime.UTC)
_IMPORTABLE_TAGS = frozenset({"BELIEVER", "FAMILY", "FREE", "INTERNAL"})


class LegacyUserImportError(ValueError):
    """Raised before writes when source or target identities are ambiguous."""


@dataclass(frozen=True, slots=True)
class LegacyUserRecord:
    """One exact old-bot to Remnawave identity prepared for local import."""

    telegram_id: int
    username: str | None
    full_name: str
    remnawave_user_id: int
    remnawave_uuid: uuid.UUID
    status: str
    device_limit: int | None
    expires_at: datetime.datetime
    tag: str


@dataclass(frozen=True, slots=True)
class LegacyImportReport:
    """PII-free import result safe to print in an operator terminal."""

    source_users: int
    existing_users: int
    users_to_create: int
    subscriptions_to_create: int
    subscriptions_to_update: int
    believer_users: int
    baselines_to_create: int
    grants_to_create: int
    restores_to_create: int
    applied: bool


@dataclass(frozen=True, slots=True)
class _PreparedImport:
    free_profile: AccessProfile
    believer_profile: AccessProfile
    free_snapshot: dict[str, object]
    believer_snapshot: dict[str, object]
    existing_users: int
    users_to_create: int
    subscriptions_to_create: int
    subscriptions_to_update: int
    believer_users: int
    baselines_to_create: int
    grants_to_create: int
    restores_to_create: int


class LegacyUserImportService:
    """Validate all identities first, then import one snapshot in one transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._users = UserRepository(session)
        self._subscriptions = SubscriptionRepository(session)
        self._baselines = EntitlementBaselineRepository(session)
        self._operations = EntitlementOperationRepository(session)

    async def run(
        self,
        records: list[LegacyUserRecord],
        *,
        snapshot_at: datetime.datetime,
        apply: bool,
    ) -> LegacyImportReport:
        """Validate the complete snapshot and optionally apply it atomically."""
        normalized_snapshot_at = _aware_utc(snapshot_at, "snapshot_at")
        normalized_records = [_normalize_record(record) for record in records]
        prepared = await self._prepare(normalized_records, normalized_snapshot_at)
        if apply:
            await self._apply(normalized_records, normalized_snapshot_at, prepared)
        return LegacyImportReport(
            source_users=len(normalized_records),
            existing_users=prepared.existing_users,
            users_to_create=prepared.users_to_create,
            subscriptions_to_create=prepared.subscriptions_to_create,
            subscriptions_to_update=prepared.subscriptions_to_update,
            believer_users=prepared.believer_users,
            baselines_to_create=prepared.baselines_to_create,
            grants_to_create=prepared.grants_to_create,
            restores_to_create=prepared.restores_to_create,
            applied=apply,
        )

    async def _prepare(
        self,
        records: list[LegacyUserRecord],
        snapshot_at: datetime.datetime,
    ) -> _PreparedImport:
        if not records:
            raise LegacyUserImportError("Legacy import source is empty")
        _validate_source(records, snapshot_at)
        free_profile = await self._one_active_profile("FREE", validity_mode="lifetime")
        believer_profile = await self._one_active_profile("BELIEVER")
        free_snapshot = access_profile_snapshot(free_profile)
        believer_snapshot = access_profile_snapshot(believer_profile)

        counters = {
            "existing_users": 0,
            "users_to_create": 0,
            "subscriptions_to_create": 0,
            "subscriptions_to_update": 0,
            "believer_users": 0,
            "baselines_to_create": 0,
            "grants_to_create": 0,
            "restores_to_create": 0,
        }
        for record in records:
            user = await self._users.get_by_telegram_id(record.telegram_id)
            if user is None:
                counters["users_to_create"] += 1
            else:
                if not user.is_active:
                    raise LegacyUserImportError(
                        "An imported Telegram identity is locally disabled"
                    )
                counters["existing_users"] += 1

            subscription = await self._validate_subscription(record)
            if subscription is None:
                counters["subscriptions_to_create"] += 1
            elif not _subscription_matches_snapshot(subscription, record):
                counters["subscriptions_to_update"] += 1

            if record.tag != "BELIEVER":
                continue
            counters["believer_users"] += 1
            if await self._validate_baseline(record, free_snapshot) is None:
                counters["baselines_to_create"] += 1
            grant = await self._validate_operation(
                record,
                kind="grant",
                profile_snapshot=believer_snapshot,
                access_profile_id=believer_profile.id,
            )
            if grant is None:
                counters["grants_to_create"] += 1
            restore = await self._validate_operation(
                record,
                kind="restore",
                root=grant,
                profile_snapshot=free_snapshot,
            )
            if restore is not None and grant is None:
                raise LegacyUserImportError("A legacy restore exists without its access operation")
            if restore is None:
                counters["restores_to_create"] += 1

        return _PreparedImport(
            free_profile=free_profile,
            believer_profile=believer_profile,
            free_snapshot=free_snapshot,
            believer_snapshot=believer_snapshot,
            **counters,
        )

    async def _one_active_profile(
        self,
        tag: str,
        *,
        validity_mode: str | None = None,
    ) -> AccessProfile:
        statement = select(AccessProfile).where(
            AccessProfile.is_active.is_(True),
            AccessProfile.tag == tag,
        )
        profiles = list((await self._session.scalars(statement)).all())
        if len(profiles) != 1:
            raise LegacyUserImportError(f"Exactly one active {tag} profile is required")
        profile = profiles[0]
        if validity_mode is not None and profile.validity_mode != validity_mode:
            raise LegacyUserImportError(f"The active {tag} profile must be {validity_mode}")
        if profile.status != "ACTIVE":
            raise LegacyUserImportError(f"The active {tag} profile must grant ACTIVE status")
        return profile

    async def _validate_subscription(self, record: LegacyUserRecord) -> Subscription | None:
        by_id = await self._subscriptions.get_by_remnawave_user_id(record.remnawave_user_id)
        by_uuid = await self._subscriptions.get_by_remnawave_uuid(record.remnawave_uuid)
        if by_id is not None and by_uuid is not None and by_id.id != by_uuid.id:
            raise LegacyUserImportError("Conflicting Remnawave subscription identities")
        subscription = by_id or by_uuid
        if subscription is not None and subscription.user_id != record.telegram_id:
            raise LegacyUserImportError("A Remnawave identity belongs to another local user")
        local = await self._subscriptions.get_by_user_id(record.telegram_id)
        claimed = [item for item in local if item.remnawave_user_id is not None]
        if subscription is None and claimed:
            raise LegacyUserImportError("A local user already has another Remnawave subscription")
        if subscription is not None and any(item.id != subscription.id for item in claimed):
            raise LegacyUserImportError("A local user has ambiguous Remnawave subscriptions")
        return subscription

    async def _validate_baseline(
        self,
        record: LegacyUserRecord,
        free_snapshot: dict[str, object],
    ) -> EntitlementBaseline | None:
        baseline = await self._baselines.get_by_id(record.telegram_id)
        if baseline is None:
            return None
        if (
            not baseline.had_access
            or baseline.remnawave_user_id != record.remnawave_user_id
            or baseline.profile_snapshot != free_snapshot
            or baseline.expires_at is None
            or _aware_utc(baseline.expires_at, "baseline.expires_at") != FREE_EXPIRES_AT
        ):
            raise LegacyUserImportError("A BELIEVER already has a different entitlement baseline")
        return baseline

    async def _validate_operation(
        self,
        record: LegacyUserRecord,
        *,
        kind: str,
        root: EntitlementOperation | None = None,
        profile_snapshot: dict[str, object],
        access_profile_id: uuid.UUID | None = None,
    ) -> EntitlementOperation | None:
        operation = await self._operations.get_by_semantic_key(
            "flowvy",
            _semantic_key(record, kind),
        )
        if operation is None:
            return None
        allowed_statuses = {"applied"} if kind == "grant" else {"pending", "applied", "cancelled"}
        expected_event = LEGACY_ACCESS_EVENT if kind == "grant" else LEGACY_RESTORE_EVENT
        expected_target = record.expires_at if kind == "grant" else FREE_EXPIRES_AT
        if (
            operation.event_name != expected_event
            or operation.operation_kind != kind
            or operation.status not in allowed_statuses
            or operation.user_id != record.telegram_id
            or operation.telegram_user_id != record.telegram_id
            or operation.remnawave_user_id != record.remnawave_user_id
            or operation.profile_snapshot != profile_snapshot
            or operation.access_profile_id != access_profile_id
            or operation.base_expiry is None
            or _aware_utc(operation.base_expiry, "operation.base_expiry") != record.expires_at
            or operation.target_expiry is None
            or _aware_utc(operation.target_expiry, "operation.target_expiry") != expected_target
            or (
                kind == "grant"
                and (operation.grant_mode != "replace" or operation.root_operation_id is not None)
            )
            or (
                kind == "restore"
                and (
                    root is None
                    or operation.root_operation_id != root.id
                    or (
                        operation.status == "pending"
                        and (
                            operation.next_attempt_at is None
                            or _aware_utc(
                                operation.next_attempt_at,
                                "operation.next_attempt_at",
                            )
                            != record.expires_at
                        )
                    )
                )
            )
        ):
            raise LegacyUserImportError(
                "A legacy semantic key already has different operation data"
            )
        return operation

    async def _apply(
        self,
        records: list[LegacyUserRecord],
        snapshot_at: datetime.datetime,
        prepared: _PreparedImport,
    ) -> None:
        for record in records:
            user = await self._users.get_by_telegram_id(record.telegram_id)
            if user is None:
                await self._users.create(
                    id=record.telegram_id,
                    username=record.username,
                    full_name=record.full_name,
                )
            await self._subscriptions.upsert_from_remnawave(
                user_id=record.telegram_id,
                remnawave_user_id=record.remnawave_user_id,
                remnawave_uuid=str(record.remnawave_uuid),
                status=record.status,
                device_limit=record.device_limit,
                expires_at=record.expires_at,
            )
            if record.tag == "BELIEVER":
                await self._apply_believer(record, snapshot_at, prepared)

    async def _apply_believer(
        self,
        record: LegacyUserRecord,
        snapshot_at: datetime.datetime,
        prepared: _PreparedImport,
    ) -> None:
        baseline = await self._baselines.get_by_id(record.telegram_id)
        if baseline is None:
            await self._baselines.create_once(
                user_id=record.telegram_id,
                had_access=True,
                remnawave_user_id=record.remnawave_user_id,
                profile_snapshot=prepared.free_snapshot,
                expires_at=FREE_EXPIRES_AT,
                captured_at=snapshot_at,
            )
        grant = await self._operations.get_by_semantic_key(
            "flowvy",
            _semantic_key(record, "grant"),
        )
        if grant is None:
            grant = await self._operations.create_once(
                provider="flowvy",
                semantic_key=_semantic_key(record, "grant"),
                event_name=LEGACY_ACCESS_EVENT,
                operation_kind="grant",
                status="applied",
                provider_created_at=snapshot_at,
                telegram_user_id=record.telegram_id,
                user_id=record.telegram_id,
                remnawave_user_id=record.remnawave_user_id,
                grant_mode="replace",
                access_profile_id=prepared.believer_profile.id,
                profile_snapshot=prepared.believer_snapshot,
                base_expiry=record.expires_at,
                calculation_at=snapshot_at,
                target_expiry=record.expires_at,
                provider_expiry=record.expires_at,
                applied_at=snapshot_at,
                operator_note=(
                    "Imported legacy access; no payment or provider mutation was created."
                ),
            )
        if grant is None:  # pragma: no cover - preflight and transaction serialization invariant
            raise LegacyUserImportError("Could not create the legacy access operation")
        restore = await self._operations.get_by_semantic_key(
            "flowvy",
            _semantic_key(record, "restore"),
        )
        if restore is None:
            await self._operations.create_once(
                provider="flowvy",
                semantic_key=_semantic_key(record, "restore"),
                event_name=LEGACY_RESTORE_EVENT,
                operation_kind="restore",
                status="pending",
                root_operation_id=grant.id,
                provider_created_at=snapshot_at,
                telegram_user_id=record.telegram_id,
                user_id=record.telegram_id,
                remnawave_user_id=record.remnawave_user_id,
                profile_snapshot=prepared.free_snapshot,
                base_expiry=record.expires_at,
                target_expiry=FREE_EXPIRES_AT,
                next_attempt_at=record.expires_at,
                operator_note="Return imported legacy access to the frozen FREE baseline.",
            )


def _normalize_record(record: LegacyUserRecord) -> LegacyUserRecord:
    return LegacyUserRecord(
        telegram_id=record.telegram_id,
        username=record.username,
        full_name=record.full_name.strip(),
        remnawave_user_id=record.remnawave_user_id,
        remnawave_uuid=record.remnawave_uuid,
        status=record.status.strip().upper(),
        device_limit=record.device_limit,
        expires_at=_aware_utc(record.expires_at, "expires_at"),
        tag=record.tag.strip().upper(),
    )


def _validate_source(records: list[LegacyUserRecord], snapshot_at: datetime.datetime) -> None:
    telegram_ids: set[int] = set()
    provider_ids: set[int] = set()
    provider_uuids: set[uuid.UUID] = set()
    for record in records:
        if record.telegram_id <= 0 or record.remnawave_user_id <= 0:
            raise LegacyUserImportError("Legacy identities must be positive")
        if not record.full_name:
            raise LegacyUserImportError("Every legacy user must have a display name")
        if record.status not in {"ACTIVE", "LIMITED"}:
            raise LegacyUserImportError("Only active provider users may be imported")
        if record.expires_at <= snapshot_at:
            raise LegacyUserImportError("Only unexpired provider users may be imported")
        if record.tag not in _IMPORTABLE_TAGS:
            raise LegacyUserImportError("An unexpected Remnawave tag is present")
        if record.telegram_id in telegram_ids:
            raise LegacyUserImportError("Duplicate Telegram identity in legacy source")
        if record.remnawave_user_id in provider_ids or record.remnawave_uuid in provider_uuids:
            raise LegacyUserImportError("Duplicate Remnawave identity in legacy source")
        telegram_ids.add(record.telegram_id)
        provider_ids.add(record.remnawave_user_id)
        provider_uuids.add(record.remnawave_uuid)


def _subscription_matches_snapshot(subscription: Subscription, record: LegacyUserRecord) -> bool:
    expected_status = "active" if record.status in {"ACTIVE", "LIMITED"} else "suspended"
    return (
        subscription.user_id == record.telegram_id
        and subscription.remnawave_user_id == record.remnawave_user_id
        and subscription.remnawave_uuid == record.remnawave_uuid
        and subscription.status == expected_status
        and subscription.device_limit == record.device_limit
        and subscription.expires_at is not None
        and _aware_utc(subscription.expires_at, "subscription.expires_at") == record.expires_at
    )


def _semantic_key(record: LegacyUserRecord, kind: str) -> str:
    return f"legacy:{kind}:{record.remnawave_uuid}"


def _aware_utc(value: datetime.datetime, field: str) -> datetime.datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        if field in {"subscription.expires_at"}:
            return value.replace(tzinfo=datetime.UTC)
        raise LegacyUserImportError(f"{field} must include a timezone")
    return value.astimezone(datetime.UTC)


__all__ = [
    "FREE_EXPIRES_AT",
    "LEGACY_ACCESS_EVENT",
    "LEGACY_RESTORE_EVENT",
    "LegacyImportReport",
    "LegacyUserImportError",
    "LegacyUserImportService",
    "LegacyUserRecord",
]
