"""Local-only commerce-rule administration for deterministic browser development."""

from __future__ import annotations

import uuid

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, Request, status

from flowvy.api.routes.debug import check_debug
from flowvy.schemas.commerce import (
    CommerceCatalogResponse,
    CommerceRuleInput,
    CommerceRulePreviewRequest,
    CommerceRulePreviewResponse,
    CommerceRuleResponse,
    SponsorOfferInput,
    SponsorOfferResponse,
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
from flowvy.services.commerce_catalog import (
    CommerceCatalogService,
    CommerceCatalogUnavailableError,
)
from flowvy.services.entitlements import (
    EntitlementJournalService,
    EntitlementOperationConflictError,
    EntitlementOperationNotFoundError,
)
from flowvy.services.sponsor import (
    SponsorOfferError,
    SponsorOfferNotFoundError,
    SponsorOfferService,
)

router = APIRouter(
    prefix="/api/debug/admin/commerce",
    tags=["debug-admin-commerce"],
    route_class=DishkaRoute,
)


def _sponsor_offer_error(exc: SponsorOfferError) -> HTTPException:
    code = (
        status.HTTP_404_NOT_FOUND
        if isinstance(exc, SponsorOfferNotFoundError)
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    return HTTPException(
        code,
        detail={"code": exc.code, "message": str(exc)},
    )


@router.get("/offers", response_model=list[SponsorOfferResponse])
async def debug_list_sponsor_offers(
    request: Request,
    service: FromDishka[SponsorOfferService],
) -> list[SponsorOfferResponse]:
    check_debug(request)
    return await service.list_admin()


@router.post(
    "/offers",
    response_model=SponsorOfferResponse,
    status_code=status.HTTP_201_CREATED,
)
async def debug_create_sponsor_offer(
    payload: SponsorOfferInput,
    request: Request,
    service: FromDishka[SponsorOfferService],
) -> SponsorOfferResponse:
    check_debug(request)
    try:
        return await service.create(payload, None)
    except SponsorOfferError as exc:
        raise _sponsor_offer_error(exc) from exc


@router.put("/offers/{offer_id}", response_model=SponsorOfferResponse)
async def debug_update_sponsor_offer(
    offer_id: uuid.UUID,
    payload: SponsorOfferInput,
    request: Request,
    service: FromDishka[SponsorOfferService],
) -> SponsorOfferResponse:
    check_debug(request)
    try:
        return await service.update(offer_id, payload)
    except SponsorOfferError as exc:
        raise _sponsor_offer_error(exc) from exc


@router.delete("/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def debug_delete_sponsor_offer(
    offer_id: uuid.UUID,
    request: Request,
    service: FromDishka[SponsorOfferService],
) -> None:
    check_debug(request)
    try:
        await service.delete(offer_id)
    except SponsorOfferError as exc:
        raise _sponsor_offer_error(exc) from exc


@router.get("/catalog", response_model=CommerceCatalogResponse)
async def debug_get_commerce_catalog(
    request: Request,
    service: FromDishka[CommerceCatalogService],
) -> CommerceCatalogResponse:
    """Return the same provider catalog only in explicit local debug mode."""
    check_debug(request)
    try:
        return await service.get_tribute()
    except CommerceCatalogUnavailableError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Tribute catalog is unavailable",
        ) from exc


@router.get("/operations", response_model=EntitlementOperationListResponse)
async def list_entitlement_operations(
    request: Request,
    service: FromDishka[EntitlementJournalService],
    limit: int = Query(default=20, ge=1, le=100),
) -> EntitlementOperationListResponse:
    """Return deterministic local journal data in explicit debug mode."""
    check_debug(request)
    return await service.list_recent(limit)


@router.post(
    "/operations/{operation_id}/actions",
    response_model=EntitlementOperationResponse,
)
async def act_on_entitlement_operation(
    operation_id: uuid.UUID,
    payload: EntitlementOperatorActionInput,
    request: Request,
    service: FromDishka[EntitlementJournalService],
) -> EntitlementOperationResponse:
    """Exercise operator actions only in explicit local debug mode."""
    check_debug(request)
    try:
        return await service.act(
            operation_id,
            payload,
            actor_user_id=None,
            actor_telegram_id=0,
        )
    except EntitlementOperationNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except EntitlementOperationConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


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
