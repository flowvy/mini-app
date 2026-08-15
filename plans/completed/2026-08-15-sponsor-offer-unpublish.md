# Sponsor offers can be unpublished safely

Status: completed
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

An administrator can hide any published Tribute sponsor offer without an error. The offer disappears
from Home while its editable configuration remains available for a later re-publication.

## Current state

All three published offers fail on `PUT /api/admin/commerce/offers/{offer_id}` with HTTP 500. The
PostgreSQL error identifies `ck_sponsor_offers_checkout_snapshot`: SQLAlchemy serializes Python
`None` as JSONB `null`, while the database accepts only a JSON object or SQL `NULL` in this column.
The affected flow is the admin toggle in
`frontend/src/components/admin/sponsor-offers-config.tsx`, the commerce route, `SponsorOfferService`,
`SponsorOfferRepository`, and the `SponsorOffer.checkout_snapshot` mapping.

## Scope

Change the nullable JSONB mapping, add a real-PostgreSQL regression test for unpublishing, verify the
existing admin interaction, and update current project documentation. Do not change Tribute checkout
or entitlement semantics and do not reset existing development data.

## Acceptance

- A published donation or subscription offer can transition to draft with no database error.
- The resulting row has `is_published = false` and SQL `NULL` for `checkout_snapshot`.
- Re-publishing continues to create a freshly validated snapshot.
- Relevant backend, frontend, browser, and repository gates pass freshly.

## Approach

Configure this nullable JSONB mapping with SQLAlchemy's `none_as_null=True`, which is the supported
way to persist Python `None` as SQL `NULL`. Exercise the exact repository transition against
PostgreSQL, retain the current provider-validation rules for publication, and confirm the toggle via
the mocked deterministic browser scenario before restarting the existing full development stack.

## Progress

- [x] 2026-08-15 02:55 +03:00 — traced the failed admin request to the JSONB check constraint using sanitized local logs.
- [x] 2026-08-15 02:58 +03:00 — corrected the JSONB mapping and added a passing PostgreSQL regression for the exact published-to-draft transition.
- [x] 2026-08-15 02:58 +03:00 — passed focused backend/browser checks and the Changed gate: Ruff, 383 service-free backend, 43 frontend unit, build, 98 mobile Playwright, and docs.
- [x] 2026-08-15 03:00 +03:00 — updated durable docs, rechecked Markdown links, and restarted the full Telegram-enabled named-tunnel stack with preserved data and both controlled Tribute delivery flags.

## Surprises & Discoveries

- The HTTP error was independent of Tribute and offer type. Python `None` reached PostgreSQL as the
  JSONB scalar `null`, so `jsonb_typeof(checkout_snapshot)` returned `null` rather than `object`.

## Decision Log

- 2026-08-15 — fix the ORM type mapping instead of weakening the database constraint. The constraint
  correctly prevents malformed snapshots; the intended draft representation is SQL `NULL`.

## Verification

- `E:\mini-app\backend`: focused PostgreSQL and service tests, then the diff-aware repository gate.
- `E:\mini-app\frontend`: lint, typecheck, tests, build, and the focused Tribute Playwright scenario.
- Runtime: restart the documented Telegram-enabled named-tunnel stack and confirm healthy endpoints.

## Recovery and rollback

The model mapping is reversible and requires no database migration. Existing published offers are
not modified by the code change. If a runtime toggle is used for final confirmation, restore its
original publication state through the same UI before handoff unless the user requested otherwise.

## Outcomes & Retrospective

The failure was removed without weakening PostgreSQL validation or changing the API/UI contract.
SQLAlchemy now writes a missing offer snapshot as SQL `NULL`; the exact transition is covered on
PostgreSQL and the admin toggle is covered in Playwright. The Changed repository gate passed, and
the restarted local/public runtime is healthy with no new backend error markers. The user can repeat
the original toggle action on any existing offer; no existing offer was changed during diagnosis.
