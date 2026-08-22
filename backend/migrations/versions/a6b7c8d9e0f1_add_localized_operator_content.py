"""Add locale maps for operator-authored public content.

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a6b7c8d9e0f1"
down_revision: str | Sequence[str] | None = "z5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "provider_settings",
        sa.Column(
            "content_default_locale", sa.String(length=35), nullable=False, server_default="en"
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "content_locales",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_check_constraint(
        "ck_provider_settings_content_locales_object",
        "provider_settings",
        "jsonb_typeof(content_locales) = 'object'",
    )

    op.add_column(
        "sponsor_offers",
        sa.Column(
            "content_locales",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_check_constraint(
        "ck_sponsor_offers_content_locales_object",
        "sponsor_offers",
        "jsonb_typeof(content_locales) = 'object'",
    )

    op.execute(
        """
        UPDATE provider_settings
        SET content_locales = jsonb_build_object(
            'en',
            jsonb_strip_nulls(jsonb_build_object(
                'welcome_text', welcome_text,
                'welcome_button_text', welcome_button_text
            ))
        )
        WHERE welcome_text IS NOT NULL OR welcome_button_text IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE sponsor_offers
        SET content_locales = jsonb_build_object(
            'en',
            jsonb_build_object('title', title, 'description', description)
        )
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_sponsor_offers_content_locales_object",
        "sponsor_offers",
        type_="check",
    )
    op.drop_column("sponsor_offers", "content_locales")

    op.drop_constraint(
        "ck_provider_settings_content_locales_object",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "content_locales")
    op.drop_column("provider_settings", "content_default_locale")
