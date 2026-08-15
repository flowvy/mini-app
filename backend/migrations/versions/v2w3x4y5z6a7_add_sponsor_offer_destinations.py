"""Move donation destinations and expected amounts onto sponsor offers.

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-08-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "v2w3x4y5z6a7"
down_revision: str | Sequence[str] | None = "u1v2w3x4y5z6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "sponsor_offers"


def upgrade() -> None:
    op.add_column(_TABLE, sa.Column("checkout_url", sa.Text(), nullable=True))
    op.add_column(_TABLE, sa.Column("expected_amount_minor", sa.BigInteger(), nullable=True))
    op.create_check_constraint(
        "ck_sponsor_offers_expected_amount",
        _TABLE,
        "expected_amount_minor IS NULL OR expected_amount_minor > 0",
    )

    # Preserve a previously frozen donation destination. Old snapshots did not store
    # a currency-aware expected minor amount, so return them to draft until an
    # administrator confirms one amount and link explicitly.
    op.execute(
        """
        UPDATE sponsor_offers AS offer
        SET checkout_url = offer.checkout_snapshot ->> 'checkout_url'
        FROM commerce_rules AS rule
        WHERE offer.commerce_rule_id = rule.id
          AND rule.commerce_type = 'donation'
          AND offer.checkout_snapshot IS NOT NULL
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
          AND (offer.checkout_url IS NULL OR offer.expected_amount_minor IS NULL)
        """,
    )

    op.drop_constraint("uq_sponsor_offers_commerce_rule_id", _TABLE, type_="unique")
    op.create_index("ix_sponsor_offers_commerce_rule_id", _TABLE, ["commerce_rule_id"])


def downgrade() -> None:
    connection = op.get_bind()
    configured_count = connection.scalar(
        sa.text(
            "SELECT count(*) FROM sponsor_offers "
            "WHERE checkout_url IS NOT NULL OR expected_amount_minor IS NOT NULL",
        ),
    )
    duplicate_rule_count = connection.scalar(
        sa.text(
            "SELECT count(*) FROM ("
            "SELECT commerce_rule_id FROM sponsor_offers "
            "GROUP BY commerce_rule_id HAVING count(*) > 1"
            ") AS duplicated_rules",
        ),
    )
    if configured_count or duplicate_rule_count:
        raise RuntimeError(
            "Cannot downgrade while per-offer donation destinations or shared rules exist",
        )

    op.drop_index("ix_sponsor_offers_commerce_rule_id", table_name=_TABLE)
    op.create_unique_constraint(
        "uq_sponsor_offers_commerce_rule_id",
        _TABLE,
        ["commerce_rule_id"],
    )
    op.drop_constraint("ck_sponsor_offers_expected_amount", _TABLE, type_="check")
    op.drop_column(_TABLE, "expected_amount_minor")
    op.drop_column(_TABLE, "checkout_url")
