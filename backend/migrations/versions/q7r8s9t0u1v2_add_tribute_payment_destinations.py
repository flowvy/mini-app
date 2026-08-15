"""Add administrator-managed Tribute payment destinations.

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q7r8s9t0u1v2"
down_revision: str | None = "p6q7r8s9t0u1"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Persist one donation URL and subscription-ID-to-URL mappings."""
    op.add_column(
        "provider_settings",
        sa.Column("tribute_donation_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "tribute_subscription_urls",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_provider_settings_tribute_subscription_urls_object",
        "provider_settings",
        "jsonb_typeof(tribute_subscription_urls) = 'object'",
    )


def downgrade() -> None:
    """Remove stored Tribute destinations."""
    op.drop_constraint(
        "ck_provider_settings_tribute_subscription_urls_object",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "tribute_subscription_urls")
    op.drop_column("provider_settings", "tribute_donation_url")
