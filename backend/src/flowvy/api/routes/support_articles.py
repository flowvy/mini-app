"""Authenticated published Support knowledge base."""

from __future__ import annotations

import uuid
from typing import Annotated

from aiogram.utils.web_app import WebAppInitData
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from flowvy.api.deps import get_current_active_init_data
from flowvy.api.locale import request_locale
from flowvy.schemas.support_articles import (
    SupportArticleListResponse,
    SupportArticlePublicResponse,
    SupportArticleTopic,
)
from flowvy.services.support_articles import SupportArticleNotFoundError, SupportArticleService

router = APIRouter(prefix="/api/support/articles", tags=["support"], route_class=DishkaRoute)
CurrentActiveUser = Annotated[WebAppInitData, Depends(get_current_active_init_data)]


@router.get("", response_model=SupportArticleListResponse)
async def list_support_articles(
    request: Request,
    _user: CurrentActiveUser,
    service: FromDishka[SupportArticleService],
) -> SupportArticleListResponse:
    return SupportArticleListResponse(articles=await service.list_public(request_locale(request)))


@router.get("/suggestions", response_model=SupportArticleListResponse)
async def suggest_support_articles(
    request: Request,
    _user: CurrentActiveUser,
    service: FromDishka[SupportArticleService],
    query: Annotated[str, Query(min_length=3, max_length=120)],
    topic: SupportArticleTopic | None = None,
) -> SupportArticleListResponse:
    return SupportArticleListResponse(
        articles=await service.suggest_public(query, topic, request_locale(request))
    )


@router.get("/{article_id}", response_model=SupportArticlePublicResponse)
async def get_support_article(
    article_id: uuid.UUID,
    request: Request,
    _user: CurrentActiveUser,
    service: FromDishka[SupportArticleService],
) -> SupportArticlePublicResponse:
    try:
        return await service.get_public(article_id, request_locale(request))
    except SupportArticleNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Support article was not found") from exc


__all__ = ["router"]
