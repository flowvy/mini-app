# Alembic migration instructions

Follow `backend/AGENTS.md`. Migrations are production data transformations, even while the project
is an MVP.

- Keep one linear revision chain unless a deliberate branch/merge is documented. Never edit an
  already-deployed revision to represent a new schema change; add a revision.
- Review the ORM model and every prior migration touching the same table before writing upgrade and
  downgrade paths. Preserve data deliberately; do not use drop/recreate shortcuts for convenience.
- Use stable, explicit constraint and index names. Make backfills deterministic and bounded, and
  separate nullable/backfill/not-null steps when existing rows require it.
- Test both a fresh upgrade from zero to head and an upgrade from the previous head. Exercise
  downgrade when it is genuinely safe; otherwise document why recovery is forward-only.
- Compare the final database schema with SQLAlchemy metadata. Application tests using
  `Base.metadata.create_all()` are not migration coverage.
- `migrations/env.py` resolves the URL through the migration-only `MigrationSettings`, so process environment,
  `backend/.env`, and application defaults follow the same precedence. Still confirm the exact target
  before every migration command and never run against an inferred or production-like database.

From `backend/`, inspect with `uv run alembic current`, `uv run alembic heads`, and
`uv run alembic history`; apply with `uv run alembic upgrade head` only after the target is verified.
Use `scripts/verify-migrations.ps1` from the root for a disposable zero-to-head, downgrade-to-base,
re-upgrade, one-head, and model-drift check.
