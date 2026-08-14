"""Atomic, idempotent administrator actions on entitlement review rows."""

from __future__ import annotations

import asyncio
import datetime
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.models.entitlement_operation_action import EntitlementOperationAction
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.entitlement_operation_action import (
    EntitlementOperationActionRepository,
)
from flowvy.repositories.user import UserRepository
from flowvy.schemas.tribute_webhooks import EntitlementOperatorActionInput
from flowvy.services.entitlements import (
    EntitlementJournalService,
    EntitlementOperationConflictError,
)

_ADMIN_ID = 123


def _service(session: AsyncSession) -> EntitlementJournalService:
    return EntitlementJournalService(
        EntitlementOperationRepository(session),
        EntitlementOperationActionRepository(session),
    )


async def _seed_review(
    session: AsyncSession,
    *,
    reason: str = "provider_unavailable",
):
    if await UserRepository(session).get_by_id(_ADMIN_ID) is None:
        await UserRepository(session).create(
            id=_ADMIN_ID,
            username="admin",
            full_name="Test Admin",
        )
    return await EntitlementOperationRepository(session).create(
        provider="tribute",
        semantic_key=f"operator-test:{uuid.uuid4()}",
        event_name="new_digital_product",
        operation_kind="grant",
        status="review",
        reason_code=reason,
        provider_created_at=datetime.datetime.now(datetime.UTC),
        telegram_user_id=_ADMIN_ID,
        user_id=_ADMIN_ID,
        remnawave_user_id=42,
        purchase_id="78901",
        external_item_id="456",
        amount_minor=500,
        currency="RUB",
        duration_days=30,
        grant_mode="extend",
    )


def test_action_payload_requires_a_bounded_note_only_for_resolve() -> None:
    with pytest.raises(ValidationError):
        EntitlementOperatorActionInput(
            request_id=uuid.uuid4(),
            action="resolve",
            note="   ",
        )
    with pytest.raises(ValidationError):
        EntitlementOperatorActionInput(
            request_id=uuid.uuid4(),
            action="retry",
            note="not accepted",
        )

    payload = EntitlementOperatorActionInput(
        request_id=uuid.uuid4(),
        action="resolve",
        note="  Investigated; no access change required.  ",
    )

    assert payload.note == "Investigated; no access change required."


@pytest.mark.asyncio
async def test_journal_computes_actions_and_exposes_only_latest_safe_audit_context(
    session: AsyncSession,
) -> None:
    operation = await _seed_review(session)
    request_id = uuid.uuid4()

    result = await _service(session).act(
        operation.id,
        EntitlementOperatorActionInput(
            request_id=request_id,
            action="resolve",
            note="No provider mutation was made.",
        ),
        actor_user_id=_ADMIN_ID,
        actor_telegram_id=_ADMIN_ID,
    )

    assert result.status == "resolved"
    assert result.reason_code == "operator_resolved"
    assert result.available_actions == []
    assert result.last_action is not None
    assert result.last_action.action == "resolve"
    assert result.last_action.note == "No provider mutation was made."
    projection = result.model_dump()
    assert "actor_user_id" not in projection
    assert "actor_telegram_id" not in projection
    assert "transaction_id" not in projection
    assert "rule_snapshot" not in projection


@pytest.mark.asyncio
async def test_retry_is_idempotent_and_preserves_attempt_history(
    session: AsyncSession,
) -> None:
    operation = await _seed_review(session)
    operation.attempt_count = 3
    request = EntitlementOperatorActionInput(
        request_id=uuid.uuid4(),
        action="retry",
    )
    service = _service(session)

    first = await service.act(
        operation.id,
        request,
        actor_user_id=_ADMIN_ID,
        actor_telegram_id=_ADMIN_ID,
    )
    second = await service.act(
        operation.id,
        request,
        actor_user_id=_ADMIN_ID,
        actor_telegram_id=_ADMIN_ID,
    )

    action_count = await session.scalar(
        select(func.count()).select_from(EntitlementOperationAction),
    )
    assert action_count == 1
    assert first.status == second.status == "retry"
    assert first.reason_code == second.reason_code == "operator_retry_queued"
    assert first.attempt_count == second.attempt_count == 3
    assert first.available_actions == []
    assert first.last_action is not None
    assert first.last_action.action == "retry"


@pytest.mark.asyncio
async def test_retry_is_not_offered_for_non_transient_review(
    session: AsyncSession,
) -> None:
    operation = await _seed_review(session, reason="provider_identity_mismatch")
    service = _service(session)

    listed = await service.list_recent(20)
    assert listed.operations[0].available_actions == ["resolve"]
    with pytest.raises(EntitlementOperationConflictError):
        await service.act(
            operation.id,
            EntitlementOperatorActionInput(
                request_id=uuid.uuid4(),
                action="retry",
            ),
            actor_user_id=_ADMIN_ID,
            actor_telegram_id=_ADMIN_ID,
        )

    assert operation.status == "review"
    assert (
        await session.scalar(
            select(func.count()).select_from(EntitlementOperationAction),
        )
        == 0
    )


@pytest.mark.asyncio
async def test_concurrent_distinct_actions_serialize_on_current_operation_state(
    engine: AsyncEngine,
) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        operation = await _seed_review(session)
        operation_id = operation.id
        await session.commit()

    async def act(payload: EntitlementOperatorActionInput):
        async with factory() as session, session.begin():
            return await _service(session).act(
                operation_id,
                payload,
                actor_user_id=_ADMIN_ID,
                actor_telegram_id=_ADMIN_ID,
            )

    results = await asyncio.gather(
        act(
            EntitlementOperatorActionInput(
                request_id=uuid.uuid4(),
                action="retry",
            ),
        ),
        act(
            EntitlementOperatorActionInput(
                request_id=uuid.uuid4(),
                action="resolve",
                note="Handled without changing access.",
            ),
        ),
        return_exceptions=True,
    )

    assert sum(not isinstance(result, Exception) for result in results) == 1
    assert sum(isinstance(result, EntitlementOperationConflictError) for result in results) == 1
    async with factory() as session:
        stored = await EntitlementOperationRepository(session).get_by_id(operation_id)
        action_count = await session.scalar(
            select(func.count()).select_from(EntitlementOperationAction),
        )
    assert stored is not None
    assert stored.status in {"retry", "resolved"}
    assert action_count == 1


@pytest.mark.asyncio
async def test_request_uuid_cannot_be_reused_for_another_decision(
    session: AsyncSession,
) -> None:
    first = await _seed_review(session)
    second = await _seed_review(session)
    request_id = uuid.uuid4()
    service = _service(session)
    await service.act(
        first.id,
        EntitlementOperatorActionInput(
            request_id=request_id,
            action="resolve",
            note="First decision.",
        ),
        actor_user_id=_ADMIN_ID,
        actor_telegram_id=_ADMIN_ID,
    )

    with pytest.raises(EntitlementOperationConflictError):
        await service.act(
            second.id,
            EntitlementOperatorActionInput(
                request_id=request_id,
                action="resolve",
                note="Second decision.",
            ),
            actor_user_id=_ADMIN_ID,
            actor_telegram_id=_ADMIN_ID,
        )

    assert second.status == "review"
