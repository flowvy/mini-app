"""Local-only commerce-rule administration for deterministic browser development."""

from __future__ import annotations

import uuid

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, Request, status

from flowvy.api.routes.debug import check_debug
from flowvy.schemas.commerce import (
    CommerceRuleInput,
    CommerceRulePreviewRequest,
    CommerceRulePreviewResponse,
    CommerceRuleResponse,
)
from flowvy.schemas.tribute_webhooks import EntitlementOperationListResponse
from flowvy.services.commerce import (
    CommerceRuleError,
    CommerceRuleNotFoundError,
    CommerceRuleService,
)
from flowvy.services.entitlements import EntitlementJournalService

router = APIRouter(
    prefix="/api/debug/admin/commerce",
    tags=["debug-admin-commerce"],
    route_class=DishkaRoute,
)


@router.get("/operations", response_model=EntitlementOperationListResponse)
async def list_entitlement_operations(
    request: Request,
    service: FromDishka[EntitlementJournalService],
    limit: int = Query(default=20, ge=1, le=100),
) -> EntitlementOperationListResponse:
    """Return deterministic local journal data in explicit debug mode."""
    check_debug(request)
    return await service.list_recent(limit)


def _error(exc: CommerceRuleError) -> HTTPException:
    code = (
        status.HTTP_404_NOT_FOUND
        if isinstance(exc, CommerceRuleNotFoundError)
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    return HTTPException(code, str(exc))


@router.get("/rules", response_model=list[CommerceRuleResponse])
async def debug_list_rules(
    request: Request,
    service: FromDishka[CommerceRuleService] = None,  # type: ignore[assignment]
) -> list[CommerceRuleResponse]:
    check_debug(request)
    return await service.list_rules("tribute")


@router.post(
    "/rules",
    response_model=CommerceRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def debug_create_rule(
    payload: CommerceRuleInput,
    request: Request,
    service: FromDishka[CommerceRuleService] = None,  # type: ignore[assignment]
) -> CommerceRuleResponse:
    check_debug(request)
    try:
        return await service.create_rule(payload, None)
    except CommerceRuleError as exc:
        raise _error(exc) from exc


@router.put("/rules/{rule_id}", response_model=CommerceRuleResponse)
async def debug_update_rule(
    rule_id: uuid.UUID,
    payload: CommerceRuleInput,
    request: Request,
    service: FromDishka[CommerceRuleService] = None,  # type: ignore[assignment]
) -> CommerceRuleResponse:
    check_debug(request)
    try:
        return await service.update_rule(rule_id, payload)
    except CommerceRuleError as exc:
        raise _error(exc) from exc


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def debug_delete_rule(
    rule_id: uuid.UUID,
    request: Request,
    service: FromDishka[CommerceRuleService] = None,  # type: ignore[assignment]
) -> None:
    check_debug(request)
    try:
        await service.delete_rule(rule_id)
    except CommerceRuleError as exc:
        raise _error(exc) from exc


@router.post("/preview", response_model=CommerceRulePreviewResponse)
async def debug_preview_rule(
    payload: CommerceRulePreviewRequest,
    request: Request,
    service: FromDishka[CommerceRuleService] = None,  # type: ignore[assignment]
) -> CommerceRulePreviewResponse:
    check_debug(request)
    try:
        return await service.preview(payload)
    except CommerceRuleError as exc:
        raise _error(exc) from exc


__all__ = ["router"]
