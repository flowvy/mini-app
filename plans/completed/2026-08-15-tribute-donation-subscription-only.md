# Tribute donations and subscriptions

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`,
and `Outcomes & Retrospective` current while work continues. Maintain it according to
`PLANS.md`.

## Purpose

Finish the Tribute integration around the two supported Creator flows: donations and subscriptions.
Admins configure rules and public offers; existing active users complete payment in Tribute; only a
matching signed webhook can grant or reconcile sponsor access. Unsupported event families must be
audited and ignored without user, checkout, or provider side effects.

## Current state

- Donation one-time and recurring flows have controlled live evidence.
- A monthly subscription has controlled live initial-payment evidence.
- Sponsor offers, redirect intents, server-computed Home states, durable operations, operator actions,
  base capture, and scheduled restore exist.
- Runtime delivery and identified-donation automation are server-only and default off.
- Tribute support confirmed that recurring-donation cancellation is delivered at paid-period end and
  cannot be queried manually through Creator API.

## Scope

- Restrict backend and frontend commerce contracts to `donation | subscription`.
- Keep the read-only provider catalog limited to subscriptions.
- Preserve historical webhook and entitlement audit while removing abandoned unsupported
  configuration and local checkout intents through a reversible forward migration.
- Record other correctly signed provider events as `ignored` metadata without planner or checkout
  matching.
- Remove unsupported UI controls, copy, fixtures, tests, runbooks, architecture claims, and obsolete
  plans.
- Verify migrations, backend, frontend, deterministic browser states, documentation, and the standard
  Telegram-enabled dev runtime.

No live payment, Tribute mutation, destructive data reset, or production-like provider mutation is
authorized by this plan.

## Acceptance

- API schemas and database constraints accept only donation and subscription configuration.
- Provider client and admin connection check call only the subscriptions endpoint.
- Unsupported signed events return success, persist bounded ignored metadata, and create no checkout
  match, entitlement operation, or Remnawave call.
- Existing audit rows remain queryable after migration.
- Admin rule editor offers Donation and Subscription only; catalog, payment links, offers, activity,
  and Home copy contain no unsupported commerce flow.
- Fresh focused and full verification pass.
- Standard dev restarts without data reset, migrates to one head, and passes local/public
  health/readiness plus public-debug denial.

## Approach

1. Trace and remove unsupported provider schemas, catalog client methods, planner branches, models,
   frontend types, controls, fixtures, and copy.
2. Add a forward Alembic revision that removes abandoned configuration, narrows constraints, preserves
   audit rows, and renames legacy provider-reference columns generically.
3. Update all current architecture, integration, security, testing, operation, state, ADR, and UI
   matrix documentation.
4. Run focused backend/migration/frontend checks, deterministic Tribute Playwright scenarios, then
   the full repository gate.
5. Restart the standard Telegram-enabled dev environment with the two controlled runtime flags,
   preserving data, and verify local/public runtime boundaries.

## Progress

- [x] 2026-08-15 — Traced provider, webhook, planner, sponsor, migration, frontend, fixture, test, and
  documentation dependencies.
- [x] 2026-08-15 — Restricted backend provider/catalog/schemas/rules/checkouts to donation and
  subscription.
- [x] 2026-08-15 — Changed unsupported signed events to ignored audit-only processing.
- [x] 2026-08-15 — Added forward migration `y4z5a6b7c8d9`; disposable zero-to-head,
  previous-head/data upgrade, downgrade/re-upgrade, one-head, runtime inserts, and drift checks pass.
- [x] 2026-08-15 — Focused backend suite passes: 136 tests plus Ruff.
- [x] 2026-08-15 — Removed unsupported frontend types, controls, catalog fixtures, activity mappings,
  and localized copy.
- [x] 2026-08-15 — Finished documentation cleanup; focused Tribute browser matrix passed 147 with
  one expected desktop-only keyboard skip across four projects, and key light/dark evidence was
  inspected.
- [x] 2026-08-15 — Fresh full repository verification passed.
- [x] 2026-08-15 — Applied migration through standard dev restart and verified runtime without data
  reset.

## Surprises & Discoveries

- Historical audit used a commerce-specific provider reference column even though the durable
  operation model is otherwise provider-neutral. The forward migration preserves values while
  renaming that column to `provider_reference_id`.
- Deployed historical Alembic revisions must remain immutable; obsolete strings may remain only in
  those migration files and the forward removal revision.
- The repository formatter is Biome, not Prettier.

## Decision Log

- 2026-08-15 — Preserve webhook and operation audit rows; delete only unsupported mutable
  configuration and local redirect intents.
- 2026-08-15 — Correctly signed unknown provider events are acknowledged and stored as ignored
  metadata, but do not enter checkout attribution or entitlement planning.
- 2026-08-15 — Keep generic compensation operation support for historical ledger recovery; remove all
  provider-family-specific planning, catalog, UI, and fixtures.
- 2026-08-15 — Do not rewrite deployed migration history. Enforce the new contract with one forward
  reversible revision.

## Verification

Fresh results:

- `scripts/verify-migrations.ps1` — passed all chain/data/drift/runtime-insert checks.
- Focused backend Tribute/commerce/sponsor/entitlement tests — 136 passed.
- Backend Ruff — passed.
- Frontend lint/typecheck, 43 unit tests, and production build — passed.
- Focused Tribute Playwright — 147 passed, one expected skip across mobile, small mobile, iOS WebKit,
  and desktop; key light/dark screenshots inspected.
- `scripts/verify-tribute-entitlements.ps1` — one donation production-boundary fixture passed.
- `scripts/verify.ps1 -Scope Full` — migrations/drift, Ruff, 481 backend, 56 Remnawave contract,
  frontend lint/typecheck/43 unit/build, 97 Playwright, and docs passed.
- Standard dev migrated to `y4z5a6b7c8d9`; local/public health and frontend returned `200`, ready
  returned `200`, public debug returned `404`, and startup error-marker count was zero.
- Dev database has zero unsupported rule/checkout/event-family rows; both generic provider-reference
  columns exist and both legacy column names are absent.

## Recovery and rollback

The migration downgrade restores generic schema shape and legacy column names, but intentionally
cannot recreate abandoned mutable configuration. Historical audit rows and provider references are
preserved across upgrade and downgrade. Runtime flags can be disabled and backend restarted without
editing ledger rows.

## Outcomes & Retrospective

The runtime and UI now expose only donations and subscriptions. Provider catalog access is limited
to subscriptions, unknown signed events are audit-only, mutable unsupported configuration is gone,
historical audit is retained, and the standard dev environment is running on the new migration.
