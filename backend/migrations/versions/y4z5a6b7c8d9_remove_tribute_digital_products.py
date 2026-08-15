"""Remove abandoned Tribute digital-product configuration.

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
Create Date: 2026-08-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "y4z5a6b7c8d9"
down_revision: str | Sequence[str] | None = "x3y4z5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Retire abandoned configuration and local redirect intents. Authenticated
    # webhook/audit rows and entitlement ledger rows are preserved below.
    op.execute("DELETE FROM sponsor_checkouts WHERE commerce_type = 'digital_product'")
    op.execute(
        "DELETE FROM sponsor_offers WHERE commerce_rule_id IN "
        "(SELECT id FROM commerce_rules WHERE commerce_type = 'digital_product')",
    )
    op.execute("DELETE FROM commerce_rules WHERE commerce_type = 'digital_product'")

    op.drop_constraint("ck_commerce_rules_commerce_type", "commerce_rules", type_="check")
    op.drop_constraint("ck_commerce_rules_external_item", "commerce_rules", type_="check")
    op.drop_constraint("ck_commerce_rules_payment_shape", "commerce_rules", type_="check")
    op.create_check_constraint(
        "ck_commerce_rules_commerce_type",
        "commerce_rules",
        "commerce_type IN ('donation', 'subscription')",
    )
    op.create_check_constraint(
        "ck_commerce_rules_external_item",
        "commerce_rules",
        "(commerce_type = 'donation' AND external_item_id IS NULL) OR "
        "(commerce_type = 'subscription' AND external_item_id IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_commerce_rules_payment_shape",
        "commerce_rules",
        "(commerce_type = 'donation') OR "
        "(commerce_type = 'subscription' AND payment_mode = 'recurring')",
    )

    op.drop_constraint(
        "ck_sponsor_checkouts_commerce_type",
        "sponsor_checkouts",
        type_="check",
    )
    op.create_check_constraint(
        "ck_sponsor_checkouts_commerce_type",
        "sponsor_checkouts",
        "commerce_type IN ('donation', 'subscription')",
    )

    op.execute(
        "UPDATE tribute_webhook_events "
        "SET event_family = 'other', processing_status = 'ignored' "
        "WHERE event_family = 'digital_product'",
    )
    op.drop_constraint(
        "ck_tribute_webhook_events_family",
        "tribute_webhook_events",
        type_="check",
    )
    op.create_check_constraint(
        "ck_tribute_webhook_events_family",
        "tribute_webhook_events",
        "event_family IN ('donation', 'subscription', 'other')",
    )

    op.drop_index("ix_tribute_webhook_events_purchase", table_name="tribute_webhook_events")
    op.alter_column(
        "tribute_webhook_events",
        "purchase_id",
        new_column_name="provider_reference_id",
        existing_type=sa.String(length=128),
        existing_nullable=True,
    )
    op.create_index(
        "ix_tribute_webhook_events_provider_reference",
        "tribute_webhook_events",
        ["provider_reference_id"],
    )

    op.drop_index("ix_entitlement_operations_purchase", table_name="entitlement_operations")
    op.alter_column(
        "entitlement_operations",
        "purchase_id",
        new_column_name="provider_reference_id",
        existing_type=sa.String(length=128),
        existing_nullable=True,
    )
    op.create_index(
        "ix_entitlement_operations_provider_reference",
        "entitlement_operations",
        ["provider", "provider_reference_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_entitlement_operations_provider_reference",
        table_name="entitlement_operations",
    )
    op.alter_column(
        "entitlement_operations",
        "provider_reference_id",
        new_column_name="purchase_id",
        existing_type=sa.String(length=128),
        existing_nullable=True,
    )
    op.create_index(
        "ix_entitlement_operations_purchase",
        "entitlement_operations",
        ["provider", "purchase_id"],
    )

    op.drop_index(
        "ix_tribute_webhook_events_provider_reference",
        table_name="tribute_webhook_events",
    )
    op.alter_column(
        "tribute_webhook_events",
        "provider_reference_id",
        new_column_name="purchase_id",
        existing_type=sa.String(length=128),
        existing_nullable=True,
    )
    op.create_index(
        "ix_tribute_webhook_events_purchase",
        "tribute_webhook_events",
        ["purchase_id"],
    )

    op.drop_constraint(
        "ck_tribute_webhook_events_family",
        "tribute_webhook_events",
        type_="check",
    )
    op.create_check_constraint(
        "ck_tribute_webhook_events_family",
        "tribute_webhook_events",
        "event_family IN ('donation', 'subscription', 'digital_product', 'other')",
    )

    op.drop_constraint(
        "ck_sponsor_checkouts_commerce_type",
        "sponsor_checkouts",
        type_="check",
    )
    op.create_check_constraint(
        "ck_sponsor_checkouts_commerce_type",
        "sponsor_checkouts",
        "commerce_type IN ('donation', 'subscription', 'digital_product')",
    )

    op.drop_constraint("ck_commerce_rules_payment_shape", "commerce_rules", type_="check")
    op.drop_constraint("ck_commerce_rules_external_item", "commerce_rules", type_="check")
    op.drop_constraint("ck_commerce_rules_commerce_type", "commerce_rules", type_="check")
    op.create_check_constraint(
        "ck_commerce_rules_commerce_type",
        "commerce_rules",
        "commerce_type IN ('donation', 'subscription', 'digital_product')",
    )
    op.create_check_constraint(
        "ck_commerce_rules_external_item",
        "commerce_rules",
        "(commerce_type = 'donation' AND external_item_id IS NULL) OR "
        "(commerce_type IN ('subscription', 'digital_product') "
        "AND external_item_id IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_commerce_rules_payment_shape",
        "commerce_rules",
        "(commerce_type = 'donation') OR "
        "(commerce_type = 'subscription' AND payment_mode = 'recurring') OR "
        "(commerce_type = 'digital_product' AND payment_mode = 'one_time')",
    )
