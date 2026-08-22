"""Add prepared Telegram invite-share settings.

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e0f1a2b3c4d5"
down_revision: str | Sequence[str] | None = "d9e0f1a2b3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "provider_settings",
        sa.Column("invite_share_media_type", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("invite_share_media_file_id", sa.Text(), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column("invite_share_media_file_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "invite_share_preview_mode",
            sa.String(length=16),
            server_default="auto",
            nullable=False,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "invite_share_allow_user_chats",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "invite_share_allow_bot_chats",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "invite_share_allow_group_chats",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "invite_share_allow_channel_chats",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_provider_settings_invite_share_media",
        "provider_settings",
        "(invite_share_media_file_id IS NULL AND invite_share_media_type IS NULL) OR "
        "(invite_share_media_file_id IS NOT NULL AND "
        "invite_share_media_type IN ('photo', 'animation', 'video'))",
    )
    op.create_check_constraint(
        "ck_provider_settings_invite_share_preview_mode",
        "provider_settings",
        "invite_share_preview_mode IN ('auto', 'hidden', 'small', 'large')",
    )
    op.create_check_constraint(
        "ck_provider_settings_invite_share_audience",
        "provider_settings",
        "invite_share_allow_user_chats OR invite_share_allow_bot_chats OR "
        "invite_share_allow_group_chats OR invite_share_allow_channel_chats",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_provider_settings_invite_share_audience",
        "provider_settings",
        type_="check",
    )
    op.drop_constraint(
        "ck_provider_settings_invite_share_preview_mode",
        "provider_settings",
        type_="check",
    )
    op.drop_constraint(
        "ck_provider_settings_invite_share_media",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "invite_share_allow_channel_chats")
    op.drop_column("provider_settings", "invite_share_allow_group_chats")
    op.drop_column("provider_settings", "invite_share_allow_bot_chats")
    op.drop_column("provider_settings", "invite_share_allow_user_chats")
    op.drop_column("provider_settings", "invite_share_preview_mode")
    op.drop_column("provider_settings", "invite_share_media_file_name")
    op.drop_column("provider_settings", "invite_share_media_file_id")
    op.drop_column("provider_settings", "invite_share_media_type")
