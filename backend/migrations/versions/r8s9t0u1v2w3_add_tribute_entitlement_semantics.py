"""Add Tribute subscription expiry and donation identity semantics.

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "r8s9t0u1v2w3"
down_revision: str | None = "q7r8s9t0u1v2"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Persist safe webhook semantics and use Tribute expiry for subscriptions."""
    op.add_column(
        "tribute_webhook_events",
        sa.Column("provider_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "tribute_webhook_events",
        sa.Column("is_anonymous", sa.Boolean(), nullable=True),
    )

    op.drop_constraint(
        "ck_commerce_rules_calculation_type",
        "commerce_rules",
        type_="check",
    )
    op.create_check_constraint(
        "ck_commerce_rules_calculation_type",
        "commerce_rules",
        "calculation_type IN ('fixed', 'volume', 'provider_expiry')",
    )
    op.execute(
        sa.text(
            "UPDATE commerce_rules "
            "SET calculator = jsonb_build_object('_migration_legacy', jsonb_build_object("
            "'calculation_type', calculation_type, 'calculator', calculator, "
            "'grant_mode', grant_mode)), "
            "calculation_type = 'provider_expiry', "
            "grant_mode = 'replace' "
            "WHERE commerce_type = 'subscription'"
        )
    )
    op.create_check_constraint(
        "ck_commerce_rules_subscription_expiry",
        "commerce_rules",
        "(commerce_type = 'subscription' AND calculation_type = 'provider_expiry' "
        "AND grant_mode = 'replace') OR "
        "(commerce_type <> 'subscription' AND calculation_type <> 'provider_expiry')",
    )


def downgrade() -> None:
    """Restore legacy fixed-duration subscription rules and inbox shape."""
    op.drop_constraint(
        "ck_commerce_rules_subscription_expiry",
        "commerce_rules",
        type_="check",
    )
    op.execute(
        sa.text(
            "UPDATE commerce_rules "
            "SET calculation_type = COALESCE("
            "calculator #>> '{_migration_legacy,calculation_type}', 'fixed'), "
            "grant_mode = COALESCE("
            "calculator #>> '{_migration_legacy,grant_mode}', 'replace'), "
            "calculator = COALESCE("
            "calculator #> '{_migration_legacy,calculator}', "
            "'{\"fixed_duration_days\": 30}'::jsonb) "
            "WHERE calculation_type = 'provider_expiry'"
        )
    )
    op.drop_constraint(
        "ck_commerce_rules_calculation_type",
        "commerce_rules",
        type_="check",
    )
    op.create_check_constraint(
        "ck_commerce_rules_calculation_type",
        "commerce_rules",
        "calculation_type IN ('fixed', 'volume')",
    )
    op.drop_column("tribute_webhook_events", "is_anonymous")
    op.drop_column("tribute_webhook_events", "provider_expires_at")
