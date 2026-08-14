"""Authenticated commerce-rule administration."""

from __future__ import annotations

import uuid

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, status

from flowvy.api.routes.admin.deps import CurrentAdmin
from flowvy.schemas.commerce import (
    CommerceRuleInput,
    CommerceRulePreviewRequest,
    CommerceRulePreviewResponse,
    CommerceRuleResponse,
)
from flowvy.schemas.tribute_webhooks import (
    EntitlementOperationListResponse,
    EntitlementOperationResponse,
    EntitlementOperatorActionInput,
)
from flowvy.services.commerce import (
    CommerceRuleError,
    CommerceRuleNotFoundError,
    CommerceRuleService,
)
from flowvy.services.entitlements import (
    EntitlementJournalService,
    EntitlementOperationConflictError,
    EntitlementOperationNotFoundError,
)

router = APIRouter(
    prefix="/api/admin/commerce",
    tags=["admin-commerce"],
    route_class=DishkaRoute,
)


@router.get("/operations", response_model=EntitlementOperationListResponse)
async def list_entitlement_operations(
    _admin: CurrentAdmin,
    service: FromDishka[EntitlementJournalService],
    limit: int = Query(default=20, ge=1, le=100),
) -> EntitlementOperationListResponse:
    """Return a bounded allow-listed payment processing journal."""
    return await service.list_recent(limit)


@router.post(
    "/operations/{operation_id}/actions",
    response_model=EntitlementOperationResponse,
)
async def act_on_entitlement_operation(
    operation_id: uuid.UUID,
    payload: EntitlementOperatorActionInput,
    admin: CurrentAdmin,
    service: FromDishka[EntitlementJournalService],
) -> EntitlementOperationResponse:
    """Apply one audited, idempotent administrator review decision."""
    try:
        return await service.act(
            operation_id,
            payload,
            actor_user_id=admin.user.id,
            actor_telegram_id=admin.user.id,
        )
    except EntitlementOperationNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except EntitlementOperationConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


def _commerce_error(exc: CommerceRuleError) -> HTTPException:
    code = (
        status.HTTP_404_NOT_FOUND
        if isinstance(exc, CommerceRuleNotFoundError)
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    return HTTPException(code, str(exc))


@router.get("/rules", response_model=list[CommerceRuleResponse])
async def list_commerce_rules(
    _admin: CurrentAdmin,
    service: FromDishka[CommerceRuleService],
    provider: str = Query(default="tribute", pattern="^tribute$"),
) -> list[CommerceRuleResponse]:
    return await service.list_rules(provider)


@router.post(
    "/rules",
    response_model=CommerceRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_commerce_rule(
    payload: CommerceRuleInput,
    admin: CurrentAdmin,
    service: FromDishka[CommerceRuleService],
) -> CommerceRuleResponse:
    try:
        return await service.create_rule(payload, admin.user.id)
    except CommerceRuleError as exc:
        raise _commerce_error(exc) from exc


@router.put("/rules/{rule_id}", response_model=CommerceRuleResponse)
async def update_commerce_rule(
    rule_id: uuid.UUID,
    payload: CommerceRuleInput,
    _admin: CurrentAdmin,
    service: FromDishka[CommerceRuleService],
) -> CommerceRuleResponse:
    try:
        return await service.update_rule(rule_id, payload)
    except CommerceRuleError as exc:
        raise _commerce_error(exc) from exc


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_commerce_rule(
    rule_id: uuid.UUID,
    _admin: CurrentAdmin,
    service: FromDishka[CommerceRuleService],
) -> None:
    try:
        await service.delete_rule(rule_id)
    except CommerceRuleError as exc:
        raise _commerce_error(exc) from exc


@router.post("/preview", response_model=CommerceRulePreviewResponse)
async def preview_commerce_rule(
    payload: CommerceRulePreviewRequest,
    _admin: CurrentAdmin,
    service: FromDishka[CommerceRuleService],
) -> CommerceRulePreviewResponse:
    try:
        return await service.preview(payload)
    except CommerceRuleError as exc:
        raise _commerce_error(exc) from exc


__all__ = ["router"]
