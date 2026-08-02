# Backend test instructions

Tests use pytest/pytest-asyncio. Follow `backend/AGENTS.md`.

- Use PostgreSQL, not SQLite, for database behavior. The shared fixtures connect to
  `postgresql+asyncpg://test:test@localhost:5432/test` and currently create/drop ORM tables around
  each test. Keep tests isolated and independent of ordering.
- Never point a fixture at the development or production database. Do not remove volumes or data to
  make a test pass.
- Mock Telegram, Remnawave, Kuma, Beszel, Redis behavior, time, and network failures at clear
  boundaries.
  No test may require a live external account or secret.
- Prefer behavior assertions over implementation details. Cover success, absence, permission
  failure, malformed input, upstream error, and timeout for changed boundaries.
- Authentication tests must construct signed, time-controlled init data and cover missing/invalid/
  expired credentials. Admin tests must cover non-admin and inactive users.
- `Base.metadata.create_all()` does not validate Alembic. Migration tests belong to the migration
  workflow and must upgrade a fresh database from zero to head.
- A regression fix starts with a test that fails for the observed behavior when practical.

Run a focused file first, then `uv run pytest -x -v` from `backend/`. If PostgreSQL is unavailable,
run only explicitly database-free files and report the omitted tests; do not call the suite green.
