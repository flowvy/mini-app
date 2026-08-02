# Flowvy repository instructions

## Scope and precedence

These instructions apply to the whole repository. Before editing a subtree, read its nearest
`AGENTS.md`; the more specific file adds to or overrides this one. Keep durable guidance here,
task-specific reasoning in `plans/active/`, and current facts in `docs/PROJECT_STATE.md`.

## Product and boundaries

Flowvy is a Telegram Mini App and bot for VPN subscription management. The React frontend talks
only to the FastAPI BFF. FastAPI owns Telegram authentication, local PostgreSQL data, Redis-backed
metrics/cache, and calls Remnawave and Uptime Kuma. Treat the project as an unfinished MVP, not a
production-ready service.

Source-of-truth order:

1. Executable code, migrations, lockfiles, and tool configuration.
2. `docs/PROJECT_STATE.md` for the last verified state and known gaps.
3. `docs/ARCHITECTURE.md` for stable boundaries and flows.
4. An active ExecPlan for the task currently being implemented.
5. Other prose documents and API snapshots; verify them before relying on details.

## Start every task

1. Run `git status --short --branch` and preserve changes that predate the task.
2. Read `docs/PROJECT_STATE.md`, the nearest `AGENTS.md`, and any relevant active plan.
3. Trace the affected flow end to end: route, service, repository/client, schema, frontend type,
   query hook, component, and tests. Do not change a contract after reading only one side.
4. For work that spans subsystems, changes data/auth contracts, or cannot be safely completed in
   one short session, create and maintain an ExecPlan according to `PLANS.md`.

## Safety boundaries

- Never read, print, commit, or copy secrets from `.env`, Telegram init data, API tokens, webhook
  bodies, database dumps, or browser storage. Examples must contain obvious placeholders.
- Do not contact a real Telegram bot, Remnawave panel, Kuma instance, or production-like database
  unless the user explicitly authorizes that exact target. Prefer fakes and request mocking.
- Do not execute destructive Git, database, user, device, broadcast, or provider operations merely
  to verify a change. Keep test data disposable and scoped to the test database.
- `DEBUG=true` exposes unauthenticated helper routes. Never present that mode on a public interface.
- Do not hide failing commands, weaken checks, or claim success from an earlier run.

## Working method

- Make the smallest coherent change and preserve existing behavior unless the task changes it.
- Follow existing FastAPI/Dishka/SQLAlchemy and React/TanStack patterns; improve a pattern only with
  evidence and tests.
- Research unstable external contracts from primary documentation and the installed/pinned version.
  Record the source, version, and access date in the relevant document or plan.
- Use read-heavy agents in parallel when useful. Keep overlapping code writes sequential and let one
  owner integrate and verify the final diff.
- Review the final diff for accidental generated files, secrets, debug shortcuts, stale docs, and
  unrelated user changes.

## Commands

From the repository root, prefer the checked-in PowerShell workflows:

```powershell
.\scripts\bootstrap.ps1                 # locked backend/frontend dependencies
.\scripts\bootstrap.ps1 -InstallBrowsers
.\scripts\verify.ps1 -Scope Changed     # diff-aware local gate
.\scripts\verify.ps1 -Scope Full        # services, migrations, contracts, and UI
.\scripts\dev-up.ps1                    # tracked local processes + PostgreSQL/Redis
.\scripts\dev-down.ps1                  # stops only tracked processes; preserves volumes
```

Use the narrowest verification scope while iterating and `Full` for a final handoff when Docker and
browsers are available. Run from the stated directory below when diagnosing a helper or when a direct
command is the clearer fallback.

```powershell
# repository root: development infrastructure
docker compose -f docker-compose.dev.yml up -d postgres redis

# backend/
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest -x -v
uv run alembic upgrade head
uv run python -m flowvy

# frontend/
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm dev
```

The full backend suite requires PostgreSQL at `localhost:5432/test`; the Compose initialization
script creates it only when the PostgreSQL volume is first initialized. Never delete an existing
volume without explicit approval. The checked-in Vitest and mocked Playwright suites are a small
baseline, not complete behavior coverage; see `docs/PROJECT_STATE.md` and expand them with each flow.

## Review invariants

Treat violations as security or correctness findings, not style preferences:

- Authentication and authorization fail closed when secrets, users, roles, or dependencies are
  absent. Admin access must consider current role and active state.
- Debug routes are unavailable unless an explicit local-only debug mode is enabled.
- Device and admin mutations revalidate the caller and target immediately before the side effect.
- Webhooks authenticate the sender and account for freshness, replay, and idempotency.
- External failures have bounded timeouts, safe error messages, and no leaked payloads or tokens.
- Schema changes include a reversible Alembic migration and a fresh-database migration check.
- Frontend API handling covers empty bodies such as `204`, non-2xx responses, loading, empty,
  unauthorized, degraded, and retry states.

## Definition of done

A change is done only when its behavior and failure paths are covered at the cheapest useful level,
all relevant lint/type/build/test commands pass freshly, and the final diff is reviewed. UI changes
also require functional browser interaction at affected routes and viewports, console/network error
checks, and visual inspection in light and dark themes. Update `docs/PROJECT_STATE.md`, architecture,
runbooks, or the active plan when their facts or decisions changed. State anything that could not be
run and why; never silently substitute a weaker check.
