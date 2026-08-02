# Backend instructions

Applies to `backend/`. Also follow the repository root instructions and the more specific
instructions under `tests/` or `migrations/`.

## Current shape

- Python 3.12, FastAPI, aiogram, Dishka, async SQLAlchemy, asyncpg, Redis, httpx, and Pydantic.
- `src/flowvy/api/routes/` translates HTTP/auth concerns into service calls.
- `services/` owns orchestration and BFF mapping; `repositories/` owns reusable persistence access;
  `schemas/` is the HTTP/provider boundary; `models/` is the local database model.
- APP-scoped clients/resources and REQUEST-scoped sessions/services are wired by `di*.py`.
- `api/factory.py` owns lifecycle. Importing modules must not open network or database connections.

## Implementation rules

- Keep I/O async. Use the injected `httpx.AsyncClient`, Redis client, and SQLAlchemy async session;
  do not add sync network/database calls or blocking sleeps.
- Routes validate transport input, authorize, map known service failures to deliberate HTTP status
  codes, and return typed response schemas. Put business orchestration in a service.
- Keep provider response quirks inside provider schemas/clients. Do not leak raw provider payloads
  into frontend contracts unless the contract is explicitly documented and tested.
- Use UTC-aware datetimes at all boundaries. Preserve transactions managed by the Dishka request
  session; do not commit independently inside repositories.
- Add configuration through `Settings` and `.env.example`; choose a fail-closed production default.
  Never log a token, Telegram init data, signature, or raw webhook/user payload.
- When changing a response, update Pydantic schemas, frontend types/hooks, contract tests, and docs
  in the same task. Check camelCase serialization where the frontend consumes it.

## Security-critical behavior

- Telegram `Authorization: tma ...` must have a valid signature, TTL, and user. Missing bot secrets
  must not create an authentication bypass.
- Admin dependencies must query the current local user and reject missing, inactive, or non-admin
  users. Never authorize from a frontend role or request parameter.
- A user/device mutation must resolve the provider UUID from the authenticated Telegram identity;
  never accept another user's provider UUID as authority.
- Debug routers are unauthenticated by design and must return `404` outside explicit local debug.
- Webhook changes need signature, freshness/replay/idempotency tests as applicable. Return generic
  public errors and keep diagnostic details out of logs when they can contain provider data.
- All external calls need a finite timeout and tests for success, not found, malformed data,
  provider error, and timeout. Do not use real integrations in automated tests.

## Verification

Run from `backend/`:

```powershell
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest -x -v
```

Prefer a focused test first, for example `uv run pytest -q tests/test_auth.py`, then run the full
suite. Database tests require the disposable `test` PostgreSQL database defined in
`tests/conftest.py`. A schema/model change also follows `migrations/AGENTS.md`. A route or provider
contract change is incomplete until its HTTP boundary and error mapping are tested.
