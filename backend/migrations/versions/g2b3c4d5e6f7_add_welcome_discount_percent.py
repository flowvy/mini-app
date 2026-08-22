"""Add configured welcome-discount percentage.

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g2b3c4d5e6f7"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "provider_settings",
        sa.Column("welcome_discount_percent", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_provider_settings_welcome_discount_percent",
        "provider_settings",
        "welcome_discount_percent IS NULL OR welcome_discount_percent BETWEEN 1 AND 99",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_provider_settings_welcome_discount_percent",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "welcome_discount_percent")
