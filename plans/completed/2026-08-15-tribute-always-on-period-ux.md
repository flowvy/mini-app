# Always-on Tribute delivery and truthful period selection

Status: complete
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Make automatic Tribute access delivery a normal application capability rather than an operator
rollout mode, remove internal delivery diagnostics from the admin configuration page, and let a
subscriber understand every available period before leaving Flowvy without claiming that Tribute
can preselect a period unless its official contract supports that behavior.

## Starting state

- Two server environment switches gated entitlement execution and identified-donation planning.
- The admin Tribute page exposed those gates in a `Webhook delivery` diagnostics panel and prevented
  draft offers from being published while delivery is disabled.
- One provider subscription catalog item can contain several periods. Its sponsor-offer snapshot
  already preserves all normalized prices and periods, while checkout redirects use one provider
  URL for the subscription.
- The clean development database currently contains three enabled subscription rules and three
  draft offers made from one provider subscription link; the source tree also contains unrelated
  in-progress device-detail edits that must be preserved.

## Scope

In scope: removing both Tribute rollout flags end to end; always running the durable entitlement
executor; retaining review-only handling for anonymous or unsafe payments; removing the admin
delivery panel; researching the official Tribute period-link contract; improving the subscription
offer model and Home presentation according to that evidence; deterministic backend/frontend/UI
tests and current integration documentation.

Out of scope: live payments, real provider mutations, deleting the administrator's existing draft
configuration, or inventing undocumented Tribute URL parameters.

## Acceptance

- Published-ready donation and subscription offers do not depend on hidden environment switches.
- Signed, safely matched payments continue through the durable executor; anonymous and ambiguous
  payments still stop for review.
- The admin Tribute page contains no `Webhook delivery` panel or rollout-status language.
- A Home subscription offer shows all available provider periods and their prices before redirect.
- Period preselection is implemented only if an official Tribute source documents it; otherwise the
  UI explicitly and compactly says that the period is selected in Tribute.
- Duplicate configuration for a single multi-period provider subscription is prevented or clearly
  consolidated without destructively changing current development data.
- Relevant backend, frontend, contract, Playwright, docs, and change-aware verification pass fresh.

## Approach

1. Trace configuration, DI/worker startup, planner, publication readiness, API schemas, frontend
   types, admin panels, Home offer rendering, checkout creation, and current tests.
2. Establish the period/deep-link contract from Tribute's official MCP/wiki/OpenAPI and record the
   exact evidence and access date.
3. Remove rollout gates while preserving webhook authentication, idempotency, review paths, and the
   durable operation ledger.
4. Make one provider subscription the user-facing commercial choice containing all official
   periods, and present those periods truthfully before the provider redirect.
5. Update deterministic fixtures/tests and integration/state documentation, then verify the UI and
   the full changed surface.

## Progress

- [x] 2026-08-15 — Re-read repository, integration, UI, and verification instructions; captured the
  clean-development diagnosis and unrelated working-tree changes.
- [x] 2026-08-15 — Traced every gate and multi-period offer path. Official Creator API `1.0.0`
  exposes `periods[]`, while official publishing docs expose one subscription link and no documented
  public `periodId` preselection.
- [x] 2026-08-15 — Removed both runtime gates and the admin delivery panel, made the worker always-on,
  retained review for unsafe payments, enforced one rule/one published offer per subscription, and
  rendered every provider period/price before redirect.
- [x] 2026-08-15 — Completed functional, visual, contract, documentation, and change-aware
  verification. The final Tribute matrix passed 151/152 with the one documented desktop-only
  keyboard case skipped; focused sponsor-card evidence passed 4/4 and was inspected in both themes.

## Surprises & Discoveries

- The disabled offer toggles were not caused by the three-period catalog shape. All linked rules and
  profiles were active; publication was blocked solely by the removed rollout switch.
- The first browser attempt was blocked by Windows `spawn EPERM`; after the execution permission
  changed, the same focused Playwright run started normally and passed 3/3 after correcting one
  ambiguous test locator.

## Decision Log

- 2026-08-15 — Do not add guessed `startapp` query fragments or period IDs to provider URLs. Provider
  preselection requires an explicit official contract.
- 2026-08-15 — One provider subscription is one commercial offer containing all official periods.
  Rule toggle controls future automation; offer toggle controls only public visibility.

## Verification

- `E:\mini-app\backend`: Ruff passed; full suite passed 483/483; pinned provider contracts passed
  56/56.
- `E:\mini-app\frontend`: lint, typecheck, 43/43 unit tests, and production build passed.
- `E:\mini-app\frontend`: complete Tribute Playwright matrix passed 151 tests with one documented
  desktop-only keyboard test skipped; the focused sponsor-card evidence passed 4/4.
- `E:\mini-app`: `scripts\verify.ps1 -Scope Changed -SkipE2E` and Markdown-link verification passed;
  E2E was executed separately across all configured browser projects.
- UI: Home sponsor cards at 320x568 and 430x932 were inspected manually in light and dark themes;
  all three provider periods remained legible without clipping or horizontal overflow.

## Recovery and rollback

All automated tests use mocked provider boundaries or the disposable test database. Existing dev
offers remain untouched. Code rollback restores the former rollout model and copy; no production or
development payment/provider mutation is part of this work.

## Outcomes & Retrospective

Automatic payment-to-access processing is now governed by the administrator's rule toggle instead
of hidden deployment flags, while offer toggles govern only Home visibility. The admin-only delivery
diagnostic was removed. A Tribute subscription is represented by one rule and one public offer whose
immutable snapshot contains every official period and price. Home shows those choices before leaving
Flowvy and truthfully tells the user to make the final period choice in Tribute because the official
Creator API and publishing documentation do not define a period-preselection URL contract.

No existing development offers, rules, payments, or provider records were changed. Older duplicate
configuration can therefore be cleaned up explicitly by the administrator after choosing which one
rule and offer to retain.
