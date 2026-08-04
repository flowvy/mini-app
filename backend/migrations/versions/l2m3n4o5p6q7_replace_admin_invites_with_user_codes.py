"""Replace one-time admin invites with reusable user-owned codes.

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
"""

from __future__ import annotations

import datetime
import hashlib

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "l2m3n4o5p6q7"
down_revision: str | None = "k1l2m3n4o5p6"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Give every user one code and record the direct inviter on registration."""
    op.add_column("users", sa.Column("invited_by_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_users_invited_by_id_users",
        "users",
        "users",
        ["invited_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_invited_by_id", "users", ["invited_by_id"], unique=False)

    # The previous format was an unreleased admin-issued credential. It cannot be
    # converted into a reusable owner code without changing its authority, so it
    # is deliberately invalidated before the table is narrowed to one row/user.
    op.execute("DELETE FROM invites")
    op.drop_constraint("fk_invites_revoked_by_id_users", "invites", type_="foreignkey")
    op.drop_constraint("fk_invites_access_profile_id", "invites", type_="foreignkey")
    op.drop_constraint("invites_used_by_id_fkey", "invites", type_="foreignkey")
    op.drop_constraint("invites_created_by_id_fkey", "invites", type_="foreignkey")
    op.drop_index("ix_invites_code_digest", table_name="invites")
    op.add_column("invites", sa.Column("code", sa.String(length=32), nullable=True))
    for column in (
        "revoked_by_id",
        "revoked_at",
        "access_profile_snapshot",
        "access_profile_id",
        "note",
        "code_hint",
        "code_digest",
        "expires_at",
        "used_at",
        "used_by_id",
    ):
        op.drop_column("invites", column)
    op.alter_column("invites", "created_by_id", existing_type=sa.BigInteger(), nullable=False)
    op.create_foreign_key(
        "fk_invites_created_by_id_users",
        "invites",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint("uq_invites_created_by_id", "invites", ["created_by_id"])

    op.execute(
        """
        INSERT INTO invites (id, code, created_by_id, is_active, created_at)
        SELECT
            gen_random_uuid(),
            'FVY' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
            id,
            true,
            now()
        FROM users
        """,
    )
    op.alter_column("invites", "code", existing_type=sa.String(length=32), nullable=False)
    op.create_index("ix_invites_code", "invites", ["code"], unique=True)


def downgrade() -> None:
    """Restore the previous one-time shape with non-redeemable legacy rows."""
    op.drop_index("ix_invites_code", table_name="invites")
    op.drop_constraint("uq_invites_created_by_id", "invites", type_="unique")
    op.drop_constraint("fk_invites_created_by_id_users", "invites", type_="foreignkey")
    op.alter_column("invites", "created_by_id", existing_type=sa.BigInteger(), nullable=True)

    op.add_column("invites", sa.Column("used_by_id", sa.BigInteger(), nullable=True))
    op.add_column("invites", sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("invites", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
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
    op.add_column("invites", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("invites", sa.Column("revoked_by_id", sa.BigInteger(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, code FROM invites")).mappings().all()
    expires_at = datetime.datetime.now(datetime.UTC) - datetime.timedelta(seconds=1)
    for row in rows:
        digest = hashlib.sha256(row["code"].encode("utf-8")).digest()
        hint = f"{row['code'][:4]}…{row['code'][-4:]}"
        bind.execute(
            sa.text(
                "UPDATE invites SET code_digest=:digest, code_hint=:hint, "
                "expires_at=:expires_at, is_active=false WHERE id=:id",
            ),
            {"digest": digest, "hint": hint, "expires_at": expires_at, "id": row["id"]},
        )

    op.alter_column("invites", "code_digest", nullable=False)
    op.alter_column("invites", "code_hint", nullable=False)
    op.alter_column("invites", "expires_at", nullable=False)
    op.create_index("ix_invites_code_digest", "invites", ["code_digest"], unique=True)
    op.create_foreign_key(
        "invites_created_by_id_fkey",
        "invites",
        "users",
        ["created_by_id"],
        ["id"],
    )
    op.create_foreign_key(
        "invites_used_by_id_fkey",
        "invites",
        "users",
        ["used_by_id"],
        ["id"],
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
    op.drop_column("invites", "code")

    op.drop_index("ix_users_invited_by_id", table_name="users")
    op.drop_constraint("fk_users_invited_by_id_users", "users", type_="foreignkey")
    op.drop_column("users", "invited_by_id")
