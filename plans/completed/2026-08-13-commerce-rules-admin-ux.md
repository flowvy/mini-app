# Configurable commerce rules for Tribute administration

Status: completed
Owner: Codex
Started: 2026-08-13
Updated: 2026-08-13

## Purpose

An open-source Flowvy administrator can describe how a verified Tribute payment should map to an
internal access profile without changing source code. The first provider surface supports donations,
subscriptions, and digital products, but the stored rule model separates the provider event from the
internal entitlement action so that later providers can reuse it.

This phase is configuration-only. It persists and previews rules but does not accept Tribute webhooks,
process payments, or grant/revoke access.

## Current state

- The existing Tribute admin slice exposes provider connection status and a read-only credential test
  at `/admin/settings/tribute`; the API key remains server-only.
- Access profiles already exist and are the internal entitlement target selected by administrators.
- There is no commerce-rule persistence, rule evaluator, webhook receiver, payment ledger, or access
  grant executor in the new repository.
- Official Tribute documentation reviewed on 2026-08-13 defines API-key authentication, signed webhook
  events, and distinct donation, subscription, and digital-product event families. Tribute describes a
  donation as gratuitous support, not a product purchase, so the UI must not relabel donations as plans.
- Current Stripe pricing and entitlement documentation was used only for provider-neutral design
  practices: keep provider products/prices separate from internal entitlements, model volume tiers
  explicitly, and make event processing idempotent and asynchronous when it is implemented later.

Primary references:

- https://wiki.tribute.tg/ru/api-dokumentaciya
- https://wiki.tribute.tg/ru/api-dokumentaciya/vebkhuki
- https://wiki.tribute.tg/ru/for-content-creators/digital-product/api-integration
- https://wiki.tribute.tg/for-content-creators/donations
- https://docs.stripe.com/products-prices/pricing-models
- https://docs.stripe.com/subscriptions/pricing-models/tiered-pricing
- https://docs.stripe.com/billing/entitlements
- https://docs.stripe.com/webhooks

## Scope

In scope:

- Provider-neutral persisted commerce rules with Tribute as the first provider.
- Donation, subscription, and digital-product sources.
- Currency and optional provider-item matching.
- Fixed-duration and amount-band calculations. Amount bands use a volume rule: the highest matching
  band supplies one integer ratio for the entire payment, evaluated with integer minor units.
- Selection of an existing active access profile and an extend-versus-replace activation policy.
- Priority, enabled state, authenticated CRUD, deterministic draft preview, validation, and errors.
- Admin list/editor/preview UX using the current Flowvy design system and reusable settings controls.
- Backend, frontend, Playwright, migration, accessibility, theme, viewport, and documentation checks.

Out of scope:

- Public webhook routes, signature/freshness/replay verification, event persistence, reconciliation,
  payment ledger, background execution, and any actual access mutation.
- Tribute product creation or modification and any provider call beyond the existing explicit
  read-only credential test.
- Importing architecture, code, formulas, or defaults from legacy Flowvy repositories.
- Hardcoded business rules. `500 RUB -> 30 days; 1000 -> 60; 3500 -> 365; 4000 -> 417` is a testable
  administrator-authored example, not seeded application behavior.

## Acceptance

- `/admin/settings/tribute` clearly separates connection, automation rules, and the future event
  receiver, and never implies that saved rules are currently executed.
- An administrator can create, edit, enable/disable, and remove a rule; refresh returns the persisted
  state. Non-admin and debug-disabled access fail closed.
- Rule validation is conditional by commerce/calculation type, currency is normalized, monetary
  arithmetic uses integer minor units, invalid/overlapping bands are rejected, and an inactive or
  missing access profile cannot become an automatic rule target.
- Fixed duration returns the configured duration. Volume bands select the highest matching threshold
  and calculate `floor(amount_minor * unit_days / unit_amount_minor)` without floating point.
- A draft preview is read-only and reports matched/no-match plus duration and selected band. It creates
  no rule and performs no access side effect.
- The example bands `from 500: every 500 -> 30 days` and `from 3500: every 3500 -> 365 days` preview
  500/1000/3500/4000 RUB as 30/60/365/417 days.
- Loading, empty, validation, unavailable-profile, save/delete failure, preview no-match, unauthorized,
  and success states are covered at the cheapest useful deterministic level.
- The affected route is interactively verified at 320x568, 390x844, 1024x768, and 1440x900 in light
  and dark themes with Axe, overflow, console, and failed-network checks.

## Approach

1. Add a provider-neutral database model and reversible Alembic migration. Store stable matching and
   action fields in columns and the validated calculator payload as JSON so future calculator kinds do
   not require provider-specific tables.
2. Put validation, access-profile checks, ordering, and integer evaluation in backend services. Expose
   admin-only CRUD and draft-preview endpoints; mirror them under local-only debug admin routes for
   deterministic browser tests.
3. Extend the Tribute settings surface with a compact rule list and a responsive editor dialog. Reuse
   existing fields, buttons, feedback, cards, and settings layout; extract a shared editor shell if the
   current access-profile editor would otherwise be duplicated.
4. Add deterministic service/route/migration tests and mocked Playwright scenarios. No test contacts
   Tribute, Telegram, Remnawave, or a production-like database.
5. Update stable integration, architecture, security, testing, and project-state facts. Run changed
   verification while iterating and the full repository gate before handoff.

## Progress

- [x] 2026-08-13 — Reframed the task around official Tribute contracts and provider-neutral current
  pricing/entitlement practices; legacy repositories are excluded as architecture sources.
- [x] 2026-08-13 — Locked the rule semantics: fixed duration or volume amount bands, internal access
  profile target, priority, enabled state, and extend/replace policy.
- [x] 2026-08-13 — Added reversible `commerce_rules` persistence, authenticated CRUD, active-profile
  validation, and side-effect-free backend preview.
- [x] 2026-08-13 — Built the Tribute rule list/editor/preview using existing Flowvy components and
  extracted one shared native editor-dialog shell from the existing access-profile implementation.
- [x] 2026-08-13 — Covered contracts and UI states, inspected both themes/viewports, and ran the
  changed and full repository gates freshly.

## Surprises & Discoveries

- The user's real use case is a donation-to-access policy with two different proportional rates, not
  subscription sales. Treating it as a provider plan would erase the distinction Tribute itself makes.
- A single linear formula cannot represent both `500 -> 30 days` and `3500 -> 365 days`; volume bands
  model the intended switch without business-specific branches.
- The first migration verification exposed timestamp drift because the shared ORM timestamp aliases
  use PostgreSQL timestamp without time zone. Matching the established model convention removed the
  drift; the rerun passed zero-to-head, downgrade/re-upgrade, prior fixtures, one head, and Alembic check.
- A nested confirmation rendered outside a native modal could not enter the browser top layer. The
  shared confirmation component now also uses `showModal()`, fixing pointer blocking for this editor
  and preserving accessible focus behavior across existing callers.
- The editor body initially compressed its cards to avoid overflow, which visually clipped controls
  and created several competing scroll regions. Preventing card flex-shrink restored one predictable
  body scroll while keeping the header and action footer fixed at every accepted viewport.

## Decision Log

- 2026-08-13 — Legacy Flowvy applications are evidence only that external traffic exists; their
  architecture and formulas are explicitly not inputs to this design.
- 2026-08-13 — Store monetary thresholds and preview amounts in integer minor units and use integer
  floor division. Decimal floating-point is excluded from entitlement duration calculation.
- 2026-08-13 — The selected amount band applies its ratio to the entire amount (volume behavior), not
  only to the slice above the threshold. This produces the administrator's desired 4000 RUB example.
- 2026-08-13 — Persist real configuration in this admin-UX phase so Save is honest, but keep all event
  ingestion and entitlement execution out of scope and label that boundary in product copy.

## Verification

- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Changed` -> 293 service-free backend tests, 36 frontend
  unit tests, production build, 67 mobile Chromium E2E scenarios, and docs passed.
- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Full` -> Ruff on 143 files, zero-to-head migration and
  drift checks, 344 backend tests, 53 Remnawave contract tests, frontend lint/typecheck, 36 unit tests,
  production build, 67 mobile Chromium E2E scenarios, and docs passed freshly.
- `E:\mini-app\backend`: `uv run pytest tests/test_commerce.py -q` -> 16 passed, covering fixed and band
  formulas, conditional validation, CRUD, active-profile validation, and no side effects.
- `E:\mini-app\frontend`: focused Tribute Playwright scenarios -> 9/9 mobile tests and 36/36 tests
  across mobile Chromium, 320px Chromium, iOS WebKit, and desktop Chromium passed against deterministic
  fixtures.
- Manual/UI evidence: `/admin/settings/tribute`, all acceptance viewports, light/dark, zero serious
  Axe issues, no document overflow, and no unexpected console or failed network entries.
- Restart smoke check: local health, readiness, and frontend returned 200; `dev-app.flowvy.io` and its
  proxied readiness route returned 200; PostgreSQL reported Alembic head `m3n4o5p6q7r8`; the commerce
  API returned 401 without Telegram authorization both locally and through the public dev route.

## Recovery and rollback

- The migration downgrade removes only the new commerce-rule table and enum-free constraints; existing
  access profiles and provider settings remain untouched.
- CRUD tests use the disposable test database. Browser tests use request mocking and never write real
  payment or access data.
- If the new UI must be rolled back independently, the additive API/table can remain unused safely;
  no webhook or executor reads it in this phase.

## Outcomes & Retrospective

Flowvy now has an honest, persisted admin configuration layer for mapping Tribute commerce events to
internal access profiles without encoding a maintainer's business rules in source. Donation, recurring
subscription, and digital-product matching share the same provider-neutral rule model; fixed and volume
band calculators can be previewed before save with integer monetary arithmetic. The existing Tribute
webhook remains untouched, and no event receiver or access executor exists yet, so the next phase can
add authenticated, replay-safe ingestion and idempotent execution without redesigning the admin model.
