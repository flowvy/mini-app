"""add device_limit to subscriptions

Revision ID: ecb3341ce3fe
Revises: 861658588bda
Create Date: 2026-04-05 16:12:58.639784
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ecb3341ce3fe"
down_revision: str | None = "861658588bda"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("device_limit", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("subscriptions", "device_limit")
