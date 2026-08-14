"""Add auditable entitlement operator actions.

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "p6q7r8s9t0u1"
down_revision: str | None = "o5p6q7r8s9t0"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Add a terminal review status and an append-only action trail."""
    op.drop_constraint(
        "ck_entitlement_operations_status",
        "entitlement_operations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_entitlement_operations_status",
        "entitlement_operations",
        "status IN "
        "('pending', 'processing', 'retry', 'applied', 'review', 'resolved', 'cancelled')",
    )
    op.create_table(
        "entitlement_operation_actions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", sa.BigInteger(), nullable=True),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("previous_status", sa.String(length=16), nullable=False),
        sa.Column("previous_reason_code", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "action IN ('retry', 'resolve')",
            name="ck_entitlement_operation_actions_action",
        ),
        sa.CheckConstraint(
            "previous_status IN "
            "('pending', 'processing', 'retry', 'applied', 'review', 'resolved', 'cancelled')",
            name="ck_entitlement_operation_actions_previous_status",
        ),
        sa.CheckConstraint(
            "actor_telegram_id >= 0",
            name="ck_entitlement_operation_actions_actor_telegram_id",
        ),
        sa.CheckConstraint(
            "(action = 'retry' AND note IS NULL) OR "
            "(action = 'resolve' AND char_length(note) BETWEEN 1 AND 500)",
            name="ck_entitlement_operation_actions_note",
        ),
        sa.ForeignKeyConstraint(
            ["operation_id"],
            ["entitlement_operations.id"],
            name="fk_entitlement_operation_actions_operation_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_entitlement_operation_actions_actor_user_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "request_id",
            name="uq_entitlement_operation_actions_request_id",
        ),
    )
    op.create_index(
        "ix_entitlement_operation_actions_operation_created",
        "entitlement_operation_actions",
        ["operation_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the audit trail only when it has never accepted an action."""
    bind = op.get_bind()
    action_count = bind.execute(
        sa.text("SELECT count(*) FROM entitlement_operation_actions"),
    ).scalar_one()
    resolved_count = bind.execute(
        sa.text("SELECT count(*) FROM entitlement_operations WHERE status = 'resolved'"),
    ).scalar_one()
    if action_count or resolved_count:
        msg = "Cannot downgrade entitlement operator actions after operator decisions exist"
        raise RuntimeError(msg)

    op.drop_index(
        "ix_entitlement_operation_actions_operation_created",
        table_name="entitlement_operation_actions",
    )
    op.drop_table("entitlement_operation_actions")
    op.drop_constraint(
        "ck_entitlement_operations_status",
        "entitlement_operations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_entitlement_operations_status",
        "entitlement_operations",
        "status IN ('pending', 'processing', 'retry', 'applied', 'review', 'cancelled')",
    )
