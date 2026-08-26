"""Administrator-managed articles shown in Support Quick Answers."""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, created_at, updated_at, uuid_pk


class SupportArticle(Base):
    """One independently ordered and published localized Support article."""

    __tablename__ = "support_articles"
    __table_args__ = (
        CheckConstraint(
            "topic IN ('connection', 'subscription', 'devices', 'payment', 'other')",
            name="ck_support_articles_topic",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_support_articles_status",
        ),
        CheckConstraint(
            "sort_order BETWEEN 1 AND 10000",
            name="ck_support_articles_sort_order",
        ),
        CheckConstraint(
            "jsonb_typeof(content_locales) = 'object'",
            name="ck_support_articles_content_locales_object",
        ),
        CheckConstraint(
            "status != 'published' OR published_at IS NOT NULL",
            name="ck_support_articles_published_at",
        ),
        Index("ix_support_articles_status_sort_order", "status", "sort_order", "created_at"),
    )

    id: Mapped[uuid_pk]
    topic: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="draft", server_default="draft")
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    content_locales: Mapped[dict[str, dict[str, str]]] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    published_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[created_at]
    updated_at: Mapped[updated_at]


_SEARCH_CONFIG_SQL = """
CASE split_part(locale, '-', 1)
    WHEN 'ru' THEN 'pg_catalog.russian'::regconfig
    WHEN 'en' THEN 'pg_catalog.english'::regconfig
    ELSE 'pg_catalog.simple'::regconfig
END
"""
_SEARCH_VECTOR_SQL = f"""
setweight(to_tsvector({_SEARCH_CONFIG_SQL}, coalesce(title, '')), 'A') ||
setweight(to_tsvector({_SEARCH_CONFIG_SQL}, coalesce(search_aliases, '')), 'B') ||
setweight(to_tsvector({_SEARCH_CONFIG_SQL}, coalesce(summary, '')), 'C') ||
setweight(to_tsvector({_SEARCH_CONFIG_SQL}, coalesce(body, '')), 'D')
"""
_FUZZY_TEXT_SQL = """
lower(
    coalesce(title, '') || ' ' ||
    coalesce(search_aliases, '') || ' ' ||
    coalesce(summary, '')
)
"""


class SupportArticleSearchDocument(Base):
    """Indexed locale projection used only for FAQ suggestion ranking."""

    __tablename__ = "support_article_search_documents"
    __table_args__ = (
        CheckConstraint(
            "char_length(locale) BETWEEN 2 AND 35",
            name="ck_support_search_locale_length",
        ),
        Index(
            "ix_support_search_vector_gin",
            "search_vector",
            postgresql_using="gin",
        ),
        Index(
            "ix_support_search_fuzzy_gin",
            "fuzzy_text",
            postgresql_using="gin",
            postgresql_ops={"fuzzy_text": "gin_trgm_ops"},
        ),
    )

    article_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("support_articles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    locale: Mapped[str] = mapped_column(String(35), primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    search_aliases: Mapped[str] = mapped_column(Text, default="", server_default="")
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(_SEARCH_VECTOR_SQL, persisted=True),
    )
    fuzzy_text: Mapped[str] = mapped_column(
        Text,
        Computed(_FUZZY_TEXT_SQL, persisted=True),
    )


__all__ = ["SupportArticle", "SupportArticleSearchDocument"]
