# In-app Support interface

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-24

## Purpose

Replace the product-owned `/support` placeholder with the accepted in-app Support experience. A
regular user can browse Quick Answers, inspect active and resolved requests, create a request with
attachments, and continue a conversation. An administrator opening the same route sees the shared
request queue and can reply, resolve, reopen, and download attachments.

## Current state

`/support` is a shared `ComingSoon` surface and deliberately ignores the removed provider-owned
Support copy and destination settings. The BFF has no Support persistence or attachment contract
yet. The accepted user and administrator prototypes are available as local HTML artifacts and are
the interaction and information-architecture reference, but their custom colors are not a source of
truth; current Flowvy semantic tokens are.

## Scope

In scope: one role-aware React page at `/support`; product-owned Quick Answers; active and resolved
request lists; request detail and reply composer; new-request form; frontend types and query/mutation
boundary; deterministic user/admin fixtures; attachment selection for screenshots, screen recordings,
TXT and ZIP; responsive light/dark UI; accessibility, empty, loading, error, and action-error states.

Out of scope: FastAPI endpoints, PostgreSQL schema, R2 buckets or credentials, upload transport and
retention jobs, Telegram notifications, malware inspection or archive extraction, administrator
assignment/presence/locking, and real provider calls. ZIP files remain opaque downloads: the future
server must never open or extract them.

## Acceptance

- The user overview follows the accepted order: Quick Answers, Active Requests, Resolved, Need a hand?
- An administrator opening `/support` sees the accepted queue/detail workflow without a separate
  admin route or extra tab.
- Replying to a resolved request reopens it; both roles can resolve and reopen in the frontend
  contract; no collaboration controls are introduced.
- File inputs accept screenshots, screen recordings, plain text and ZIP only, with a five-file
  client-side count guard. Exact byte limits remain absent until the backend/R2 contract is chosen.
- Production code contains no hard-coded ticket demo data. Deterministic data is supplied only by
  mocked API responses in tests.
- Every visible and accessibility string is localized; all surfaces use existing semantic tokens.
- Fresh lint, typecheck, unit, build, mocked Playwright, console/network/overflow, visual and Axe
  evidence satisfies the repository Definition of Done and reports ADR 0004 contrast debt honestly.

## Approach

1. Define the typed BFF-facing Support contract and TanStack Query hooks without implementing the BFF.
2. Build shared Support primitives plus user and administrator views under one page owner.
3. Add product-owned Quick Answer content and local nested-screen navigation.
4. Extend the deterministic API fixture with role-aware request data and mutations.
5. Replace stale placeholder assertions and add focused user/admin interaction and failure coverage.
6. Run focused checks, then the relevant full frontend/UI matrix; inspect screenshots in both themes
   and mobile/desktop viewports; review the final diff and update durable project state.

## Progress

- [x] 2026-08-24 — recovered and read both accepted prototypes; inventoried the current route, role,
  navigation, localization, API, query, placeholder, and test boundaries.
- [x] 2026-08-24 — fixed the implementation boundary: same `/support` route, role-aware view, frontend
  contract only, no R2/backend/notification work.
- [x] 2026-08-24 — implemented the typed data, multipart mutation, authenticated download, and query
  invalidation boundary.
- [x] 2026-08-24 — implemented the user overview, Quick Answer, request form and conversation plus the
  role-aware administrator queue, context, reply, resolve, reopen, and download surfaces.
- [x] 2026-08-24 — added deterministic fixtures, focused interaction/state/Axe coverage, and replaced
  stale placeholder assertions.
- [x] 2026-08-24 — completed fresh static, unit, build, four-project Support, expanded mobile, visual,
  documentation, and final diff review.

## Surprises & Discoveries

- The accepted administrator prototype keeps the ordinary Support tab selected. This matches a
  role-aware `/support` page better than adding `/admin/support`, and avoids changing the four-item
  administrator navigation.
- The prototype's earlier archive formats and byte limits predate the final decision. Only ZIP is
  accepted for archives, and size limits must wait for the actual FastAPI-to-R2 upload design.
- A regular user can still read and search Quick Answers when the missing Support BFF query fails;
  request sections expose an honest retry state instead of turning the whole route into an error.
- The repository Changed browser gate exposes three stale Tribute assertions that still expect a
  success/info notice removed by the current access-handoff implementation. The focused retry fails
  identically, and the Support fixture adds only independent `/api/support/*` handlers after the
  unchanged Tribute handlers.

## Decision Log

- 2026-08-24 — `/support` selects the administrator queue from the authenticated role, not from the
  current admin/user tab mode. This is the accepted same-page behavior.
- 2026-08-24 — Quick Answers are product-owned localized content, not operator/provider settings.
- 2026-08-24 — frontend-only delivery may show a truthful load/action error against a real backend
  until the next backend milestone; populated states come from deterministic test fixtures only.
- 2026-08-24 — attachments are limited by type and count in this milestone; no misleading security or
  storage guarantees are shown before the backend contract exists.

## Verification

- `frontend/`: `pnpm lint` passed 248 files; `pnpm typecheck` passed; `pnpm test` passed 99/99;
  `pnpm build` passed.
- `frontend/`: focused `support.spec.ts` passed 24/24 across 430x932 Chromium, 320x568 Chromium,
  iPhone 13 WebKit, and 1280x900 Chromium after the final localization fix.
- Focused Support coverage exercised overview order/search/navigation, Quick Answer and request
  routes, attachment types and five-file guard, role-aware queue/detail, reply, resolve/reopen,
  opaque ZIP metadata/download, loading/error/retry/empty states, overflow, unexpected
  console/network failures, and scoped Axe. Support `main` has no Axe findings.
- Light/dark user overview, request form, administrator queue and administrator conversation were
  inspected at mobile and desktop sizes; no horizontal overflow or hierarchy regression was found.
- The expanded mobile subset passed 68/71; all three failures are exact pre-existing ADR 0004
  `color-contrast` nodes outside Support.
- `pwsh -NoProfile -File ./scripts/verify.ps1 -Scope Changed` passed install, lint, typecheck, 99 unit
  tests and build, then finished browser verification at 179/194. Twelve failures are the exact
  accepted ADR 0004 contrast ledger. Three more are stale Tribute success/info-notice assertions;
  their focused retry remained 0/3, confirming they are reproducible rather than flaky. No Support
  test, console/network/overflow guard, or scoped Axe scan failed.
- `git diff --check` passed. Final source review found and localized the only hard-coded Support
  accessibility label before rerunning all focused and static checks.

## Recovery and rollback

All production changes are confined to Support frontend owners, shared query keys/locales, and tests.
No provider or database state is mutated. Do not reset the branch; use a targeted inverse patch only
with owner approval because unrelated later work may coexist.

## Outcomes & Retrospective

The accepted Support prototype now exists as production React UI with one authenticated role-aware
route family and no demo ticket data. User and administrator workflows share a typed future BFF
contract, while Quick Answers remain independently useful before that BFF exists. Attachments are
described and transported as opaque files at the frontend boundary; the implementation deliberately
makes no storage, byte-limit, retention, or archive-inspection promise. The next milestone is the
FastAPI/PostgreSQL/R2 contract and retention lifecycle, followed later by Telegram notifications.
