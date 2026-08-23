# Semantic surface parity with Flowvy Desktop

Status: completed
Owner: Пятница
Started: 2026-08-23
Updated: 2026-08-23

## Purpose

Every visible Mini App surface must use the same semantic hierarchy as the corresponding
`flowvy_desktop` surface: background, border, outline, shadow, text/icon roles, and parent-child
nesting are treated as one contract instead of independent color values.

## Current state

The owner-approved strict token values are already frozen by ADR 0004. A read-only source audit of
25 routes, 87 current TSX files, and 59 current CSS files found that token values match Desktop but some controls use
the wrong kind of surface. Standalone fields currently share the nested `bg-secondary +
border-tertiary` contract, exact outline/stroke coverage is absent, and a few icon/text roles are
misclassified. Commit `f0bf79c` is the pre-change rollback checkpoint.

## Scope

In scope: all Mini App routes and visible states; shared forms, native select/date shells, individual
user cards, rich-text/Telegram editors, inline action feedback, focus treatment, semantic icon/text
roles, deterministic source tests, and mocked UI verification in both themes and all configured
viewports.

Out of scope: backend/API behavior, schema changes, replacing native mobile pickers with custom
dropdown behavior, changing Header glass geometry, and changing previously accepted contrast debt.

## Acceptance

- Standalone controls use the Desktop input/CustomSelect surface; nested controls retain the Desktop
  contained-control surface.
- Users remain separate cards and use one coherent Desktop card hierarchy.
- Rich-text editors use the Desktop ConfigEditor surface hierarchy without changing editing behavior.
- Inline action feedback uses the Desktop inline notice-card hierarchy.
- Every affected surface has deterministic checks for background, borders, outline/shadow, and
  text/icon roles, including relevant nesting and states.
- Fresh lint, typecheck, unit, build, mocked Playwright, overflow, console/network, and Axe checks
  satisfy the repository Definition of Done and ADR 0004 exception exactly.

## Approach

1. Preserve the current baseline in a checkpoint commit.
2. Split standalone and contained shared-control contracts without changing native picker behavior.
3. Apply the accepted user-card, editor, feedback, focus, and role decisions in non-overlapping files.
4. Expand source/runtime assertions for every affected owner and previously missing distinct state.
5. Run changed verification while iterating, then the full frontend/UI matrix and review the final diff.
6. Update durable documentation and move this plan to `plans/completed/` only after fresh evidence.

## Progress

- [x] 2026-08-23 07:34 +03:00 — created pre-change checkpoint commit `f0bf79c`; worktree was clean afterward.
- [x] 2026-08-23 07:35 +03:00 — recorded owner choices: individual user cards, native picker behavior,
  ConfigEditor hierarchy, and inline notice-card feedback.
- [x] 2026-08-23 — implemented the semantic surface split and targeted role corrections.
- [x] 2026-08-23 — extended deterministic source/runtime coverage for all affected states.
- [x] 2026-08-23 — completed focused verification, full four-project UI verification, manual visual
  review, and durable documentation; independent final review was requested from separate agents.
- [x] 2026-08-23 — resolved independent-review findings for select chevrons, WebKit/touch focus,
  active editor toolbar hover, editor caret, platform icon expectations, and full surface assertions.
- [x] 2026-08-23 — rebuilt and restarted the standard Telegram-enabled dev environment; verified all
  local/public endpoints, healthy services, external debug denial, and Telegram polling readiness.

## Surprises & Discoveries

- Desktop has two deliberate control contracts: standalone controls use `bg-primary` with a muted
  secondary border; controls nested in an already framed row use `bg-secondary + border-tertiary`.
  A global value replacement would therefore remain semantically wrong.
- Existing exact CSS assertions cover representative backgrounds, borders, shadows, and text, but
  no exact `outline`, `outline-color`, or SVG `stroke` assertions.
- The expanded 680-case full matrix has 47 red cases instead of the previous 39. All are Axe
  `color-contrast`; seven additional cases expose existing ledgered pairs through broader coverage.
  The new shared owner is the positive settings status pill with five visible nodes using the direct
  Desktop StatusBadge pair `#3AB176/#F1FAF5`. Independent artifact review also found three legacy
  nodes missing from the table (`1 / 5`, `All systems operational`, `v2.7.4`); ADR 0004 now records
  all of them explicitly.

## Decision Log

- 2026-08-23 — keep separate user cards (choice 1B) rather than converting the list to DataTable rows.
- 2026-08-23 — keep native select/date opening behavior and apply Desktop styling only to the closed
  shell (choice 2A).
- 2026-08-23 — use ConfigEditor/YamlEditor hierarchy for rich-text editor surfaces (choice 3A).
- 2026-08-23 — use inline notice cards with secondary semantic borders for persistent action feedback
  (choice 4A).
- 2026-08-23 — preserve floating Header/TabBar as the accepted shared Mini-only glass exception;
  this owner correction supersedes the intermediate Header-only rule.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app`: `./scripts/verify.ps1 -Scope Changed` must pass every
  applicable non-contrast gate.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build` must pass freshly.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: mocked Playwright must cover light/dark at
  430x932 Chromium, 320x568 Chromium, iPhone 13 WebKit, and 1280x900 Chromium, with no unexpected
  console, network, overflow, or Axe finding outside the exact ADR 0004 ledger.
- Runtime assertions must inspect parent and nested background, all relevant border sides, outline,
  box-shadow, text color, and SVG color/fill/stroke.

## Recovery and rollback

The pre-change state is commit `f0bf79c`. Do not reset or revert automatically because later user
changes may coexist; inspect the worktree and use an explicit revert or targeted inverse patch only
with owner approval. Tests use mocked/disposable state and must not contact Telegram or providers.

## Outcomes & Retrospective

The Mini App now distinguishes standalone and contained surfaces instead of applying one border and
background recipe globally. User cards, editors, feedback, focus and icon roles follow their chosen
Desktop references, with Header and native picker behavior preserved. Exact runtime assertions cover
the entire surface tuple and SVG roles across both themes and all four projects; missing Home,
Tribute, dashboard, Users, Activity and Devices states are explicit fixtures rather than inferred
coverage.

Fresh evidence: lint, typecheck, 88 unit tests and production build passed; focused runtime suites
passed 40/40, 12/12 and 12/12; visual evidence passed 76/76 plus a corrected Content 4/4 rerun; the
full matrix produced 633/680 with no functional, console, network or overflow failure. Its 47
failures are intentionally unsuppressed Axe contrast findings documented in ADR 0004, so the
accessibility gate remains red under the owner-selected strict Desktop palette.

The rebuilt standard dev environment is available at `http://127.0.0.1:5173` and
`https://dev-app.flowvy.io`. Backend health/readiness, the production preview, and public
health/readiness returned `200`; the public debug route returned `404`; PostgreSQL and Redis are
healthy and `telegram_main_app_ready` is present without fresh error markers.

Owner follow-up corrected the intermediate Header-only glass rule: TabBar again shares the Header
faux-glass background, border and shadow tokens while keeping blur disabled. Focused computed-style,
contrast and visual checks cover both themes and all four configured projects; documentation and the
glass-owner source guard now name exactly these two floating chrome surfaces.

A later UI consolidation moved Support and Broadcast onto one shared `ComingSoon` surface, replacing
their two old page-specific CSS owners. The current source inventory therefore contains 59 CSS and 87 TSX files;
both routes keep product-owned localized copy, distinct icons and identical neutral hierarchy.
