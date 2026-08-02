"""Add selectable Kuma or Beszel Pulse provider.

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "j0k1l2m3n4o5"
down_revision: str | None = "i9j0k1l2m3n4"
branch_labels: str | None = None
depends_on: str | None = None

PROVIDER_CHECK = "pulse_provider IN ('disabled', 'kuma', 'beszel')"


def upgrade() -> None:
    """Replace the Kuma flag with a provider selector and Beszel origin."""
    op.add_column(
        "provider_settings",
        sa.Column(
            "pulse_provider",
            sa.String(length=16),
            nullable=False,
            server_default="disabled",
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column("beszel_url", sa.String(length=512), nullable=True),
    )
    op.execute("UPDATE provider_settings SET pulse_provider = 'kuma' WHERE kuma_enabled = true")
    op.create_check_constraint(
        "ck_provider_settings_pulse_provider",
        "provider_settings",
        PROVIDER_CHECK,
    )
    op.alter_column("provider_settings", "pulse_provider", server_default=None)
    op.drop_column("provider_settings", "kuma_enabled")


def downgrade() -> None:
    """Restore the legacy Kuma-only enabled flag."""
    op.add_column(
        "provider_settings",
        sa.Column(
            "kuma_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute("UPDATE provider_settings SET kuma_enabled = true WHERE pulse_provider = 'kuma'")
    op.alter_column("provider_settings", "kuma_enabled", server_default=None)
    op.drop_constraint(
        "ck_provider_settings_pulse_provider",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "beszel_url")
    op.drop_column("provider_settings", "pulse_provider")
