"""HTTP contracts for administrator-managed Support articles."""

from __future__ import annotations

import datetime
import re
import uuid
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator

from flowvy.localization import normalize_locale_map
from flowvy.schemas.base import CamelModel
from flowvy.schemas.content import formatted_text_visible_length, normalize_formatted_text

SupportArticleTopic = Literal["connection", "subscription", "devices", "payment", "other"]
SupportArticleStatus = Literal["draft", "published", "archived"]
_RAW_HTML_RE = re.compile(r"<(?:/?[A-Za-z][^>\n]*|!--[\s\S]*?--|![A-Z][^>\n]*|\?[^>\n]*)>")
_MARKDOWN_LINK_RE = re.compile(r"\]\(([^\s)]+)(?:\s+\"[^\"]*\")?\)")


class SupportArticleLocale(CamelModel):
    """One administrator-authored locale of a Support article."""

    title: str = Field(default="", max_length=120)
    summary: str = Field(default="", max_length=240)
    body: str = Field(default="", max_length=40_000)
    search_aliases: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("title", "summary")
    @classmethod
    def normalize_plain_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("search_aliases")
    @classmethod
    def normalize_search_aliases(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw_alias in value:
            alias = " ".join(raw_alias.strip().split())
            if not alias:
                continue
            if len(alias) > 120:
                raise ValueError("Search aliases must not exceed 120 characters")
            key = alias.casefold()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(alias)
        return normalized

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        normalized = normalize_formatted_text(value)
        if _RAW_HTML_RE.search(normalized):
            raise ValueError("Article body cannot contain raw HTML")
        for match in _MARKDOWN_LINK_RE.finditer(normalized):
            parsed = urlsplit(match.group(1))
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ValueError("Article links must use HTTP or HTTPS")
        if formatted_text_visible_length(normalized) > 10_000:
            raise ValueError("Article body exceeds 10000 visible characters")
        return normalized

    @property
    def complete(self) -> bool:
        return bool(self.title and self.summary and self.body)


class SupportArticleInput(CamelModel):
    """Administrator-editable article data."""

    topic: SupportArticleTopic
    status: SupportArticleStatus = "draft"
    content_locales: dict[str, SupportArticleLocale] = Field(default_factory=dict, max_length=20)

    @field_validator("content_locales", mode="before")
    @classmethod
    def validate_content_locales(cls, value: object) -> dict[str, SupportArticleLocale]:
        return normalize_locale_map(value, SupportArticleLocale)


class SupportArticleAdminResponse(SupportArticleInput):
    """Complete article contract returned only to administrators."""

    id: uuid.UUID
    sort_order: int
    published_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class SupportArticlePublicResponse(CamelModel):
    """Resolved published article safe for an authenticated user."""

    id: uuid.UUID
    topic: SupportArticleTopic
    title: str
    summary: str
    body: str
    updated_at: datetime.datetime


class SupportArticleListResponse(CamelModel):
    articles: list[SupportArticlePublicResponse]


class SupportArticleAdminListResponse(CamelModel):
    articles: list[SupportArticleAdminResponse]


class SupportArticleOrderInput(CamelModel):
    """Complete administrator order, preventing ambiguous partial reorders."""

    article_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_unique_ids(self) -> Self:
        if len(set(self.article_ids)) != len(self.article_ids):
            raise ValueError("Article order cannot contain duplicate IDs")
        return self


__all__ = [
    "SupportArticleAdminListResponse",
    "SupportArticleAdminResponse",
    "SupportArticleInput",
    "SupportArticleListResponse",
    "SupportArticleLocale",
    "SupportArticleOrderInput",
    "SupportArticlePublicResponse",
    "SupportArticleStatus",
    "SupportArticleTopic",
]
