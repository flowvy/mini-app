"""Add durable Support requests, messages and attachment intents.

Revision ID: i4d5e6f7g8h9
Revises: h3c4d5e6f7g8
Create Date: 2026-08-24
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "i4d5e6f7g8h9"
down_revision: str | Sequence[str] | None = "h3c4d5e6f7g8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "support_requests",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("number", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("topic", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="needs_reply", nullable=False),
        sa.Column(
            "context",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "topic IN ('connection', 'subscription', 'devices', 'payment', 'other')",
            name="ck_support_requests_topic",
        ),
        sa.CheckConstraint(
            "status IN ('needs_reply', 'waiting_user', 'resolved')",
            name="ck_support_requests_status",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_support_requests_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_requests"),
        sa.UniqueConstraint("number", name="uq_support_requests_number"),
    )
    op.create_index(
        "ix_support_requests_status_activity",
        "support_requests",
        ["status", "last_activity_at"],
    )
    op.create_index(
        "ix_support_requests_user_activity",
        "support_requests",
        ["user_id", "last_activity_at"],
    )
    op.create_index(
        "ix_support_requests_last_activity_at", "support_requests", ["last_activity_at"]
    )
    op.create_index("ix_support_requests_expires_at", "support_requests", ["expires_at"])

    op.create_table(
        "support_messages",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.BigInteger(), nullable=True),
        sa.Column("author_role", sa.String(length=16), nullable=False),
        sa.Column("author_name", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "author_role IN ('user', 'support')",
            name="ck_support_messages_author_role",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name="fk_support_messages_author_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["support_requests.id"],
            name="fk_support_messages_request_id_support_requests",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_messages"),
    )
    op.create_index(
        "ix_support_messages_request_created",
        "support_messages",
        ["request_id", "created_at"],
    )

    op.create_table(
        "support_attachments",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("owner_id", sa.BigInteger(), nullable=False),
        sa.Column("message_id", sa.UUID(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=44), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("password_protected", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("upload_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delete_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('image', 'video', 'text', 'zip')",
            name="ck_support_attachments_kind",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'attached', 'deleted')",
            name="ck_support_attachments_status",
        ),
        sa.CheckConstraint("size_bytes > 0", name="ck_support_attachments_size"),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["support_messages.id"],
            name="fk_support_attachments_message_id_support_messages",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_support_attachments_owner_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_support_attachments"),
        sa.UniqueConstraint("object_key", name="uq_support_attachments_object_key"),
    )
    op.create_index(
        "ix_support_attachments_cleanup",
        "support_attachments",
        ["status", "delete_after", "upload_expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_support_attachments_cleanup", table_name="support_attachments")
    op.drop_table("support_attachments")
    op.drop_index("ix_support_messages_request_created", table_name="support_messages")
    op.drop_table("support_messages")
    op.drop_index("ix_support_requests_expires_at", table_name="support_requests")
    op.drop_index("ix_support_requests_last_activity_at", table_name="support_requests")
    op.drop_index("ix_support_requests_user_activity", table_name="support_requests")
    op.drop_index("ix_support_requests_status_activity", table_name="support_requests")
    op.drop_table("support_requests")
