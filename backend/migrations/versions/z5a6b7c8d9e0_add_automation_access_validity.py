"""Add automation-managed access-profile validity.

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
Create Date: 2026-08-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "z5a6b7c8d9e0"
down_revision: str | Sequence[str] | None = "y4z5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VALIDITY_MODE_CHECK = "validity_mode IN ('duration', 'fixed', 'lifetime', 'automation')"
VALIDITY_FIELDS_CHECK = (
    "(validity_mode = 'duration' AND validity_days IS NOT NULL "
    "AND validity_days > 0 AND fixed_expire_at IS NULL) OR "
    "(validity_mode = 'fixed' AND validity_days IS NULL "
    "AND fixed_expire_at IS NOT NULL) OR "
    "(validity_mode IN ('lifetime', 'automation') AND validity_days IS NULL "
    "AND fixed_expire_at IS NULL)"
)

LEGACY_VALIDITY_MODE_CHECK = "validity_mode IN ('duration', 'fixed', 'lifetime')"
LEGACY_VALIDITY_FIELDS_CHECK = (
    "(validity_mode = 'duration' AND validity_days IS NOT NULL "
    "AND validity_days > 0 AND fixed_expire_at IS NULL) OR "
    "(validity_mode = 'fixed' AND validity_days IS NULL "
    "AND fixed_expire_at IS NOT NULL) OR "
    "(validity_mode = 'lifetime' AND validity_days IS NULL "
    "AND fixed_expire_at IS NULL)"
)


def _replace_constraints(*, mode_check: str, fields_check: str) -> None:
    op.drop_constraint(
        "ck_access_profiles_validity_fields",
        "access_profiles",
        type_="check",
    )
    op.drop_constraint(
        "ck_access_profiles_validity_mode",
        "access_profiles",
        type_="check",
    )
    op.create_check_constraint(
        "ck_access_profiles_validity_mode",
        "access_profiles",
        mode_check,
    )
    op.create_check_constraint(
        "ck_access_profiles_validity_fields",
        "access_profiles",
        fields_check,
    )


def upgrade() -> None:
    _replace_constraints(
        mode_check=VALIDITY_MODE_CHECK,
        fields_check=VALIDITY_FIELDS_CHECK,
    )


def downgrade() -> None:
    connection = op.get_bind()
    automation_profiles = connection.exec_driver_sql(
        "SELECT count(*) FROM access_profiles WHERE validity_mode = 'automation'",
    ).scalar_one()
    if automation_profiles:
        raise RuntimeError(
            "Cannot downgrade while automation-managed access profiles exist",
        )
    _replace_constraints(
        mode_check=LEGACY_VALIDITY_MODE_CHECK,
        fields_check=LEGACY_VALIDITY_FIELDS_CHECK,
    )
