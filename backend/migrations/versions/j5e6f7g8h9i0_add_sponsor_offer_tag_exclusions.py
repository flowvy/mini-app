"""Add Remnawave tag exclusions to sponsor offers.

Revision ID: j5e6f7g8h9i0
Revises: i4d5e6f7g8h9
Create Date: 2026-08-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "j5e6f7g8h9i0"
down_revision: str | Sequence[str] | None = "i4d5e6f7g8h9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sponsor_offers",
        sa.Column(
            "excluded_remnawave_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_sponsor_offers_excluded_remnawave_tags_array",
        "sponsor_offers",
        "jsonb_typeof(excluded_remnawave_tags) = 'array'",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_sponsor_offers_excluded_remnawave_tags_array",
        "sponsor_offers",
        type_="check",
    )
    op.drop_column("sponsor_offers", "excluded_remnawave_tags")
