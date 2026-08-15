"""Add provider-neutral sponsor offers and local checkout state.

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-08-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t0u1v2w3x4y5"
down_revision: str | Sequence[str] | None = "s9t0u1v2w3x4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tribute_webhook_events",
        sa.Column("provider_period", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "tribute_webhook_events",
        sa.Column("subscription_type", sa.String(length=16), nullable=True),
    )
    op.create_check_constraint(
        "ck_tribute_webhook_events_provider_period",
        "tribute_webhook_events",
        "provider_period IS NULL OR provider_period IN ('monthly', 'quarterly', 'yearly')",
    )
    op.create_check_constraint(
        "ck_tribute_webhook_events_subscription_type",
        "tribute_webhook_events",
        "subscription_type IS NULL OR subscription_type IN ('regular', 'gift', 'trial')",
    )

    op.create_table(
        "sponsor_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("commerce_rule_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("checkout_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("provider IN ('tribute')", name="ck_sponsor_offers_provider"),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 100",
            name="ck_sponsor_offers_title",
        ),
        sa.CheckConstraint(
            "char_length(description) <= 300",
            name="ck_sponsor_offers_description",
        ),
        sa.CheckConstraint(
            "sort_order BETWEEN 1 AND 10000",
            name="ck_sponsor_offers_sort_order",
        ),
        sa.CheckConstraint(
            "checkout_snapshot IS NULL OR jsonb_typeof(checkout_snapshot) = 'object'",
            name="ck_sponsor_offers_checkout_snapshot",
        ),
        sa.CheckConstraint(
            "is_published = false OR checkout_snapshot IS NOT NULL",
            name="ck_sponsor_offers_published_snapshot",
        ),
        sa.ForeignKeyConstraint(
            ["commerce_rule_id"],
            ["commerce_rules.id"],
            name="fk_sponsor_offers_commerce_rule_id_commerce_rules",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_sponsor_offers_created_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sponsor_offers"),
        sa.UniqueConstraint("commerce_rule_id", name="uq_sponsor_offers_commerce_rule_id"),
    )

    op.create_table(
        "sponsor_checkouts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("offer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("commerce_type", sa.String(length=32), nullable=False),
        sa.Column("payment_mode", sa.String(length=16), nullable=False),
        sa.Column("external_item_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("offer_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("provider_event_id", sa.BigInteger(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("provider IN ('tribute')", name="ck_sponsor_checkouts_provider"),
        sa.CheckConstraint(
            "commerce_type IN ('donation', 'subscription', 'digital_product')",
            name="ck_sponsor_checkouts_commerce_type",
        ),
        sa.CheckConstraint(
            "payment_mode IN ('any', 'one_time', 'recurring')",
            name="ck_sponsor_checkouts_payment_mode",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'expired')",
            name="ck_sponsor_checkouts_status",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(offer_snapshot) = 'object'",
            name="ck_sponsor_checkouts_offer_snapshot",
        ),
        sa.ForeignKeyConstraint(
            ["offer_id"],
            ["sponsor_offers.id"],
            name="fk_sponsor_checkouts_offer_id_sponsor_offers",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["provider_event_id"],
            ["tribute_webhook_events.id"],
            name="fk_sponsor_checkouts_provider_event_id_tribute_webhook_events",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_sponsor_checkouts_user_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sponsor_checkouts"),
        sa.UniqueConstraint("provider_event_id", name="uq_sponsor_checkouts_provider_event_id"),
    )
    op.create_index(
        "ix_sponsor_checkouts_user_created",
        "sponsor_checkouts",
        ["user_id", "created_at"],
    )
    op.create_index(
        "uq_sponsor_checkouts_pending_user",
        "sponsor_checkouts",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    connection = op.get_bind()
    offer_count = connection.scalar(sa.text("SELECT count(*) FROM sponsor_offers"))
    checkout_count = connection.scalar(sa.text("SELECT count(*) FROM sponsor_checkouts"))
    enriched_event_count = connection.scalar(
        sa.text(
            "SELECT count(*) FROM tribute_webhook_events "
            "WHERE provider_period IS NOT NULL OR subscription_type IS NOT NULL",
        ),
    )
    if offer_count or checkout_count or enriched_event_count:
        raise RuntimeError(
            "Cannot downgrade sponsor checkout migration while sponsor or enriched "
            "webhook data exists",
        )

    op.drop_index("uq_sponsor_checkouts_pending_user", table_name="sponsor_checkouts")
    op.drop_index("ix_sponsor_checkouts_user_created", table_name="sponsor_checkouts")
    op.drop_table("sponsor_checkouts")
    op.drop_table("sponsor_offers")
    op.drop_constraint(
        "ck_tribute_webhook_events_subscription_type",
        "tribute_webhook_events",
        type_="check",
    )
    op.drop_constraint(
        "ck_tribute_webhook_events_provider_period",
        "tribute_webhook_events",
        type_="check",
    )
    op.drop_column("tribute_webhook_events", "subscription_type")
    op.drop_column("tribute_webhook_events", "provider_period")
