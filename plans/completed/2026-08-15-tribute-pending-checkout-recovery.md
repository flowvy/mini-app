# Recoverable Tribute checkout and shared subscription benefits

Status: complete
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Make a Tribute redirect attempt understandable and reversible. A user who checks before the signed
webhook arrives must see visible progress and an explicit unchanged result. A user who returns
without paying must be able to cancel only Flowvy's pending redirect intent and choose again.
Administrators must understand that one subscription benefit profile applies to every period while
Tribute supplies the actual paid expiration.

## Current state

- `POST /api/me/sponsor/checkouts` creates a local expiring intent; it does not create or cancel a
  payment in Tribute.
- Home can refresh sponsor/subscription queries, but its pending-state control has no loading or
  unchanged-result feedback.
- There is no user endpoint to abandon an unconfirmed local checkout, so an unpaid redirect blocks a
  second choice until automatic expiry.
- Subscription rules match one Tribute subscription item and use `provider_expiry`; their selected
  access profile supplies traffic, devices, status, tag and squads, while the profile's configured
  validity is ignored. The current copy does not make the one-profile-for-all-periods decision clear
  enough.
- The worktree contains completed Tribute and unrelated device-detail changes that must be preserved.

## Scope

In scope: an authenticated/idempotent abandon-checkout API, repository/service behavior, frontend
mutation and cache updates, pending-card checking/cancel feedback, subscription-rule benefit-profile
copy, deterministic backend/frontend/UI coverage, and durable documentation.

Out of scope: cancelling a real Tribute payment/subscription, polling Tribute, guessing webhook
arrival, changing signed webhook matching, or assigning different benefits to periods of one
provider subscription.

## Acceptance

- `Check payment status` visibly enters a checking state, cannot be double-triggered, and reports
  that no confirmation has arrived when server state remains pending.
- A user can choose `Choose another option`, confirm the local-only consequence, and immediately
  return to the published offer list. A late valid webhook remains safely processable and is not
  represented as provider cancellation.
- Cancel is authorized from the current Telegram identity, affects only that user's still-pending
  checkout, and is idempotent or returns a deliberate safe conflict for terminal states.
- Subscription rule editor says one benefits profile covers every listed period; Tribute controls
  expiry. It clearly directs operators to separate Tribute subscriptions only when benefits differ.
- Mobile light/dark, 320px, iOS WebKit and desktop states pass accessibility, overflow, focus,
  console/network and deterministic contract gates.

## Approach

1. Trace checkout route/service/repository/model/schema plus Home types/hooks/components and current
   tests; choose a terminal local status that does not collide with provider payment truth.
2. Add the narrow authenticated abandon operation and concurrency/idempotency tests without provider
   I/O or schema migration if the existing checkout status contract supports it.
3. Add TanStack mutation/cache invalidation, explicit check feedback, a native confirmation dialog,
   and truthful subscription-benefits copy using existing primitives.
4. Verify focused backend and four-project UI states, then run fresh frontend and repository gates.
5. Update architecture/integration/project-state documentation and complete this plan.

## Progress

- [x] 2026-08-15 15:05 +03:00 — Read repository, backend, frontend, integration and UI verification
  instructions; recorded the reported pending/check/profile gaps without mutating provider state.
- [x] 2026-08-15 15:06 +03:00 — Traced the local checkout cancellation contract and selected the
  existing `expired` terminal state so no migration or provider claim was introduced.
- [x] 2026-08-15 15:09 +03:00 — Implemented owned/idempotent abandon, explicit pending feedback,
  offer recovery, shared-profile copy and deterministic success/failure/late-webhook tests.
- [x] 2026-08-15 15:14 +03:00 — Completed full backend, frontend, four-project Tribute, visual,
  accessibility, overflow and documentation gates.

## Surprises & Discoveries

- The administrator's period-specific profile names obscure the existing contract: provider-expiry
  rules do not use profile validity at all.
- Existing checkout matching already accepts `expired`, which makes local abandon and late signed
  webhook delivery race-safe without expanding the database status contract.

## Decision Log

- 2026-08-15 — Treat leaving Tribute without payment as cancellation of a Flowvy redirect intent,
  never as cancellation of a Tribute payment. The UI and API naming must preserve that distinction.
- 2026-08-15 — Keep one benefits profile per provider subscription. Tribute periods change only the
  signed absolute expiry; different benefits require separate provider subscriptions and rules.

## Verification

- Backend Ruff format/lint and full `uv run pytest -q`: 487 passed. Focused PostgreSQL checkout
  repository: 13 passed; sponsor service: 21 passed.
- Frontend lint, typecheck, 44 unit tests and production build passed.
- Full `tribute.spec.ts` across 430x932 Chromium, 320x568 Chromium, iOS WebKit and desktop: 163
  passed, one documented desktop-only keyboard case skipped.
- Pending unchanged/cancel/success/failure and subscription editor copy passed all four projects.
  Eight 320/430 pending card/dialog screenshots were inspected in light/dark; Axe, overflow,
  console and unexpected-network guards passed.
- `scripts\verify.ps1 -Scope Changed -SkipE2E`: 386 service-free backend tests, frontend gates and
  repository documentation links passed after the full UI run.

## Recovery and rollback

Automated tests use mocked providers and disposable test data. The new action may only update a
pending local checkout owned by the caller; it never calls Tribute or Remnawave. Rollback removes the
route/mutation/UI while leaving any already-expired or abandoned local attempts harmless.

## Outcomes & Retrospective

The pending flow now acknowledges every user action, gives a recoverable exit when no payment was
made, and preserves late authenticated payment evidence. The administrator sees the actual
one-profile/all-periods contract instead of being encouraged to create period-specific profiles.
No Tribute or Remnawave request, schema migration, or new payment-state guess was added.
