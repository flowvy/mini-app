"""Tribute event planning and administrator-facing entitlement journal."""

from __future__ import annotations

import datetime
import uuid
from typing import Any, Literal, cast

from flowvy.models.commerce_rule import CommerceRule
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.entitlement_operation_action import EntitlementOperationAction
from flowvy.models.tribute_webhook_event import TributeWebhookEvent
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.entitlement_operation_action import (
    EntitlementOperationActionRepository,
)
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.commerce import CommerceRuleResponse
from flowvy.schemas.tribute_webhooks import (
    EntitlementOperationListResponse,
    EntitlementOperationResponse,
    EntitlementOperatorActionInput,
    EntitlementOperatorActionResponse,
    TributeWebhookInboxInput,
)
from flowvy.services.access_profile_snapshot import access_profile_snapshot
from flowvy.services.commerce import (
    CommerceRuleError,
    commerce_rule_response,
    evaluate_commerce_rule,
)

_PURCHASE_PREFIX = "digital_product:purchase:"
_REFUND_PREFIX = "digital_product:refund:"
_MANUAL_RETRY_REASONS = frozenset({"provider_unavailable"})


class EntitlementOperationError(ValueError):
    """Base error for an administrator action on the entitlement journal."""


class EntitlementOperationNotFoundError(EntitlementOperationError):
    """The requested operation does not exist."""


class EntitlementOperationConflictError(EntitlementOperationError):
    """The action conflicts with current or prior operation state."""


def _rule_snapshot(rule: CommerceRule) -> tuple[CommerceRuleResponse, dict[str, object]]:
    response = commerce_rule_response(rule)
    return response, response.model_dump(mode="json")


def _available_actions(
    operation: EntitlementOperation,
) -> list[Literal["retry", "resolve"]]:
    if operation.status != "review":
        return []
    actions: list[Literal["retry", "resolve"]] = ["resolve"]
    if operation.reason_code in _MANUAL_RETRY_REASONS:
        actions.insert(0, "retry")
    return actions


def _action_response(
    action: EntitlementOperationAction | None,
) -> EntitlementOperatorActionResponse | None:
    if action is None:
        return None
    return EntitlementOperatorActionResponse(
        action=cast(Literal["retry", "resolve"], action.action),
        note=action.note,
        created_at=action.created_at,
    )


def _operation_response(
    operation: EntitlementOperation,
    last_action: EntitlementOperationAction | None = None,
) -> EntitlementOperationResponse:
    return EntitlementOperationResponse(
        id=str(operation.id),
        event_name=operation.event_name,
        operation_kind=operation.operation_kind,  # type: ignore[arg-type]
        status=operation.status,  # type: ignore[arg-type]
        reason_code=operation.reason_code,
        provider_created_at=operation.provider_created_at,
        telegram_user_id=operation.telegram_user_id,
        external_item_id=operation.external_item_id,
        amount_minor=operation.amount_minor,
        currency=operation.currency,
        duration_days=operation.duration_days,
        target_expiry=operation.target_expiry,
        attempt_count=operation.attempt_count,
        created_at=operation.created_at,
        available_actions=_available_actions(operation),
        last_action=_action_response(last_action),
    )


class TributeEntitlementPlanner:
    """Turn one authenticated inbox row into exactly one safe durable decision."""

    def __init__(
        self,
        operations: EntitlementOperationRepository,
        rules: CommerceRuleRepository,
        profiles: AccessProfileRepository,
        users: UserRepository,
        subscriptions: SubscriptionRepository,
    ) -> None:
        self._operations = operations
        self._rules = rules
        self._profiles = profiles
        self._users = users
        self._subscriptions = subscriptions

    async def plan(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
    ) -> EntitlementOperation | None:
        """Persist a grant/refund plan or an explicit review-only outcome."""
        if event.event_name == "new_digital_product":
            return await self._plan_digital_purchase(source, event)
        if event.event_name == "digital_product_refunded":
            return await self._plan_digital_refund(source, event)
        reason = (
            "cancellation_is_not_refund"
            if event.event_name in {"cancelled_subscription", "cancelled_donation"}
            else (
                "semantic_identity_unverified"
                if event.event_family in {"donation", "subscription"}
                else "unsupported_event"
            )
        )
        return await self._review(source, event, reason)

    async def _plan_digital_purchase(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
    ) -> EntitlementOperation | None:
        if event.purchase_id is None:
            return await self._review(source, event, "purchase_identity_missing")
        semantic_key = f"{_PURCHASE_PREFIX}{event.purchase_id}"
        refund = await self._operations.get_by_semantic_key(
            "tribute",
            f"{_REFUND_PREFIX}{event.purchase_id}",
            for_update=True,
        )
        if refund is not None:
            if refund.status == "review" and refund.reason_code == "refund_source_not_found":
                await self._operations.update(
                    refund,
                    status="applied",
                    reason_code="grant_cancelled_before_apply",
                )
            return await self._create_once(
                source,
                event,
                semantic_key=semantic_key,
                operation_kind="grant",
                status="cancelled",
                reason_code="purchase_already_refunded",
            )

        if event.telegram_user_id is None:
            return await self._review(
                source,
                event,
                "telegram_identity_missing",
                semantic_key=semantic_key,
                operation_kind="grant",
            )
        user = await self._users.get_by_telegram_id(event.telegram_user_id)
        if user is None:
            return await self._review(
                source,
                event,
                "user_not_found",
                semantic_key=semantic_key,
                operation_kind="grant",
            )
        if not user.is_active:
            return await self._review(
                source,
                event,
                "user_inactive",
                semantic_key=semantic_key,
                operation_kind="grant",
                user_id=user.id,
            )

        subscriptions = [
            subscription
            for subscription in await self._subscriptions.get_by_user_id(user.id)
            if subscription.remnawave_user_id is not None
        ]
        if len(subscriptions) != 1:
            reason = "subscription_not_found" if not subscriptions else "subscription_ambiguous"
            return await self._review(
                source,
                event,
                reason,
                semantic_key=semantic_key,
                operation_kind="grant",
                user_id=user.id,
            )
        subscription = subscriptions[0]

        selected: tuple[CommerceRule, CommerceRuleResponse, int] | None = None
        for rule in await self._rules.list_matching_event(
            provider="tribute",
            commerce_type="digital_product",
            payment_mode="one_time",
            external_item_id=event.external_item_id,
            currency=event.currency or "",
        ):
            response, _snapshot = _rule_snapshot(rule)
            try:
                result = evaluate_commerce_rule(response, event.amount_minor or 0)
            except CommerceRuleError:
                return await self._review(
                    source,
                    event,
                    "rule_calculation_invalid",
                    semantic_key=semantic_key,
                    operation_kind="grant",
                    user_id=user.id,
                    remnawave_user_id=subscription.remnawave_user_id,
                )
            if result.matched and result.duration_days is not None:
                selected = (rule, response, result.duration_days)
                break
        if selected is None:
            return await self._review(
                source,
                event,
                "rule_not_found",
                semantic_key=semantic_key,
                operation_kind="grant",
                user_id=user.id,
                remnawave_user_id=subscription.remnawave_user_id,
            )

        rule, response, duration_days = selected
        profile = await self._profiles.get_active(rule.access_profile_id)
        if profile is None:
            return await self._review(
                source,
                event,
                "profile_unavailable",
                semantic_key=semantic_key,
                operation_kind="grant",
                user_id=user.id,
                remnawave_user_id=subscription.remnawave_user_id,
            )
        if profile.status != "ACTIVE":
            return await self._review(
                source,
                event,
                "profile_not_grantable",
                semantic_key=semantic_key,
                operation_kind="grant",
                user_id=user.id,
                remnawave_user_id=subscription.remnawave_user_id,
            )
        return await self._create_once(
            source,
            event,
            semantic_key=semantic_key,
            operation_kind="grant",
            status="pending",
            user_id=user.id,
            remnawave_user_id=subscription.remnawave_user_id,
            duration_days=duration_days,
            grant_mode=response.grant_mode,
            rule_id=rule.id,
            access_profile_id=profile.id,
            rule_snapshot=response.model_dump(mode="json"),
            profile_snapshot=access_profile_snapshot(profile),
        )

    async def _plan_digital_refund(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
    ) -> EntitlementOperation | None:
        if event.purchase_id is None:
            return await self._review(source, event, "purchase_identity_missing")
        semantic_key = f"{_REFUND_PREFIX}{event.purchase_id}"
        original = await self._operations.get_by_semantic_key(
            "tribute",
            f"{_PURCHASE_PREFIX}{event.purchase_id}",
            for_update=True,
        )
        if original is None:
            return await self._review(
                source,
                event,
                "refund_source_not_found",
                semantic_key=semantic_key,
                operation_kind="refund",
            )
        common: dict[str, Any] = {
            "semantic_key": semantic_key,
            "operation_kind": "refund",
            "root_operation_id": original.id,
            "user_id": original.user_id,
            "remnawave_user_id": original.remnawave_user_id,
        }
        if original.status in {"pending", "retry"}:
            await self._operations.update(
                original,
                status="cancelled",
                reason_code="refunded_before_apply",
                next_attempt_at=None,
                locked_at=None,
            )
            return await self._create_once(
                source,
                event,
                status="applied",
                reason_code="grant_cancelled_before_apply",
                **common,
            )
        if original.status in {"review", "cancelled"}:
            return await self._create_once(
                source,
                event,
                status="review",
                reason_code="no_grant_to_compensate",
                **common,
            )
        return await self._create_once(source, event, status="pending", **common)

    async def _review(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
        reason_code: str,
        *,
        semantic_key: str | None = None,
        operation_kind: str = "review",
        user_id: int | None = None,
        remnawave_user_id: int | None = None,
    ) -> EntitlementOperation | None:
        return await self._create_once(
            source,
            event,
            semantic_key=semantic_key,
            operation_kind=operation_kind,
            status="review",
            reason_code=reason_code,
            user_id=user_id,
            remnawave_user_id=remnawave_user_id,
        )

    async def _create_once(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
        **values: Any,
    ) -> EntitlementOperation | None:
        common: dict[str, Any] = {
            "source_event_id": source.id,
            "provider": "tribute",
            "event_name": event.event_name,
            "provider_created_at": event.provider_created_at,
            "telegram_user_id": event.telegram_user_id,
            "purchase_id": event.purchase_id,
            "transaction_id": event.transaction_id,
            "external_item_id": event.external_item_id,
            "amount_minor": event.amount_minor,
            "currency": event.currency,
        }
        common.update(values)
        return await self._operations.create_once(**common)


class EntitlementJournalService:
    """Allow-listed journal projection and atomic administrator review actions."""

    def __init__(
        self,
        operations: EntitlementOperationRepository,
        actions: EntitlementOperationActionRepository,
    ) -> None:
        self._operations = operations
        self._actions = actions

    async def list_recent(self, limit: int) -> EntitlementOperationListResponse:
        operations, has_more = await self._operations.list_recent(limit=limit)
        latest_actions = await self._actions.latest_for_operations(
            [operation.id for operation in operations],
        )
        return EntitlementOperationListResponse(
            operations=[
                _operation_response(operation, latest_actions.get(operation.id))
                for operation in operations
            ],
            has_more=has_more,
        )

    async def act(
        self,
        operation_id: uuid.UUID,
        payload: EntitlementOperatorActionInput,
        *,
        actor_user_id: int | None,
        actor_telegram_id: int,
    ) -> EntitlementOperationResponse:
        """Apply one idempotent, audited review-state transition."""
        await self._actions.lock_request(payload.request_id)
        operation = await self._operations.get_locked(operation_id)
        if operation is None:
            raise EntitlementOperationNotFoundError("Entitlement operation not found")

        existing = await self._actions.get_by_request_id(payload.request_id)
        if existing is not None:
            if (
                existing.operation_id != operation.id
                or existing.actor_telegram_id != actor_telegram_id
                or existing.action != payload.action
                or existing.note != payload.note
            ):
                raise EntitlementOperationConflictError("Action request ID was already used")
            latest = await self._actions.latest_for_operations([operation.id])
            return _operation_response(operation, latest.get(operation.id))

        available = _available_actions(operation)
        if payload.action not in available:
            raise EntitlementOperationConflictError(
                "Action is not available for the current operation state",
            )

        previous_status = operation.status
        previous_reason = operation.reason_code
        now = datetime.datetime.now(datetime.UTC)
        if payload.action == "retry":
            await self._operations.update(
                operation,
                status="retry",
                reason_code="operator_retry_queued",
                next_attempt_at=now,
                locked_at=None,
            )
        else:
            await self._operations.update(
                operation,
                status="resolved",
                reason_code="operator_resolved",
                next_attempt_at=None,
                locked_at=None,
                operator_note=payload.note,
            )
        action = await self._actions.create(
            request_id=payload.request_id,
            operation_id=operation.id,
            actor_user_id=actor_user_id,
            actor_telegram_id=actor_telegram_id,
            action=payload.action,
            previous_status=previous_status,
            previous_reason_code=previous_reason,
            note=payload.note,
        )
        return _operation_response(operation, action)


__all__ = [
    "EntitlementJournalService",
    "EntitlementOperationConflictError",
    "EntitlementOperationError",
    "EntitlementOperationNotFoundError",
    "TributeEntitlementPlanner",
]
