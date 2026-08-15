"""Add fail-closed expected schedules to sponsor donation offers.

Revision ID: x3y4z5a6b7c8
Revises: w3x4y5z6a7b8
Create Date: 2026-08-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "x3y4z5a6b7c8"
down_revision: str | Sequence[str] | None = "w3x4y5z6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "sponsor_offers"


def upgrade() -> None:
    op.add_column(_TABLE, sa.Column("expected_payment_mode", sa.String(length=16), nullable=True))
    op.add_column(
        _TABLE, sa.Column("expected_provider_period", sa.String(length=16), nullable=True)
    )
    op.create_check_constraint(
        "ck_sponsor_offers_expected_payment_mode",
        _TABLE,
        "expected_payment_mode IS NULL OR expected_payment_mode IN ('one_time', 'recurring')",
    )
    op.create_check_constraint(
        "ck_sponsor_offers_expected_provider_period",
        _TABLE,
        "expected_provider_period IS NULL OR expected_provider_period IN "
        "('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly')",
    )
    op.create_check_constraint(
        "ck_sponsor_offers_expected_schedule",
        _TABLE,
        "(expected_payment_mode = 'recurring' AND expected_provider_period IS NOT NULL) OR "
        "(expected_payment_mode IS DISTINCT FROM 'recurring' "
        "AND expected_provider_period IS NULL)",
    )

    # A one-time rule already proves the only possible schedule. Recurring and
    # mixed rules do not prove a provider cadence, so republish them only after
    # an administrator selects the exact period visible to the payer.
    op.execute(
        """
        UPDATE sponsor_offers AS offer
        SET expected_payment_mode = 'one_time',
            checkout_snapshot = CASE
                WHEN offer.checkout_snapshot IS NULL THEN NULL
                ELSE offer.checkout_snapshot || jsonb_build_object(
                    'expected_payment_mode', 'one_time',
                    'expected_provider_period', NULL
                )
            END
        FROM commerce_rules AS rule
        WHERE offer.commerce_rule_id = rule.id
          AND rule.commerce_type = 'donation'
          AND rule.payment_mode = 'one_time'
        """,
    )
    op.execute(
        """
        UPDATE sponsor_offers AS offer
        SET is_published = false,
            checkout_snapshot = NULL
        FROM commerce_rules AS rule
        WHERE offer.commerce_rule_id = rule.id
          AND rule.commerce_type = 'donation'
          AND rule.payment_mode <> 'one_time'
        """,
    )


def downgrade() -> None:
    connection = op.get_bind()
    configured_count = connection.scalar(
        sa.text(
            "SELECT count(*) FROM sponsor_offers "
            "WHERE expected_payment_mode IS NOT NULL OR expected_provider_period IS NOT NULL",
        ),
    )
    if configured_count:
        raise RuntimeError(
            "Cannot downgrade while sponsor donation schedule expectations are configured",
        )

    op.drop_constraint("ck_sponsor_offers_expected_schedule", _TABLE, type_="check")
    op.drop_constraint("ck_sponsor_offers_expected_provider_period", _TABLE, type_="check")
    op.drop_constraint("ck_sponsor_offers_expected_payment_mode", _TABLE, type_="check")
    op.drop_column(_TABLE, "expected_provider_period")
    op.drop_column(_TABLE, "expected_payment_mode")
