"""Add invite-prompt media and formatted source headroom.

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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

    op.drop_constraint(
        "ck_sponsor_offers_description",
        "sponsor_offers",
        type_="check",
    )
    op.create_check_constraint(
        "ck_sponsor_offers_description",
        "sponsor_offers",
        "char_length(description) <= 2000",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_sponsor_offers_description",
        "sponsor_offers",
        type_="check",
    )
    op.create_check_constraint(
        "ck_sponsor_offers_description",
        "sponsor_offers",
        "char_length(description) <= 300",
    )

    op.drop_constraint(
        "ck_provider_settings_bot_invite_media",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "bot_invite_media_file_name")
    op.drop_column("provider_settings", "bot_invite_media_file_id")
    op.drop_column("provider_settings", "bot_invite_media_type")
