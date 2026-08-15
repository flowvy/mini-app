"""Add durable base-access snapshots and scheduled restoration operations.

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "s9t0u1v2w3x4"
down_revision: str | None = "r8s9t0u1v2w3"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Capture one base source per user and allow internal restore work."""
    op.create_table(
        "entitlement_baselines",
        sa.Column("user_id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("had_access", sa.Boolean(), nullable=False),
        sa.Column("remnawave_user_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "profile_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(had_access AND profile_snapshot IS NOT NULL AND expires_at IS NOT NULL) OR "
            "(NOT had_access AND profile_snapshot IS NULL AND expires_at IS NULL)",
            name="ck_entitlement_baselines_access_shape",
        ),
        sa.CheckConstraint(
            "profile_snapshot IS NULL OR jsonb_typeof(profile_snapshot) = 'object'",
            name="ck_entitlement_baselines_profile_object",
        ),
        sa.CheckConstraint(
            "remnawave_user_id IS NULL OR remnawave_user_id > 0",
            name="ck_entitlement_baselines_provider_user",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_entitlement_baselines_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_entitlement_baselines"),
    )
    op.drop_constraint(
        "ck_entitlement_operations_kind",
        "entitlement_operations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_entitlement_operations_kind",
        "entitlement_operations",
        "operation_kind IN ('grant', 'refund', 'restore', 'review')",
    )


def downgrade() -> None:
    """Remove empty restoration machinery without deleting audit history."""
    connection = op.get_bind()
    restore_count = connection.execute(
        sa.text("SELECT count(*) FROM entitlement_operations WHERE operation_kind = 'restore'")
    ).scalar_one()
    baseline_count = connection.execute(
        sa.text("SELECT count(*) FROM entitlement_baselines")
    ).scalar_one()
    if restore_count or baseline_count:
        raise RuntimeError("Cannot downgrade while entitlement baseline or restoration rows exist")
    op.drop_constraint(
        "ck_entitlement_operations_kind",
        "entitlement_operations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_entitlement_operations_kind",
        "entitlement_operations",
        "operation_kind IN ('grant', 'refund', 'review')",
    )
    op.drop_table("entitlement_baselines")
