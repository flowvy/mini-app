"""Expand bounded Tribute recurring periods.

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-08-14
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "u1v2w3x4y5z6"
down_revision: str | Sequence[str] | None = "t0u1v2w3x4y5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "tribute_webhook_events"
_CONSTRAINT = "ck_tribute_webhook_events_provider_period"


def upgrade() -> None:
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(
        _CONSTRAINT,
        _TABLE,
        "provider_period IS NULL OR provider_period IN "
        "('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly')",
    )


def downgrade() -> None:
    # Refuse a lossy downgrade once an expanded period has been observed.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM tribute_webhook_events
                WHERE provider_period IN ('weekly', 'halfyearly')
            ) THEN
                RAISE EXCEPTION
                    'Cannot downgrade while weekly or halfyearly Tribute events exist';
            END IF;
        END
        $$
        """,
    )
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(
        _CONSTRAINT,
        _TABLE,
        "provider_period IS NULL OR provider_period IN ('monthly', 'quarterly', 'yearly')",
    )
