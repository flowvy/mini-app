"""Authenticated administration of Support Quick Answers."""

from __future__ import annotations

import uuid

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status

from flowvy.api.routes.admin.deps import CurrentAdmin
from flowvy.schemas.support_articles import (
    SupportArticleAdminListResponse,
    SupportArticleAdminResponse,
    SupportArticleInput,
    SupportArticleOrderInput,
)
from flowvy.services.support_articles import (
    SupportArticleError,
    SupportArticleNotFoundError,
    SupportArticleOrderError,
    SupportArticleService,
)

router = APIRouter(
    prefix="/api/admin/support/articles",
    tags=["admin-support"],
    route_class=DishkaRoute,
)


def _article_error(exc: SupportArticleError) -> HTTPException:
    code = status.HTTP_422_UNPROCESSABLE_CONTENT
    if isinstance(exc, SupportArticleNotFoundError):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, SupportArticleOrderError):
        code = status.HTTP_409_CONFLICT
    return HTTPException(code, detail={"code": exc.code, "message": str(exc)})


@router.get("", response_model=SupportArticleAdminListResponse)
async def list_support_articles_admin(
    _admin: CurrentAdmin,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminListResponse:
    return SupportArticleAdminListResponse(articles=await service.list_admin())


@router.put("/order/all", response_model=SupportArticleAdminListResponse)
async def reorder_support_articles(
    payload: SupportArticleOrderInput,
    _admin: CurrentAdmin,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminListResponse:
    try:
        return SupportArticleAdminListResponse(articles=await service.reorder(payload.article_ids))
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


@router.get("/{article_id}", response_model=SupportArticleAdminResponse)
async def get_support_article_admin(
    article_id: uuid.UUID,
    _admin: CurrentAdmin,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminResponse:
    try:
        return await service.get_admin(article_id)
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


@router.post("", response_model=SupportArticleAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_support_article(
    payload: SupportArticleInput,
    admin: CurrentAdmin,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminResponse:
    try:
        return await service.create(payload, admin.user.id)
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


@router.put("/{article_id}", response_model=SupportArticleAdminResponse)
async def update_support_article(
    article_id: uuid.UUID,
    payload: SupportArticleInput,
    _admin: CurrentAdmin,
    service: FromDishka[SupportArticleService],
) -> SupportArticleAdminResponse:
    try:
        return await service.update(article_id, payload)
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_support_article(
    article_id: uuid.UUID,
    _admin: CurrentAdmin,
    service: FromDishka[SupportArticleService],
) -> None:
    try:
        await service.delete(article_id)
    except SupportArticleError as exc:
        raise _article_error(exc) from exc


__all__ = ["router"]
