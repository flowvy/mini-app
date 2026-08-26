"""Persistence for administrator-managed Support articles."""

from __future__ import annotations

import uuid

from sqlalchemy import case, delete, func, literal_column, or_, select

from flowvy.models.support_article import SupportArticle, SupportArticleSearchDocument
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

    async def replace_search_documents(
        self,
        article_id: uuid.UUID,
        documents: dict[str, dict[str, str]],
    ) -> None:
        await self._session.execute(
            delete(SupportArticleSearchDocument).where(
                SupportArticleSearchDocument.article_id == article_id
            )
        )
        self._session.add_all(
            SupportArticleSearchDocument(article_id=article_id, locale=locale, **content)
            for locale, content in documents.items()
        )
        await self._session.flush()

    async def search_published(
        self,
        query: str,
        locales: tuple[str, ...],
        topic: str | None,
        *,
        limit: int,
    ) -> list[SupportArticle]:
        if not locales:
            return []
        document = SupportArticleSearchDocument
        locale_priority = case(
            *((document.locale == locale, index) for index, locale in enumerate(locales)),
            else_=len(locales),
        )
        selected = (
            select(
                document.article_id,
                document.locale,
                document.title,
                document.summary,
                document.search_aliases,
                document.search_vector,
                document.fuzzy_text,
                func.row_number()
                .over(partition_by=document.article_id, order_by=locale_priority)
                .label("locale_rank"),
            )
            .where(document.locale.in_(locales))
            .subquery()
        )
        language = func.split_part(selected.c.locale, "-", 1)
        configuration = case(
            (language == "ru", literal_column("'pg_catalog.russian'::regconfig")),
            (language == "en", literal_column("'pg_catalog.english'::regconfig")),
            else_=literal_column("'pg_catalog.simple'::regconfig"),
        )
        text_query = func.websearch_to_tsquery(configuration, query)
        fuzzy_score = func.greatest(
            func.word_similarity(query, selected.c.title),
            func.word_similarity(query, selected.c.search_aliases),
            func.word_similarity(query, selected.c.summary),
        )
        exact_title_score = case(
            (func.strpos(func.lower(selected.c.title), query.lower()) > 0, 4.0),
            else_=0.0,
        )
        topic_score = case((SupportArticle.topic == topic, 0.2), else_=0.0) if topic else 0.0
        rank = (
            exact_title_score
            + func.ts_rank_cd(selected.c.search_vector, text_query, 32)
            + fuzzy_score * 0.5
            + topic_score
        )
        stmt = (
            select(SupportArticle)
            .join(selected, selected.c.article_id == SupportArticle.id)
            .where(
                SupportArticle.status == "published",
                selected.c.locale_rank == 1,
                or_(selected.c.search_vector.op("@@")(text_query), fuzzy_score >= 0.35),
            )
            .order_by(
                rank.desc(),
                SupportArticle.sort_order.asc(),
                SupportArticle.created_at.asc(),
            )
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())

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
