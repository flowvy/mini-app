---
name: flowvy-verify
description: Verify Flowvy changes before claiming completion by selecting checks from the diff and running fresh backend, migration, frontend, contract, and UI gates as applicable.
---

# Verify Flowvy changes

Never infer success from an earlier run or from code inspection alone.

## Preflight

1. Read `git status --short` and `git diff --stat`; include staged, unstaged, and relevant untracked files.
2. Preserve unrelated user changes.
3. Classify the change: docs, backend, auth/config/shared backend, migration/model, frontend logic, UI/CSS/router, API schema, integration contract, or repository tooling.

## Change-aware gate

- Docs only: check links, paths, commands, route names, environment keys, and last-verified metadata against the repository.
- Backend: Ruff format check, Ruff lint, and targeted pytest.
- Auth, config, middleware, DI, shared services, or webhook: full backend tests with PostgreSQL and Redis.
- Migration/model: disposable database, `upgrade head`, one head, `alembic check`, and the migration verification script. Never downgrade a non-disposable database.
- Frontend logic: Biome, TypeScript, targeted Vitest, and production build.
- UI, CSS, routes, Telegram adapter, or client state: frontend gate plus Playwright mock smoke at the relevant mobile viewport; inspect artifacts.
- API shape: backend and frontend gates plus fixture/contract consistency.
- Telegram, Remnawave, Kuma, or Beszel: relevant contract tests and `flowvy-integration` evidence.

Use `scripts/verify.ps1 -Scope Changed` while iterating and `scripts/verify.ps1 -Scope Full` before a final handoff when the environment supports it.

## Completion report

Report each command and fresh result. If a check cannot run, say exactly why and what remains unverified. Do not say "done", "fixed", or "all tests pass" when a required gate is skipped, stale, or failing.
