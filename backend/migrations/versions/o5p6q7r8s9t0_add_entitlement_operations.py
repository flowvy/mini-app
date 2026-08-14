"""Add durable payment entitlement operations.

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "o5p6q7r8s9t0"
down_revision: str | None = "n4o5p6q7r8s9"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Create a durable ledger that can also act as a retryable provider outbox."""
    op.create_table(
        "entitlement_operations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_event_id", sa.BigInteger(), nullable=True),
        sa.Column("root_operation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("semantic_key", sa.String(length=196), nullable=True),
        sa.Column("event_name", sa.String(length=100), nullable=False),
        sa.Column("operation_kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reason_code", sa.String(length=64), nullable=True),
        sa.Column("provider_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=True),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("remnawave_user_id", sa.BigInteger(), nullable=True),
        sa.Column("purchase_id", sa.String(length=128), nullable=True),
        sa.Column("transaction_id", sa.String(length=128), nullable=True),
        sa.Column("external_item_id", sa.String(length=128), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("duration_days", sa.Integer(), nullable=True),
        sa.Column("grant_mode", sa.String(length=16), nullable=True),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("access_profile_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rule_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("profile_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("base_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("calculation_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("target_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("operator_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "provider IN ('tribute')",
            name="ck_entitlement_operations_provider",
        ),
        sa.CheckConstraint(
            "operation_kind IN ('grant', 'refund', 'review')",
            name="ck_entitlement_operations_kind",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'retry', 'applied', 'review', 'cancelled')",
            name="ck_entitlement_operations_status",
        ),
        sa.CheckConstraint(
            "amount_minor IS NULL OR amount_minor >= 0",
            name="ck_entitlement_operations_amount",
        ),
        sa.CheckConstraint(
            "currency IS NULL OR currency ~ '^[A-Z]{3}$'",
            name="ck_entitlement_operations_currency",
        ),
        sa.CheckConstraint(
            "duration_days IS NULL OR duration_days > 0",
            name="ck_entitlement_operations_duration",
        ),
        sa.CheckConstraint(
            "grant_mode IS NULL OR grant_mode IN ('extend', 'replace')",
            name="ck_entitlement_operations_grant_mode",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0",
            name="ck_entitlement_operations_attempt_count",
        ),
        sa.ForeignKeyConstraint(
            ["source_event_id"],
            ["tribute_webhook_events.id"],
            name="fk_entitlement_operations_source_event_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["root_operation_id"],
            ["entitlement_operations.id"],
            name="fk_entitlement_operations_root_operation_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_entitlement_operations_user_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["rule_id"],
            ["commerce_rules.id"],
            name="fk_entitlement_operations_rule_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["access_profile_id"],
            ["access_profiles.id"],
            name="fk_entitlement_operations_access_profile_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_event_id",
            name="uq_entitlement_operations_source_event_id",
        ),
    )
    op.create_index(
        "uq_entitlement_operations_provider_semantic_key",
        "entitlement_operations",
        ["provider", "semantic_key"],
        unique=True,
        postgresql_where=sa.text("semantic_key IS NOT NULL"),
    )
    op.create_index(
        "uq_entitlement_operations_processing_user",
        "entitlement_operations",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'processing' AND user_id IS NOT NULL"),
    )
    op.create_index(
        "ix_entitlement_operations_status_next_attempt",
        "entitlement_operations",
        ["status", "next_attempt_at", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_entitlement_operations_user_created",
        "entitlement_operations",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_entitlement_operations_purchase",
        "entitlement_operations",
        ["provider", "purchase_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove only the entitlement ledger and its indexes."""
    op.drop_index("ix_entitlement_operations_purchase", table_name="entitlement_operations")
    op.drop_index("ix_entitlement_operations_user_created", table_name="entitlement_operations")
    op.drop_index(
        "ix_entitlement_operations_status_next_attempt",
        table_name="entitlement_operations",
    )
    op.drop_index(
        "uq_entitlement_operations_processing_user",
        table_name="entitlement_operations",
    )
    op.drop_index(
        "uq_entitlement_operations_provider_semantic_key",
        table_name="entitlement_operations",
    )
    op.drop_table("entitlement_operations")
