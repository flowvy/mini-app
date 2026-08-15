"""Tribute event planning and administrator-facing entitlement journal."""

from __future__ import annotations

import datetime
import hashlib
import json
import uuid
from typing import Any, Literal, cast

from flowvy.models.commerce_rule import CommerceRule
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.entitlement_operation_action import EntitlementOperationAction
from flowvy.models.sponsor_checkout import SponsorCheckout
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

_DONATION_PREFIX = "donation:event:"
_CANCELLATION_PREFIX = "payment:cancellation:"
_SUBSCRIPTION_PREFIX = "subscription:state:"
_MANUAL_RETRY_REASONS = frozenset(
    {
        "provider_state_mismatch",
        "provider_unavailable",
    }
)


class EntitlementOperationError(ValueError):
    """Base error for an administrator action on the entitlement journal."""


class EntitlementOperationNotFoundError(EntitlementOperationError):
    """The requested operation does not exist."""


class EntitlementOperationConflictError(EntitlementOperationError):
    """The action conflicts with current or prior operation state."""


def _rule_snapshot(rule: CommerceRule) -> tuple[CommerceRuleResponse, dict[str, object]]:
    response = commerce_rule_response(rule)
    return response, response.model_dump(mode="json")


def _semantic_digest(prefix: str, *values: object) -> str:
    canonical = json.dumps(values, ensure_ascii=True, separators=(",", ":"), default=str)
    return f"{prefix}{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"


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
        *,
        identified_donation_automation_enabled: bool = False,
    ) -> None:
        self._operations = operations
        self._rules = rules
        self._profiles = profiles
        self._users = users
        self._subscriptions = subscriptions
        self._identified_donation_automation_enabled = identified_donation_automation_enabled

    async def plan(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
        *,
        sponsor_checkout: SponsorCheckout | None = None,
        sponsor_checkout_mismatch_reason: str | None = None,
    ) -> EntitlementOperation | None:
        """Persist a grant plan or an explicit review-only outcome."""
        if event.event_name in {"new_subscription", "renewed_subscription"}:
            return await self._plan_subscription(source, event)
        if event.event_name in {"new_donation", "recurrent_donation"}:
            return await self._plan_donation(
                source,
                event,
                sponsor_checkout=sponsor_checkout,
                sponsor_checkout_mismatch_reason=sponsor_checkout_mismatch_reason,
            )
        if event.event_name in {"cancelled_subscription", "cancelled_donation"}:
            return await self._record_cancellation(source, event)
        return await self._review(source, event, "unsupported_event")

    async def _record_cancellation(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
    ) -> EntitlementOperation | None:
        """Record a normal billing stop without mutating already-paid access."""
        semantic_key = _semantic_digest(
            _CANCELLATION_PREFIX,
            event.event_name,
            event.provider_created_at.isoformat(),
            event.external_item_id,
            event.telegram_user_id,
        )
        return await self._create_once(
            source,
            event,
            semantic_key=semantic_key,
            operation_kind="review",
            status="resolved",
            reason_code="cancellation_is_not_refund",
        )

    async def _plan_subscription(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
    ) -> EntitlementOperation | None:
        if event.external_item_id is None:
            return await self._review(source, event, "subscription_identity_missing")
        if event.provider_expires_at is None:
            return await self._review(source, event, "provider_expiry_missing")
        semantic_key = _semantic_digest(
            _SUBSCRIPTION_PREFIX,
            event.external_item_id,
            event.telegram_user_id,
            event.provider_expires_at.isoformat(),
        )
        return await self._plan_grant_from_rule(
            source,
            event,
            semantic_key=semantic_key,
            commerce_type="subscription",
            rule_external_item_id=event.external_item_id,
            target_expiry=event.provider_expires_at,
        )

    async def _plan_donation(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
        *,
        sponsor_checkout: SponsorCheckout | None,
        sponsor_checkout_mismatch_reason: str | None,
    ) -> EntitlementOperation | None:
        semantic_key = _semantic_digest(
            _DONATION_PREFIX,
            event.event_name,
            event.provider_created_at.isoformat(),
            event.external_item_id,
            event.telegram_user_id,
            event.amount_minor,
            event.currency,
            event.payment_mode,
            event.provider_period,
        )
        if event.is_anonymous is not False:
            reason = "anonymous_donation" if event.is_anonymous else "donation_identity_missing"
            return await self._review(
                source,
                event,
                reason,
                semantic_key=semantic_key,
                operation_kind="grant",
            )
        if not self._identified_donation_automation_enabled:
            return await self._review(
                source,
                event,
                "donation_semantic_evidence_required",
                semantic_key=semantic_key,
                operation_kind="grant",
            )
        if sponsor_checkout_mismatch_reason is not None:
            return await self._review(
                source,
                event,
                sponsor_checkout_mismatch_reason,
                semantic_key=semantic_key,
                operation_kind="grant",
            )

        preferred_rule_id: uuid.UUID | None = None
        if sponsor_checkout is not None:
            raw_rule_id = sponsor_checkout.offer_snapshot.get("commerce_rule_id")
            try:
                preferred_rule_id = uuid.UUID(str(raw_rule_id))
            except (TypeError, ValueError, AttributeError):
                return await self._review(
                    source,
                    event,
                    "donation_offer_mismatch",
                    semantic_key=semantic_key,
                    operation_kind="grant",
                )
        return await self._plan_grant_from_rule(
            source,
            event,
            semantic_key=semantic_key,
            commerce_type="donation",
            rule_external_item_id=None,
            preferred_rule_id=preferred_rule_id,
        )

    async def _plan_grant_from_rule(
        self,
        source: TributeWebhookEvent,
        event: TributeWebhookInboxInput,
        *,
        semantic_key: str,
        commerce_type: str,
        rule_external_item_id: str | None,
        target_expiry: datetime.datetime | None = None,
        preferred_rule_id: uuid.UUID | None = None,
    ) -> EntitlementOperation | None:
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
        if len(subscriptions) > 1:
            return await self._review(
                source,
                event,
                "subscription_ambiguous",
                semantic_key=semantic_key,
                operation_kind="grant",
                user_id=user.id,
            )
        subscription = subscriptions[0] if subscriptions else None

        selected: tuple[CommerceRule, CommerceRuleResponse, int | None] | None = None
        matching_rules = await self._rules.list_matching_event(
            provider="tribute",
            commerce_type=commerce_type,
            payment_mode=event.payment_mode or "",
            external_item_id=rule_external_item_id,
            currency=event.currency or "",
        )
        if preferred_rule_id is not None:
            matching_rules = [rule for rule in matching_rules if rule.id == preferred_rule_id]
        for rule in matching_rules:
            response, _snapshot = _rule_snapshot(rule)
            if target_expiry is not None:
                if response.calculation_type == "provider_expiry":
                    selected = (rule, response, None)
                    break
                continue
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
                    remnawave_user_id=(
                        subscription.remnawave_user_id if subscription is not None else None
                    ),
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
                remnawave_user_id=(
                    subscription.remnawave_user_id if subscription is not None else None
                ),
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
                remnawave_user_id=(
                    subscription.remnawave_user_id if subscription is not None else None
                ),
            )
        if profile.status != "ACTIVE":
            return await self._review(
                source,
                event,
                "profile_not_grantable",
                semantic_key=semantic_key,
                operation_kind="grant",
                user_id=user.id,
                remnawave_user_id=(
                    subscription.remnawave_user_id if subscription is not None else None
                ),
            )
        return await self._create_once(
            source,
            event,
            semantic_key=semantic_key,
            operation_kind="grant",
            status="pending",
            user_id=user.id,
            remnawave_user_id=(
                subscription.remnawave_user_id if subscription is not None else None
            ),
            duration_days=duration_days,
            grant_mode=response.grant_mode,
            target_expiry=target_expiry,
            rule_id=rule.id,
            access_profile_id=profile.id,
            rule_snapshot=response.model_dump(mode="json"),
            profile_snapshot=access_profile_snapshot(profile),
        )

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
