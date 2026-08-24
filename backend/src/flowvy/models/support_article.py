"""Administrator-managed articles shown in Support Quick Answers."""

from __future__ import annotations

import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
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


__all__ = ["SupportArticle"]
