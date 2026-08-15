# Atomic commerce-rule deletion with linked offers

Status: completed
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Make the existing Delete rule action complete and understandable. An administrator can delete an
automation rule even when it owns sponsor-offer cards; Flowvy removes those future payment choices
in the same database transaction and explains the consequence before confirmation.

## Current state

- `CommerceRuleService.delete_rule` rejects a rule whenever `SponsorOfferRepository.get_by_rule_id`
  finds a linked offer.
- The route returns that deliberate validation failure, but the frontend maps it to a generic
  `Could not delete` message, so the administrator cannot recover from the editor.
- `sponsor_offers.commerce_rule_id` uses `ON DELETE RESTRICT`; `sponsor_checkouts.offer_id` uses
  `ON DELETE SET NULL`; entitlement operations keep immutable rule/profile snapshots and set their
  live rule reference to null on rule deletion.
- One donation rule may own several offers, so deleting only the first linked offer is insufficient.

## Scope

In scope: repository bulk deletion by rule, atomic service orchestration, authenticated route
contract coverage, TanStack invalidation, truthful confirmation copy, deterministic mobile/admin UI
tests, and durable documentation.

Out of scope: deleting payment/activity history, revoking existing access, cancelling Tribute
payments, deleting access profiles, or changing provider/webhook behavior.

## Acceptance

- Deleting a rule removes every linked sponsor offer and then the rule in one request transaction.
- Existing payment history, snapshots and granted access remain; no Tribute or Remnawave call occurs.
- The confirmation dialog states that linked Home payment choices are also removed and that pending
  payments will no longer be matched automatically.
- Success closes the editor and refreshes rules, sponsor offers and Home sponsor state; failure keeps
  the rule and offers visible with a generic safe error.
- Backend PostgreSQL and authenticated HTTP tests plus four-project Playwright deletion states pass.

## Approach

1. Replace the dependency rejection with a repository operation that deletes all offers for the
   target rule before deleting the rule, inside the existing request-scoped transaction.
2. Invalidate every affected frontend query and update the confirmation language without exposing
   backend diagnostics.
3. Cover multiple linked offers, unauthorized/admin HTTP deletion, success/failure UI, focus,
   light/dark and mobile overflow; then update architecture, testing and project state.

## Progress

- [x] 2026-08-15 15:34 +03:00 — Traced the screenshot to the deliberate linked-offer rejection and
  verified all relevant foreign-key deletion semantics.
- [x] 2026-08-15 15:39 +03:00 — Implemented repository bulk deletion, atomic service orchestration,
  frontend invalidation and consequence/error/loading states.
- [x] 2026-08-15 15:46 +03:00 — Passed focused and full database, HTTP, frontend and four-project
  UI checks; inspected the generated light/dark evidence and updated durable documentation.
- [x] 2026-08-15 15:49 +03:00 — Changed-scope repository gate passed; standard Telegram-enabled dev
  restarted with preserved data and healthy local/public boundaries.

## Surprises & Discoveries

- The backend already returned a useful internal reason, but the safe frontend error policy made a
  recoverable dependency look like an unexplained failure.
- Fresh Axe evidence exposed insufficient contrast in the shared solid danger button. Existing
  theme-adaptive negative/inverted tokens provide WCAG AA contrast without a one-off color.

## Decision Log

- 2026-08-15 — Delete linked sponsor offers atomically with their rule. They are presentation
  children that cannot work without the rule; forcing a second editor workflow adds no safety.
- 2026-08-15 — Preserve checkouts/history through existing nullable references and immutable
  snapshots. Rule deletion intentionally stops future matching, including still-pending payments.

## Verification

- `E:\mini-app\backend`: Ruff, focused commerce PostgreSQL/HTTP tests, then full pytest.
- `E:\mini-app\frontend`: lint, typecheck, unit, build and focused `tribute.spec.ts` across all four
  projects.
- UI: delete dialog consequence, cancel/focus, success and failure at 320x568, 430x932, iOS WebKit
  and desktop; inspect light/dark evidence and overflow/Axe/console/network guards.
- `E:\mini-app`: `scripts\verify.ps1 -Scope Changed -SkipE2E` after the full focused UI matrix.

Completed so far:

- `uv run ruff check ...`; focused PostgreSQL/HTTP `3 passed`.
- `uv run pytest -q`: `489 passed`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test -- --run` (`44 passed`), `pnpm build`.
- Focused deletion success/failure: `8 passed` across all four projects.
- Focused light/dark consequence evidence: `4 passed`; screenshots inspected at small mobile,
  mobile, iOS WebKit and desktop sizes.
- Full `tribute.spec.ts`: `171 passed`, `1` expected desktop-only keyboard skip.
- `scripts\verify.ps1 -Scope Changed -SkipE2E`: Ruff, `386` service-free backend tests, frontend
  lint/typecheck/`44` unit/build and Markdown-link checks passed.
- Standard dev restart preserved Docker volumes; local/public frontend, health and ready returned
  `200`, public debug returned `404`, and fresh logs contained no startup error markers.

## Recovery and rollback

Automated tests use disposable PostgreSQL data and mocked browser APIs. Runtime deletion is one
request-scoped database transaction: an exception rolls back offers and rule together. Rollback of
the code restores the dependency rejection; deleted configuration itself is intentionally not
recoverable from the UI and must be recreated from operator-owned configuration if needed.

## Outcomes & Retrospective

The unexplained deletion failure is removed at its ownership boundary instead of exposed as a
dependency-management chore. The rule remains the lifecycle owner of its presentation offers, while
durable payment/access evidence is preserved. The confirmation now communicates the irreversible
future-matching consequence, and its shared danger action meets WCAG AA in both themes. No schema or
provider contract changed and no real external request was made.
