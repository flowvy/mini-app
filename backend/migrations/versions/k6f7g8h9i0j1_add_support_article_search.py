"""Add localized full-text search for Support articles.

Revision ID: k6f7g8h9i0j1
Revises: j5e6f7g8h9i0
Create Date: 2026-08-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "k6f7g8h9i0j1"
down_revision: str | Sequence[str] | None = "j5e6f7g8h9i0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SEARCH_CONFIG_SQL = """
CASE split_part(locale, '-', 1)
    WHEN 'ru' THEN 'pg_catalog.russian'::regconfig
    WHEN 'en' THEN 'pg_catalog.english'::regconfig
    ELSE 'pg_catalog.simple'::regconfig
END
"""
SEARCH_VECTOR_SQL = f"""
setweight(to_tsvector({SEARCH_CONFIG_SQL}, coalesce(title, '')), 'A') ||
setweight(to_tsvector({SEARCH_CONFIG_SQL}, coalesce(search_aliases, '')), 'B') ||
setweight(to_tsvector({SEARCH_CONFIG_SQL}, coalesce(summary, '')), 'C') ||
setweight(to_tsvector({SEARCH_CONFIG_SQL}, coalesce(body, '')), 'D')
"""
FUZZY_TEXT_SQL = """
lower(
    coalesce(title, '') || ' ' ||
    coalesce(search_aliases, '') || ' ' ||
    coalesce(summary, '')
)
"""


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "support_article_search_documents",
        sa.Column("article_id", sa.UUID(), nullable=False),
        sa.Column("locale", sa.String(length=35), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("search_aliases", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(SEARCH_VECTOR_SQL, persisted=True),
            nullable=False,
        ),
        sa.Column(
            "fuzzy_text",
            sa.Text(),
            sa.Computed(FUZZY_TEXT_SQL, persisted=True),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(locale) BETWEEN 2 AND 35",
            name="ck_support_search_locale_length",
        ),
        sa.ForeignKeyConstraint(
            ["article_id"],
            ["support_articles.id"],
            name="fk_support_article_search_documents_article_id_support_articles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "article_id",
            "locale",
            name="pk_support_article_search_documents",
        ),
    )
    op.create_index(
        "ix_support_search_vector_gin",
        "support_article_search_documents",
        ["search_vector"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_support_search_fuzzy_gin",
        "support_article_search_documents",
        ["fuzzy_text"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"fuzzy_text": "gin_trgm_ops"},
    )
    op.execute(
        """
		INSERT INTO support_article_search_documents (
			article_id, locale, title, summary, body, search_aliases
		)
		SELECT
			article.id,
			localized.key,
			localized.value ->> 'title',
			localized.value ->> 'summary',
			localized.value ->> 'body',
			COALESCE((
				SELECT string_agg(alias.value, E'\n')
				FROM jsonb_array_elements_text(
					CASE
						WHEN jsonb_typeof(localized.value -> 'search_aliases') = 'array'
						THEN localized.value -> 'search_aliases'
						ELSE '[]'::jsonb
					END
				) AS alias(value)
			), '')
		FROM support_articles AS article
		CROSS JOIN LATERAL jsonb_each(article.content_locales) AS localized(key, value)
		WHERE jsonb_typeof(localized.value) = 'object'
			AND jsonb_typeof(localized.value -> 'title') = 'string'
			AND jsonb_typeof(localized.value -> 'summary') = 'string'
			AND jsonb_typeof(localized.value -> 'body') = 'string'
		"""
    )


def downgrade() -> None:
    op.drop_index(
        "ix_support_search_fuzzy_gin",
        table_name="support_article_search_documents",
        postgresql_using="gin",
    )
    op.drop_index(
        "ix_support_search_vector_gin",
        table_name="support_article_search_documents",
        postgresql_using="gin",
    )
    op.drop_table("support_article_search_documents")
