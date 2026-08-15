# Tribute offer-card redesign

Status: completed
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Restore a clear, attractive sponsor-offer experience after one Tribute subscription became one
Flowvy offer containing several provider periods. Users must be able to compare prices before the
redirect without mistaking Flowvy's read-only period preview for a selection that Tribute cannot
receive. Administrators must see a storefront-like preview rather than a truncated technical row.

## Current state

- The backend and public contract correctly expose every `periods[]` entry through one offer and one
  checkout URL; Tribute does not document a public period-preselection parameter.
- Home renders the periods as dense inset rows inside a button, which reads like diagnostics and no
  longer resembles the previous sponsor choice cards.
- Admin Sponsor offers uses the generic automation-rule row and flattens all prices into one
  truncated comma-separated string. Existing dev data has three legacy draft offers and rules for
  the same provider subscription.
- Unrelated device-detail work and the completed always-on Tribute slice are already present in the
  working tree and must be preserved.

## Research basis

- Apple Human Interface Guidelines, Layout and Design Principles, accessed 2026-08-15: group related
  controls/content, maintain clear hierarchy, use familiar consistent interactions, and disclose
  detail progressively.
- Apple HIG, Segmented controls, accessed 2026-08-15: selection visuals must represent a real
  selection state and closely related choices.
- Baymard Plan Matrix benchmark and subscription-service research, accessed 2026-08-15: make plan
  pricing immediately visible, scannable, and easy to compare; surface renewal/cancellation basics.
- Carbon Design System Tile guidance, accessed 2026-08-15: pricing tiles are appropriate for
  structured options, but selectable affordance requires a real single- or multi-select action.
- Nielsen Norman Group usability heuristics, accessed 2026-08-15: match the user's language, show
  system status, and make the next step predictable.

## Scope

In scope: shared multi-period presentation component; Home sponsor offer cards and actions; admin
offer cards/preview/status/duplicate explanation; concise English copy; deterministic unit and
Playwright coverage; light/dark responsive evidence; documentation of the durable UX decision.

Out of scope: undocumented Tribute URL parameters, changing signed webhook matching, live payments,
automatic deletion of legacy offers/rules, or changing unrelated device UI.

## Acceptance

- Each Home offer reads as one commercial proposition with title, purpose, type, visually distinct
  period/price tiles, and one explicit provider CTA.
- Period tiles have no hover, radio, checkmark, or selected state because Flowvy cannot transmit the
  choice; copy states that the final period is chosen in Tribute.
- Admin cards reuse the same period presentation, expose status/visibility/edit actions without
  truncating prices, and explain legacy duplicates locally.
- Donation offers retain exact amount/mode/frequency instructions and remain visually consistent.
- Loading, no/base access, active/blocked subscription, draft/published/duplicate, mutation failure,
  and narrow viewport behavior remain covered.
- Lint, typecheck, unit, build, focused all-project Playwright, accessibility/overflow/network guards,
  docs, and change-aware verification pass fresh.

## Approach

1. Add a shared semantic period-summary component and compact currency presentation using existing
   Flowvy tokens and typography.
2. Separate the Home offer's informational plan surface from its actual checkout CTA; retain all
   existing state-machine behavior and checkout mutation boundaries.
3. Replace the admin technical offer rows with contained preview cards, keeping existing editor and
   toggle hooks and adding clear duplicate guidance without mutating stored data.
4. Update fixtures/assertions and capture deterministic mobile/desktop light/dark evidence.
5. Update state/integration documentation and complete the fresh verification matrix.

## Progress

- [x] 2026-08-15 06:40 +03:00 — Read repository/UI/integration instructions, inspected the reported
  screen and traced Home/admin offer rendering through hooks, types, fixtures, and existing tests.
- [x] 2026-08-15 06:48 +03:00 — Reviewed Apple HIG, Baymard subscription/plan research, Carbon tiles,
  NN/g heuristics, and the official Tribute constraint; selected read-only comparison tiles plus one
  real provider CTA.
- [x] 2026-08-15 06:55 +03:00 — Added the shared semantic period grid and compact exact-money
  formatter, then rebuilt Home subscription/donation cards around one informational surface and one
  real provider action.
- [x] 2026-08-15 06:59 +03:00 — Replaced the admin technical rows with storefront previews and
  progressive disclosure for legacy duplicate subscription cards; preserved explicit edit/delete
  control and all stored data.
- [x] 2026-08-15 07:08 +03:00 — Completed functional, visual, accessibility, documentation, and
  repository gates across mobile Chromium, 320px Chromium, iOS WebKit, and desktop Chromium.

## Surprises & Discoveries

- The unattractive result is not primarily a spacing issue: the entire interactive card implies
  that its nested period rows are choices, even though all rows lead to the same provider page.
- Existing three-offer development data predates the one-subscription/one-offer model. Hiding or
  deleting it automatically would obscure administrator intent, so the redesign must explain it and
  keep cleanup explicit.

## Decision Log

- 2026-08-15 — Use semantic read-only plan tiles and a separate CTA. Do not use segmented controls,
  radio cards, or selected styling because Flowvy cannot persist or forward that choice to Tribute.
- 2026-08-15 — Reuse one shared period component in Home and admin to prevent visual/data formatting
  drift.
- 2026-08-15 — Preserve all legacy draft records; show duplicate context and disable only actions
  that the backend would reject.

## Verification

- `E:\mini-app\frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `E:\mini-app\frontend`: focused `tests/e2e/tribute.spec.ts` across mobile Chromium, 320px Chromium,
  iOS WebKit, and desktop Chromium with mocked APIs and no real provider calls.
- UI: Home and `/admin/settings/tribute` at 320x568, 430x932, 390x844 WebKit, and 1280x900 in light
  and dark; inspect period legibility, duplicate copy, touch targets, focus, Axe, console/network,
  and horizontal overflow.
- `E:\mini-app`: `scripts\verify.ps1 -Scope Changed -SkipE2E` after the separate all-project UI gate.

## Recovery and rollback

The change is presentational and uses existing mutations. Automated UI tests mock the FastAPI
boundary and never call Tribute or Remnawave. Rollback removes the shared period view and restores the
prior renderers; stored rules, offers, checkouts, and provider data are unchanged.

## Outcomes & Retrospective

The redesign restores one coherent commercial proposition without promising provider capabilities
that do not exist. Home and admin now share period labels, exact compact money, and a semantic
read-only grid. The only selected-looking element is the real CTA; all provider periods remain
visually comparable without suggesting that Flowvy can preselect one in Tribute.

Legacy development data exposed an important migration-state UX: showing three full previews was
truthful but overwhelming, while silently merging or deleting them would be unsafe. A native details
disclosure keeps every record and action reachable while leaving one primary preview in the reading
path.

Fresh verification: frontend lint/typecheck, 44 unit tests, production build; full Tribute Playwright
matrix 155 passed with one expected desktop-only keyboard skip; deterministic light/dark evidence
reviewed at 320x568, 430x932, iOS WebKit, and 1280x900; Axe, overflow, console, page-error, failed-
request, and unhandled-API guards passed; change-aware repository gate passed Ruff, 384 service-free
backend tests, frontend gates, and documentation links.

Standard Telegram-enabled dev was restarted without clearing its database. Local/public frontend,
health, and readiness returned `200`; the public debug route returned `404`.
