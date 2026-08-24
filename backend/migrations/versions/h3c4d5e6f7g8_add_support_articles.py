"""Add administrator-managed Support articles.

Revision ID: h3c4d5e6f7g8
Revises: g2b3c4d5e6f7
Create Date: 2026-08-24
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h3c4d5e6f7g8"
down_revision: str | Sequence[str] | None = "g2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "support_articles",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("topic", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "content_locales",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "topic IN ('connection', 'subscription', 'devices', 'payment', 'other')",
            name="ck_support_articles_topic",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_support_articles_status",
        ),
        sa.CheckConstraint(
            "sort_order BETWEEN 1 AND 10000",
            name="ck_support_articles_sort_order",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(content_locales) = 'object'",
            name="ck_support_articles_content_locales_object",
        ),
        sa.CheckConstraint(
            "status != 'published' OR published_at IS NOT NULL",
            name="ck_support_articles_published_at",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_support_articles_created_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_articles"),
    )
    op.create_index(
        "ix_support_articles_status_sort_order",
        "support_articles",
        ["status", "sort_order", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_support_articles_status_sort_order", table_name="support_articles")
    op.drop_table("support_articles")
