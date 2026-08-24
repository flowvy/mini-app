"""Persistence for administrator-managed Support articles."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from flowvy.models.support_article import SupportArticle
from flowvy.repositories.base import BaseRepository


class SupportArticleRepository(BaseRepository[SupportArticle]):
    model = SupportArticle

    async def list_all(self) -> list[SupportArticle]:
        stmt = select(SupportArticle).order_by(
            SupportArticle.sort_order.asc(),
            SupportArticle.created_at.asc(),
        )
        return list((await self._session.scalars(stmt)).all())

    async def list_published(self) -> list[SupportArticle]:
        stmt = (
            select(SupportArticle)
            .where(SupportArticle.status == "published")
            .order_by(SupportArticle.sort_order.asc(), SupportArticle.created_at.asc())
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_published(self, article_id: uuid.UUID) -> SupportArticle | None:
        stmt = select(SupportArticle).where(
            SupportArticle.id == article_id,
            SupportArticle.status == "published",
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def next_sort_order(self) -> int:
        current = await self._session.scalar(select(func.max(SupportArticle.sort_order)))
        return min((current or 0) + 10, 10_000)

    async def set_order(self, articles: list[SupportArticle]) -> None:
        for index, article in enumerate(articles, start=1):
            article.sort_order = index * 10
        await self._session.flush()
        for article in articles:
            await self._session.refresh(article)


__all__ = ["SupportArticleRepository"]
