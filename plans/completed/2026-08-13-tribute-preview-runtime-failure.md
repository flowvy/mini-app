# Make Tribute draft preview reliable in the real Mini App

Status: completed
Owner: Codex
Started: 2026-08-13
Updated: 2026-08-13

## Purpose

An administrator can preview an unsaved Tribute donation rule from the real Telegram Mini App and
receive the calculated access duration instead of a generic request failure.

## Current state

The editor sends a camelCase `CommerceRulePreviewRequest` from
`frontend/src/components/admin/commerce-rule-editor.tsx` through
`frontend/src/hooks/use-commerce-rules.ts` to `POST /api/admin/commerce/preview`. The backend
calculator accepts the reported `500 / 3499 / 30` values and deterministically returns four days
when invoked directly. Local and public Vite proxies both forward the same unauthenticated payload
to the backend and return the expected `401`, so the route and proxy exist. The real Swiftgram
request still surfaces `preview.isError`; existing Playwright coverage mocks the API and therefore
does not exercise Telegram authentication or the production route.

## Scope

In scope: trace the production request boundary, cover the exact HTTP payload, keep Telegram
initData available in memory for later mutations, make preview errors actionable without exposing
private diagnostics, and verify the real public build. No real Tribute call, payment, webhook,
access mutation, secret read, or production-like data mutation is allowed.

## Acceptance

- The exact reported draft reaches the authenticated FastAPI route and returns `4 access days`.
- A later mutation still carries the initial Telegram initData even if the SDK can no longer
  retrieve launch parameters dynamically.
- The editor clears stale preview state when its inputs change and distinguishes authentication,
  validation, and availability failures with safe localized copy.
- Mocked mobile/iOS UI tests and the repository verification gate pass; the public dev domain serves
  the verified asset.

## Approach

Add a production-route integration regression around the reported camelCase payload, then make the
Telegram adapter retain only the first in-memory raw initData value (never storage or logs). Add a
small typed error mapping for commerce preview and reset a previous mutation result when the draft
changes. Exercise success and status-specific failure states in deterministic browser tests, build,
restart the standard Flowvy dev environment if backend/frontend runtime state changed, and compare
the local/public asset hashes.

## Progress

- [x] 2026-08-13 23:40 +03:00 — reproduced the exact calculator payload directly: matched band,
  `durationDays=4`, camelCase response.
- [x] 2026-08-13 23:40 +03:00 — confirmed local and public preview proxies reach the route and both
  fail closed with `401` when Authorization is intentionally omitted.
- [x] 2026-08-13 23:44 +03:00 — production-boundary regression returned four days; retained-initData
  unit failed before the in-memory fix and passed after it. Added safe status copy and stale-result
  invalidation.
- [x] 2026-08-13 23:46 +03:00 — renamed ambiguous band fields to `Starts at`, `Payment unit`, and
  `Access per unit`; 44/44 Tribute scenarios passed across all four browser projects and dark error
  evidence was inspected.
- [x] 2026-08-13 23:52 +03:00 — Full gate passed with 345 backend, 37 frontend unit and 69 mobile
  browser tests. Standard dev restarted; local/public asset hashes match, readiness is `200`, and
  the public debug route remains `404`.

## Surprises & Discoveries

- The values in the screenshot are valid but represent approximately four days for 500 RUB. The
  desired 500-RUB monthly and 3500-RUB annual behavior requires two bands; configuration semantics
  are separate from the transport failure.
- The existing Tribute browser suite calculates previews entirely inside its mock API, so it can be
  green while the authenticated production request fails.
- The installed Telegram bridge can recover launch params from URL, navigation entry, or its own
  stored launch-params value. Retaining the first successful raw value in module memory adds a
  fail-safe for WebView-specific retrieval loss without introducing another persistent secret copy.
- `Every amount` was read naturally as an upper range bound in the reported draft. It is actually
  the payment-unit denominator, so the UI copy—not only the request—needed correction.

## Decision Log

- 2026-08-13 — retain Telegram initData only in module memory after the first successful SDK read;
  persistent browser storage and any diagnostic logging are excluded because initData is a secret.
- 2026-08-13 — keep the backend as the source of truth for preview math; do not duplicate the
  calculator in React as a fallback.
- 2026-08-13 — classify only HTTP status for administrator copy and continue discarding raw backend
  detail; this makes the next failure actionable without exposing diagnostics.

## Verification

- `E:\mini-app\backend`: `uv run --frozen pytest -q tests/test_commerce.py` → 17 passed; focused Ruff
  format/lint passed.
- `E:\mini-app\frontend`: focused retained-initData/API/catalog Vitest → 11 passed; final full Vitest
  → 37 passed; Biome and typecheck passed.
- `E:\mini-app\frontend`: exact draft on mobile Chromium and iOS WebKit → 4/4; complete Tribute
  matrix → 44/44 across mobile, small mobile, iOS WebKit and desktop; visual evidence passed and was
  inspected.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5295; scripts/verify.ps1 -Scope Full` → exit 0, migrations/drift,
  345 backend, 53 Remnawave contract, 37 frontend unit, build, 69 mobile E2E and docs passed.
- Public dev: local/public `/assets/index-j_XaGRQy.js` match; local/public readiness `200`; public
  debug commerce route `404`.

## Recovery and rollback

All changes are code/tests/docs and do not alter provider or user data. The in-memory credential
cache disappears when the WebView closes. Stop only repository-tracked dev/tunnel processes with
the checked-in down scripts before a standard restart. Revert only the files listed in this plan if
the approach is disproved; never reset the dirty worktree.

## Outcomes & Retrospective

The reported draft now has an executable production-route regression, late mutations reuse the
first safely retrieved Telegram initData in memory, and a failure no longer collapses into one
generic message or remains visible after the draft changes. The same screenshot also exposed an
information-architecture issue: `Every amount` looked like an upper bound. The editor now names the
actual threshold, payment denominator and access numerator explicitly and shows the formula. No
Tribute request, webhook, access mutation, secret read or persistent data change was performed.
