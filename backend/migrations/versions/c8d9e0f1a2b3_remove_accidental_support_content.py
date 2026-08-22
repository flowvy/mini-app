"""Remove the accidentally reintroduced Support destination.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The draft a6 migration briefly reintroduced this historical column and was applied to the
    # local development database before review. Fresh databases never create it; upgraded draft
    # databases still converge to the same head schema.
    op.execute("ALTER TABLE provider_settings DROP COLUMN IF EXISTS support_url")


def downgrade() -> None:
    # The corrected b7 schema has no Support destination, so its compatible downgrade is a no-op.
    pass
