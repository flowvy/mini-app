# Automation-managed access-profile validity

Status: completed
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Let administrators create a reusable benefits profile without entering a misleading duration or
date when a commerce automation supplies the actual expiry. Keep registration fail-closed because a
new account still needs an explicit duration, date or no-expiry policy.

## Current state

- `access_profiles.validity_mode` accepts only `duration`, `fixed` and `lifetime`; the database and
  Pydantic contract require the corresponding fields.
- Tribute donation rules calculate a target expiry and subscriptions use signed `expires_at`;
  entitlement execution applies that target while reusing only the profile's limits and provider
  options.
- The same profiles may also be selected as the global registration default, where validity is not
  optional. The current UI does not distinguish these two uses.

## Scope

In scope: provider-neutral `automation` validity mode, reversible Alembic constraint migration,
registration/default-profile guards, admin editor/list/default-selector UX, API/frontend types,
deterministic backend and browser tests, and durable documentation.

Out of scope: changing Tribute duration calculations, changing an existing profile automatically,
provider calls, or changing already granted access.

## Acceptance

- An administrator can save an access profile with `validityMode=automation` and no days/date.
- The UI calls it `Set by automation`, explains that payment/rule supplies the expiry, and never
  presents the omitted value as lifetime access.
- An automation-managed profile cannot become the registration default; changing the current
  default to that mode is prevented with actionable UI and backend validation.
- Donation/subscription rules can select the profile and entitlement snapshots remain valid.
- Migration, backend, frontend and four-project light/dark UI checks pass without real providers.

## Approach

1. Extend the persisted and public profile contract with one explicit no-local-validity mode.
2. Keep registration-compatible selection and provisioning restricted to the existing three modes.
3. Reuse the current editor primitives, add clear summary/help/conflict states, and cover the API and
   browser contracts before updating documentation.

## Progress

- [x] 2026-08-15 15:54 +03:00 — Traced access profiles through schema, registration provisioning,
  commerce snapshots, entitlement execution, frontend editor/list and deterministic fixtures.
- [x] 2026-08-15 16:04 +03:00 — Implemented migration, API/ORM contracts, runtime insert proof,
  registration guards and commerce/entitlement fixtures.
- [x] 2026-08-15 16:19 +03:00 — Implemented and verified admin UX, durable documentation and
  standard Telegram-enabled dev restart on migration head `z5a6b7c8d9e0`.

## Surprises & Discoveries

- Entitlement execution already ignores profile validity correctly because every grant carries its
  own explicit target expiry; only profile validation and registration reuse force a dummy value.

## Decision Log

- 2026-08-15 — Add provider-neutral `automation` rather than nullable duration/date under an
  existing mode. Explicit state prevents `null` from being mistaken for lifetime or malformed data.
- 2026-08-15 — Exclude automation-managed profiles from registration defaults and reject them at
  the backend boundary. Registration cannot derive a safe expiry without an automation event.

## Verification

- `E:\mini-app\backend`: migration verifier, Ruff, focused registration/commerce/entitlement tests,
  then full pytest.
- `E:\mini-app\frontend`: lint, typecheck, unit/build and focused registration/Tribute Playwright
  across mobile, small mobile, iOS WebKit and desktop.
- UI: light/dark profile editor/list/default selector at 320x568, 430x932 and desktop with Axe,
  overflow, focus, console and network guards.

## Recovery and rollback

Automated tests use disposable databases and mocked APIs. The migration downgrade is safe only when
no profile still uses `automation`; it explicitly fails otherwise instead of rewriting intent. The
runtime change does not mutate existing profiles or call Remnawave/Tribute.

## Outcomes & Retrospective

Access profiles can now represent benefits whose expiry is supplied externally without a dummy date
or duration. Registration remains safe because only its three concrete expiry modes can be selected
as the default. The migration verifier proved the new constraint on an upgraded PostgreSQL schema;
493 backend tests, 56 pinned contracts, 44 frontend unit tests, production build, 107 mobile browser
tests and 12 focused four-project tests passed. New editor screenshots were inspected at 320px,
430px, iOS WebKit and desktop in both themes. Standard dev applied the migration while preserving
existing data; local/public health returned 200 and public debug remained 404.
