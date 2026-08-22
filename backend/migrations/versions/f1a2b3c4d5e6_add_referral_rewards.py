"""Add referral rewards and welcome-discount settings.

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "e0f1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "provider_settings",
        sa.Column(
            "referral_reward_enabled",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column("referral_reward_days", sa.Integer(), nullable=True),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "referral_reward_access_profile_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "welcome_discount_enabled",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column(
            "welcome_discount_offer_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column("welcome_discount_url", sa.Text(), nullable=True),
    )
    op.create_check_constraint(
        "ck_provider_settings_referral_reward_days",
        "provider_settings",
        "referral_reward_days IS NULL OR referral_reward_days BETWEEN 1 AND 3650",
    )
    op.create_foreign_key(
        "fk_provider_settings_referral_reward_access_profile_id",
        "provider_settings",
        "access_profiles",
        ["referral_reward_access_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_provider_settings_welcome_discount_offer_id",
        "provider_settings",
        "sponsor_offers",
        ["welcome_discount_offer_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint(
        "ck_entitlement_operations_provider",
        "entitlement_operations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_entitlement_operations_provider",
        "entitlement_operations",
        "provider IN ('tribute', 'flowvy')",
    )

    op.create_table(
        "referral_conversions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("inviter_user_id", sa.BigInteger(), nullable=False),
        sa.Column("invitee_user_id", sa.BigInteger(), nullable=False),
        sa.Column("source_operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reward_operation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reward_days", sa.Integer(), nullable=True),
        sa.Column("reason_code", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "reward_days IS NULL OR reward_days > 0",
            name="ck_referral_conversions_reward_days",
        ),
        sa.ForeignKeyConstraint(
            ["source_operation_id"],
            ["entitlement_operations.id"],
            name="fk_referral_conversions_source_operation_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reward_operation_id"],
            ["entitlement_operations.id"],
            name="fk_referral_conversions_reward_operation_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_referral_conversions"),
        sa.UniqueConstraint("invitee_user_id", name="uq_referral_conversions_invitee_user_id"),
        sa.UniqueConstraint(
            "source_operation_id",
            name="uq_referral_conversions_source_operation_id",
        ),
        sa.UniqueConstraint(
            "reward_operation_id",
            name="uq_referral_conversions_reward_operation_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("referral_conversions")
    op.drop_constraint(
        "ck_entitlement_operations_provider",
        "entitlement_operations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_entitlement_operations_provider",
        "entitlement_operations",
        "provider IN ('tribute')",
    )
    op.drop_constraint(
        "fk_provider_settings_welcome_discount_offer_id",
        "provider_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_provider_settings_referral_reward_access_profile_id",
        "provider_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        "ck_provider_settings_referral_reward_days",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "welcome_discount_url")
    op.drop_column("provider_settings", "welcome_discount_offer_id")
    op.drop_column("provider_settings", "welcome_discount_enabled")
    op.drop_column("provider_settings", "referral_reward_access_profile_id")
    op.drop_column("provider_settings", "referral_reward_days")
    op.drop_column("provider_settings", "referral_reward_enabled")
