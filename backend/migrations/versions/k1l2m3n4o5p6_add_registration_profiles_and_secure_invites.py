"""Add registration policy, access profiles, and secure invite storage.

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
"""

from __future__ import annotations

import hashlib
import re

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "k1l2m3n4o5p6"
down_revision: str | None = "j0k1l2m3n4o5"
branch_labels: str | None = None
depends_on: str | None = None

REGISTRATION_MODE_CHECK = "registration_mode IN ('open', 'invite_only')"
VALIDITY_MODE_CHECK = "validity_mode IN ('duration', 'fixed', 'lifetime')"
TRAFFIC_STRATEGY_CHECK = (
    "traffic_limit_strategy IN ('NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING')"
)
STATUS_CHECK = "status IN ('ACTIVE', 'DISABLED', 'LIMITED', 'EXPIRED')"
VALIDITY_FIELDS_CHECK = (
    "(validity_mode = 'duration' AND validity_days IS NOT NULL "
    "AND validity_days > 0 AND fixed_expire_at IS NULL) OR "
    "(validity_mode = 'fixed' AND validity_days IS NULL "
    "AND fixed_expire_at IS NOT NULL) OR "
    "(validity_mode = 'lifetime' AND validity_days IS NULL "
    "AND fixed_expire_at IS NULL)"
)


def _normalize_legacy_code(value: str) -> str:
    """Match application normalization while migrating legacy plaintext codes."""
    return re.sub(r"[\s-]+", "", value).upper()


def upgrade() -> None:
    """Create reusable grants and replace plaintext invite codes with digests."""
    op.create_table(
        "access_profiles",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("validity_mode", sa.String(length=16), nullable=False),
        sa.Column("validity_days", sa.Integer(), nullable=True),
        sa.Column("fixed_expire_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "traffic_limit_bytes",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "traffic_limit_strategy",
            sa.String(length=20),
            server_default="NO_RESET",
            nullable=False,
        ),
        sa.Column("hwid_device_limit", sa.Integer(), nullable=True),
        sa.Column("tag", sa.String(length=16), nullable=True),
        sa.Column("status", sa.String(length=10), server_default="ACTIVE", nullable=False),
        sa.Column(
            "internal_squad_uuids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("external_squad_uuid", sa.Uuid(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(VALIDITY_MODE_CHECK, name="ck_access_profiles_validity_mode"),
        sa.CheckConstraint(
            TRAFFIC_STRATEGY_CHECK,
            name="ck_access_profiles_traffic_strategy",
        ),
        sa.CheckConstraint(STATUS_CHECK, name="ck_access_profiles_status"),
        sa.CheckConstraint(
            "traffic_limit_bytes >= 0",
            name="ck_access_profiles_traffic_nonnegative",
        ),
        sa.CheckConstraint(
            "hwid_device_limit IS NULL OR hwid_device_limit >= 0",
            name="ck_access_profiles_hwid_nonnegative",
        ),
        sa.CheckConstraint(VALIDITY_FIELDS_CHECK, name="ck_access_profiles_validity_fields"),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_access_profiles_created_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_access_profiles_name"),
    )

    op.add_column(
        "provider_settings",
        sa.Column(
            "registration_mode",
            sa.String(length=16),
            server_default="open",
            nullable=False,
        ),
    )
    op.add_column(
        "provider_settings",
        sa.Column("default_access_profile_id", sa.Uuid(), nullable=True),
    )
    op.create_check_constraint(
        "ck_provider_settings_registration_mode",
        "provider_settings",
        REGISTRATION_MODE_CHECK,
    )
    op.create_foreign_key(
        "fk_provider_settings_default_access_profile_id",
        "provider_settings",
        "access_profiles",
        ["default_access_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column("provider_settings", "registration_mode", server_default=None)

    op.add_column("invites", sa.Column("code_digest", sa.LargeBinary(length=32), nullable=True))
    op.add_column("invites", sa.Column("code_hint", sa.String(length=16), nullable=True))
    op.add_column("invites", sa.Column("note", sa.String(length=200), nullable=True))
    op.add_column("invites", sa.Column("access_profile_id", sa.Uuid(), nullable=True))
    op.add_column(
        "invites",
        sa.Column(
            "access_profile_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "invites",
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("invites", sa.Column("revoked_by_id", sa.BigInteger(), nullable=True))

    bind = op.get_bind()
    legacy_rows = bind.execute(sa.text("SELECT id, code FROM invites")).mappings().all()
    seen: set[bytes] = set()
    for row in legacy_rows:
        normalized = _normalize_legacy_code(row["code"])
        digest = hashlib.sha256(normalized.encode("utf-8")).digest()
        if digest in seen:
            raise RuntimeError("Legacy invite codes collide after secure normalization")
        seen.add(digest)
        hint = normalized[:4] + "…" + normalized[-4:] if len(normalized) > 8 else normalized
        bind.execute(
            sa.text("UPDATE invites SET code_digest = :digest, code_hint = :hint WHERE id = :id"),
            {"digest": digest, "hint": hint, "id": row["id"]},
        )

    op.execute(
        "UPDATE invites SET expires_at = now() + interval '30 days' WHERE expires_at IS NULL"
    )
    op.alter_column("invites", "code_digest", nullable=False)
    op.alter_column("invites", "code_hint", nullable=False)
    op.alter_column(
        "invites",
        "used_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="used_at AT TIME ZONE 'UTC'",
        existing_nullable=True,
    )
    op.alter_column(
        "invites",
        "expires_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using="expires_at AT TIME ZONE 'UTC'",
        nullable=False,
    )
    op.create_foreign_key(
        "fk_invites_access_profile_id",
        "invites",
        "access_profiles",
        ["access_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_invites_revoked_by_id_users",
        "invites",
        "users",
        ["revoked_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_invites_code_digest", "invites", ["code_digest"], unique=True)
    op.drop_index("ix_invites_code", table_name="invites")
    op.drop_column("invites", "code")


def downgrade() -> None:
    """Restore the legacy schema; pending codes are deliberately invalidated."""
    op.add_column("invites", sa.Column("code", sa.String(length=64), nullable=True))
    op.execute("UPDATE invites SET code = encode(code_digest, 'hex')")
    op.alter_column("invites", "code", nullable=False)
    op.create_index("ix_invites_code", "invites", ["code"], unique=True)
    op.drop_index("ix_invites_code_digest", table_name="invites")
    op.drop_constraint("fk_invites_revoked_by_id_users", "invites", type_="foreignkey")
    op.drop_constraint("fk_invites_access_profile_id", "invites", type_="foreignkey")
    op.alter_column(
        "invites",
        "expires_at",
        type_=sa.DateTime(),
        postgresql_using="expires_at AT TIME ZONE 'UTC'",
        nullable=True,
    )
    op.alter_column(
        "invites",
        "used_at",
        type_=sa.DateTime(),
        postgresql_using="used_at AT TIME ZONE 'UTC'",
        existing_nullable=True,
    )
    for column in (
        "revoked_by_id",
        "revoked_at",
        "access_profile_snapshot",
        "access_profile_id",
        "note",
        "code_hint",
        "code_digest",
    ):
        op.drop_column("invites", column)

    op.drop_constraint(
        "fk_provider_settings_default_access_profile_id",
        "provider_settings",
        type_="foreignkey",
    )
    op.drop_constraint(
        "ck_provider_settings_registration_mode",
        "provider_settings",
        type_="check",
    )
    op.drop_column("provider_settings", "default_access_profile_id")
    op.drop_column("provider_settings", "registration_mode")
    op.drop_table("access_profiles")
