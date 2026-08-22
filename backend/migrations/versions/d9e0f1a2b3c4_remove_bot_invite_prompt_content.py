"""Remove the obsolete bot invite-only prompt content.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: str | Sequence[str] | None = "c8d9e0f1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE provider_settings
        SET content_locales = COALESCE(
            (
                SELECT jsonb_object_agg(
                    locale,
                    CASE
                        WHEN jsonb_typeof(content) = 'object'
                        THEN content - 'bot_invite_required'
                        ELSE content
                    END
                )
                FROM jsonb_each(content_locales) AS localized(locale, content)
            ),
            '{}'::jsonb
        )
        """
    )
    op.drop_constraint(
        "ck_provider_settings_bot_invite_media",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "bot_invite_media_file_name")
    op.drop_column("provider_settings", "bot_invite_media_file_id")
    op.drop_column("provider_settings", "bot_invite_media_type")


def downgrade() -> None:
    op.add_column(
        "provider_settings",
        sa.Column("bot_invite_media_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("bot_invite_media_file_id", sa.Text(), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("bot_invite_media_file_name", sa.Text(), nullable=True),
    )
    op.create_check_constraint(
        "ck_provider_settings_bot_invite_media",
        "provider_settings",
        "(bot_invite_media_file_id IS NULL AND bot_invite_media_type IS NULL) OR "
        "(bot_invite_media_file_id IS NOT NULL AND "
        "bot_invite_media_type IN ('photo', 'animation'))",
    )
