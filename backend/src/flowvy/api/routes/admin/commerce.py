"""Authenticated commerce-rule administration."""

from __future__ import annotations

import uuid

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, status

from flowvy.api.routes.admin.deps import CurrentAdmin
from flowvy.schemas.commerce import (
    CommerceCatalogResponse,
    CommerceRuleInput,
    CommerceRulePreviewRequest,
    CommerceRulePreviewResponse,
    CommerceRuleResponse,
    SponsorOfferInput,
    SponsorOfferOptionsResponse,
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
    prefix="/api/admin/commerce",
    tags=["admin-commerce"],
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
async def list_sponsor_offers(
    _admin: CurrentAdmin,
    service: FromDishka[SponsorOfferService],
) -> list[SponsorOfferResponse]:
    return await service.list_admin()


@router.get("/offer-options", response_model=SponsorOfferOptionsResponse)
async def get_sponsor_offer_options(
    _admin: CurrentAdmin,
    service: FromDishka[SponsorOfferService],
) -> SponsorOfferOptionsResponse:
    try:
        return await service.get_options()
    except SponsorOfferError as exc:
        raise _sponsor_offer_error(exc) from exc


@router.post(
    "/offers",
    response_model=SponsorOfferResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_sponsor_offer(
    payload: SponsorOfferInput,
    admin: CurrentAdmin,
    service: FromDishka[SponsorOfferService],
) -> SponsorOfferResponse:
    try:
        return await service.create(payload, admin.user.id)
    except SponsorOfferError as exc:
        raise _sponsor_offer_error(exc) from exc


@router.put("/offers/{offer_id}", response_model=SponsorOfferResponse)
async def update_sponsor_offer(
    offer_id: uuid.UUID,
    payload: SponsorOfferInput,
    _admin: CurrentAdmin,
    service: FromDishka[SponsorOfferService],
) -> SponsorOfferResponse:
    try:
        return await service.update(offer_id, payload)
    except SponsorOfferError as exc:
        raise _sponsor_offer_error(exc) from exc


@router.delete("/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sponsor_offer(
    offer_id: uuid.UUID,
    _admin: CurrentAdmin,
    service: FromDishka[SponsorOfferService],
) -> None:
    try:
        await service.delete(offer_id)
    except SponsorOfferError as exc:
        raise _sponsor_offer_error(exc) from exc


@router.get("/catalog", response_model=CommerceCatalogResponse)
async def get_commerce_catalog(
    _admin: CurrentAdmin,
    service: FromDishka[CommerceCatalogService],
    _provider: str = Query(default="tribute", pattern="^tribute$", alias="provider"),
) -> CommerceCatalogResponse:
    """Return an allow-listed read-only provider catalog to an administrator."""
    try:
        return await service.get_tribute()
    except CommerceCatalogUnavailableError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Tribute catalog is unavailable",
        ) from exc


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
