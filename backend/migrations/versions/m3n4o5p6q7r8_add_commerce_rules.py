"""Add provider-neutral commerce-rule configuration.

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3n4o5p6q7r8"
down_revision: str | None = "l2m3n4o5p6q7"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Persist administrator-authored mappings without enabling execution."""
    op.create_table(
        "commerce_rules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("commerce_type", sa.String(length=32), nullable=False),
        sa.Column("payment_mode", sa.String(length=16), nullable=False),
        sa.Column("external_item_id", sa.String(length=128), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("calculation_type", sa.String(length=16), nullable=False),
        sa.Column(
            "calculator",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("access_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("grant_mode", sa.String(length=16), nullable=False),
        sa.Column("priority", sa.Integer(), server_default="100", nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("provider IN ('tribute')", name="ck_commerce_rules_provider"),
        sa.CheckConstraint(
            "commerce_type IN ('donation', 'subscription', 'digital_product')",
            name="ck_commerce_rules_commerce_type",
        ),
        sa.CheckConstraint(
            "payment_mode IN ('any', 'one_time', 'recurring')",
            name="ck_commerce_rules_payment_mode",
        ),
        sa.CheckConstraint(
            "calculation_type IN ('fixed', 'volume')",
            name="ck_commerce_rules_calculation_type",
        ),
        sa.CheckConstraint(
            "grant_mode IN ('extend', 'replace')",
            name="ck_commerce_rules_grant_mode",
        ),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="ck_commerce_rules_currency"),
        sa.CheckConstraint(
            "priority BETWEEN 1 AND 10000",
            name="ck_commerce_rules_priority",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(calculator) = 'object'",
            name="ck_commerce_rules_calculator_object",
        ),
        sa.CheckConstraint(
            "(commerce_type = 'donation' AND external_item_id IS NULL) OR "
            "(commerce_type IN ('subscription', 'digital_product') "
            "AND external_item_id IS NOT NULL)",
            name="ck_commerce_rules_external_item",
        ),
        sa.CheckConstraint(
            "(commerce_type = 'donation') OR "
            "(commerce_type = 'subscription' AND payment_mode = 'recurring') OR "
            "(commerce_type = 'digital_product' AND payment_mode = 'one_time')",
            name="ck_commerce_rules_payment_shape",
        ),
        sa.ForeignKeyConstraint(
            ["access_profile_id"],
            ["access_profiles.id"],
            name="fk_commerce_rules_access_profile_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_commerce_rules_created_by_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_commerce_rules_provider_priority",
        "commerce_rules",
        ["provider", "priority", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove only the unused configuration table."""
    op.drop_index("ix_commerce_rules_provider_priority", table_name="commerce_rules")
    op.drop_table("commerce_rules")
