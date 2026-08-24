"""Local-only Support article administration for mock-auth development."""

from __future__ import annotations

import uuid

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, status

from flowvy.api.routes.admin.support_articles import _article_error
from flowvy.schemas.support_articles import (
    SupportArticleAdminListResponse,
    SupportArticleAdminResponse,
    SupportArticleInput,
    SupportArticleOrderInput,
)
from flowvy.services.support_articles import SupportArticleError, SupportArticleService

router = APIRouter(
    prefix="/api/debug/admin/support/articles",
    tags=["debug-admin-support"],
    route_class=DishkaRoute,
)


@router.get("", response_model=SupportArticleAdminListResponse)
async def list_support_articles_debug(
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminListResponse:
    return SupportArticleAdminListResponse(articles=await service.list_admin())


@router.put("/order/all", response_model=SupportArticleAdminListResponse)
async def reorder_support_articles_debug(
    payload: SupportArticleOrderInput,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminListResponse:
    try:
        return SupportArticleAdminListResponse(articles=await service.reorder(payload.article_ids))
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


@router.get("/{article_id}", response_model=SupportArticleAdminResponse)
async def get_support_article_debug(
    article_id: uuid.UUID,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminResponse:
    try:
        return await service.get_admin(article_id)
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


@router.post("", response_model=SupportArticleAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_support_article_debug(
    payload: SupportArticleInput,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminResponse:
    try:
        return await service.create(payload, None)
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


@router.put("/{article_id}", response_model=SupportArticleAdminResponse)
async def update_support_article_debug(
    article_id: uuid.UUID,
    payload: SupportArticleInput,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminResponse:
    try:
        return await service.update(article_id, payload)
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


__all__ = ["router"]
