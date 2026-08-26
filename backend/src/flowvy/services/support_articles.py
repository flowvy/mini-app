"""Localized publication lifecycle for Support Quick Answers."""

from __future__ import annotations

import datetime
import uuid

from flowvy.localization import (
    DEFAULT_LOCALE,
    dump_locale_map,
    locale_candidates,
    normalize_locale,
    resolve_locale_map,
)
from flowvy.models.support_article import SupportArticle
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.support_article import SupportArticleRepository
from flowvy.schemas.support_articles import (
    SupportArticleAdminResponse,
    SupportArticleInput,
    SupportArticleLocale,
    SupportArticlePublicResponse,
)


class SupportArticleError(Exception):
    code = "support_article_invalid"


class SupportArticleNotFoundError(SupportArticleError):
    code = "support_article_not_found"


class SupportArticlePublicationError(SupportArticleError):
    code = "support_article_publication_incomplete"


class SupportArticleOrderError(SupportArticleError):
    code = "support_article_order_conflict"


class SupportArticleService:
    def __init__(
        self,
        articles: SupportArticleRepository,
        settings: ProviderSettingsRepository,
    ) -> None:
        self._articles = articles
        self._settings = settings

    async def list_public(self, locale: str | None) -> list[SupportArticlePublicResponse]:
        default_locale = await self._default_locale()
        return [
            self._public_response(article, locale, default_locale)
            for article in await self._articles.list_published()
        ]

    async def get_public(
        self,
        article_id: uuid.UUID,
        locale: str | None,
    ) -> SupportArticlePublicResponse:
        article = await self._articles.get_published(article_id)
        if article is None:
            raise SupportArticleNotFoundError("Support article was not found")
        return self._public_response(article, locale, await self._default_locale())

    async def suggest_public(
        self,
        query: str,
        topic: str | None,
        locale: str | None,
        *,
        limit: int = 3,
    ) -> list[SupportArticlePublicResponse]:
        normalized_query = " ".join(query.strip().split())
        if len(normalized_query) < 3:
            return []
        default_locale = await self._default_locale()
        articles = await self._articles.search_published(
            normalized_query,
            locale_candidates(locale, default_locale),
            topic,
            limit=limit,
        )
        return [self._public_response(article, locale, default_locale) for article in articles]

    async def list_admin(self) -> list[SupportArticleAdminResponse]:
        return [self._admin_response(article) for article in await self._articles.list_all()]

    async def get_admin(self, article_id: uuid.UUID) -> SupportArticleAdminResponse:
        article = await self._articles.get_by_id(article_id)
        if article is None:
            raise SupportArticleNotFoundError("Support article was not found")
        return self._admin_response(article)

    async def create(
        self,
        payload: SupportArticleInput,
        admin_id: int | None,
    ) -> SupportArticleAdminResponse:
        await self._validate_publication(payload)
        article = await self._articles.create(
            topic=payload.topic,
            status=payload.status,
            sort_order=await self._articles.next_sort_order(),
            content_locales=dump_locale_map(payload.content_locales),
            created_by_id=admin_id,
            published_at=self._published_at(payload.status),
        )
        await self._sync_search_documents(article, payload)
        return self._admin_response(article)

    async def update(
        self,
        article_id: uuid.UUID,
        payload: SupportArticleInput,
    ) -> SupportArticleAdminResponse:
        article = await self._articles.get_by_id(article_id)
        if article is None:
            raise SupportArticleNotFoundError("Support article was not found")
        await self._validate_publication(payload)
        published_at = article.published_at
        if payload.status == "published" and article.status != "published":
            published_at = self._published_at("published")
        updated = await self._articles.update(
            article,
            topic=payload.topic,
            status=payload.status,
            content_locales=dump_locale_map(payload.content_locales),
            published_at=published_at,
        )
        await self._sync_search_documents(updated, payload)
        return self._admin_response(updated)

    async def delete(self, article_id: uuid.UUID) -> None:
        article = await self._articles.get_by_id(article_id)
        if article is None:
            raise SupportArticleNotFoundError("Support article was not found")
        await self._articles.delete(article)

    async def reorder(self, article_ids: list[uuid.UUID]) -> list[SupportArticleAdminResponse]:
        articles = await self._articles.list_all()
        by_id = {article.id: article for article in articles}
        if set(article_ids) != set(by_id) or len(article_ids) != len(articles):
            raise SupportArticleOrderError(
                "Article order no longer matches the current collection"
            )
        ordered = [by_id[article_id] for article_id in article_ids]
        await self._articles.set_order(ordered)
        return [self._admin_response(article) for article in ordered]

    async def _default_locale(self) -> str:
        settings = await self._settings.get()
        return normalize_locale(getattr(settings, "content_default_locale", DEFAULT_LOCALE))

    async def _sync_search_documents(
        self,
        article: SupportArticle,
        payload: SupportArticleInput,
    ) -> None:
        await self._articles.replace_search_documents(
            article.id,
            {
                locale: {
                    "title": content.title,
                    "summary": content.summary,
                    "body": content.body,
                    "search_aliases": "\n".join(content.search_aliases),
                }
                for locale, content in payload.content_locales.items()
            },
        )

    async def _validate_publication(self, payload: SupportArticleInput) -> None:
        if payload.status != "published":
            return
        default_locale = await self._default_locale()
        default_content = payload.content_locales.get(default_locale)
        if default_content is None or not default_content.complete:
            raise SupportArticlePublicationError(
                "Published articles require title, summary and body in the default locale"
            )
        if any(not content.complete for content in payload.content_locales.values()):
            raise SupportArticlePublicationError(
                "Every included locale must be complete before publication"
            )

    @staticmethod
    def _published_at(status: str) -> datetime.datetime | None:
        return datetime.datetime.now(datetime.UTC) if status == "published" else None

    @staticmethod
    def _admin_response(article: SupportArticle) -> SupportArticleAdminResponse:
        return SupportArticleAdminResponse.model_validate(article, from_attributes=True)

    @staticmethod
    def _public_response(
        article: SupportArticle,
        locale: str | None,
        default_locale: str,
    ) -> SupportArticlePublicResponse:
        content = resolve_locale_map(
            getattr(article, "content_locales", {}),
            SupportArticleLocale,
            locale,
            default_locale,
        )
        if content is None or not content.complete:
            raise SupportArticlePublicationError("Published article has no resolvable content")
        return SupportArticlePublicResponse(
            id=article.id,
            topic=article.topic,
            title=content.title,
            summary=content.summary,
            body=content.body,
            updated_at=article.updated_at,
        )


__all__ = [
    "SupportArticleError",
    "SupportArticleNotFoundError",
    "SupportArticleOrderError",
    "SupportArticlePublicationError",
    "SupportArticleService",
]
