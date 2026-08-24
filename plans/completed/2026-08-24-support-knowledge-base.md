# Administrator-managed Support knowledge base

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-24

## Purpose

Replace the code-owned Quick Answer article catalog with an administrator-managed knowledge base in
the Mini App. Administrators create, edit, localize, order, publish, unpublish and archive articles
with Flowvy's existing CommonMark editor. Authenticated users see only published articles resolved
for their requested locale.

## Current state

The uncommitted Support frontend milestone renders three article definitions from
`frontend/src/lib/support-answers.ts` and their content from `frontend/src/i18n/locales/en.json`.
That contradicts the newly accepted ownership boundary: article content is operator-managed runtime
data, while structural labels, actions, validation and error copy remain product locale strings.
The backend has no Support routes or persistence. PostgreSQL uses one linear Alembic head
`g2b3c4d5e6f7`. The existing `FormattedTextEditor` and `FormattedText` implement the supported safe
CommonMark boundary.

## Scope

In scope: a dedicated `support_articles` PostgreSQL table; typed localized JSONB per article;
repository/service/DI/routes; authenticated published article API; admin CRUD, status transitions and
ordering; role-aware Support management screens; replacement of hard-coded article fixtures with API
fixtures; migration, backend, frontend and deterministic UI tests; ADR and project-state updates.

Out of scope: ticket/message persistence, R2 attachment transport, Telegram notifications, article
media embeds, external CMS, machine translation, revision history and collaborative editing UI.

## Acceptance

- Production code and locale catalogs contain no article title, summary or body content.
- A non-admin can list and open only published articles in the locale selected from
  `Accept-Language`; draft, archived and unknown IDs return not found.
- An active authenticated administrator can create a draft, edit localized title/summary/body,
  publish only complete default-locale content, unpublish, archive and reorder articles. Backend
  authorization is authoritative.
- The existing CommonMark editor/renderer is reused; raw HTML is not accepted or rendered.
- An empty installation shows a valid empty Quick Answers state and can be populated entirely from
  the Mini App without environment or source edits.
- Existing Support request interface and its honest missing-ticket-backend failure behavior remain
  intact.
- Fresh migration, backend, frontend and deterministic browser gates cover success and failure paths.

## Approach

1. Define the article schema and migration using a UUID primary key, constrained topic/status/order,
   localized JSONB, UTC timestamps and stable indexes.
2. Add repository and service boundaries that normalize CommonMark/locales, enforce publication
   completeness and expose resolved public projections separately from admin content maps.
3. Add authenticated user routes and admin-authorized CRUD/order routes, then wire Dishka and the app
   factory.
4. Replace hard-coded frontend article data with TanStack Query contracts and build the admin list
   and editor under the role-aware Support route family.
5. Expand backend and Playwright fixtures/tests, then run migration, backend, frontend, visual,
   accessibility, console/network and diff review gates.

## Progress

- [x] 2026-08-24 — verified the uncommitted Support boundary, existing locale/content ownership ADR,
  CommonMark editor/renderer, provider-settings JSONB pattern, one Alembic head and required checks.
- [x] 2026-08-24 — implemented and tested the backend data/API boundary.
- [x] 2026-08-24 — replaced hard-coded articles and implemented administrator management UI.
- [x] 2026-08-24 — completed migration, backend, frontend and focused four-project UI verification.
- [x] 2026-08-24 — amended ADR 0002, updated architecture/project state and closed the plan.

## Surprises & Discoveries

- `provider_settings.content_locales` is a singleton JSONB document patched as a whole. Reusing it
  for an independently ordered article collection would create avoidable overwrite and lifecycle
  problems, so each article owns its own typed locale map.
- The existing editor deliberately excludes headings, code blocks, raw HTML and images but supports
  paragraphs, emphasis, links, quotes and lists. That is sufficient for the first knowledge-base
  body contract and avoids a second content format.
- Final route review found that FastAPI's dynamic `/{article_id}` PUT route could shadow the static
  `/order/all` PUT route. Static reorder routes now register first for authenticated and debug
  routers, and an authenticated HTTP regression proves that the endpoint returns the reordered list.

## Decision Log

- 2026-08-24 — selected a dedicated `support_articles` model instead of provider-settings JSONB or
  an external CMS, by explicit owner choice.
- 2026-08-24 — article routes use stable UUIDs rather than title-derived slugs because the Mini App
  has no SEO requirement and titles/locales can change.
- 2026-08-24 — topic remains a structural enum whose label/icon is product UI; title, summary, body,
  order and publication state are runtime article data.
- 2026-08-24 — no seed articles are inserted by migrations. A fresh open-source installation starts
  empty and is fully configurable through the administrator Mini App.

## Verification

- `scripts/verify-migrations.ps1`: one head, zero/head, downgrade/re-upgrade and model drift passed.
  The first drift run caught timezone-incompatible audit columns in the migration; the migration was
  corrected to the repository's existing audit-column contract and the lifecycle reran green.
- Full backend: 542 tests passed; pinned Remnawave contract suite: 56 tests passed.
- Frontend: lint, typecheck, 99 unit tests and production build passed.
- Focused Playwright: 44/44 Support scenarios passed at mobile Chromium, small mobile Chromium,
  iOS WebKit and desktop Chromium. The matrix covers user empty/populated/search/detail/not-found/load
  failure and administrator list/create/edit/publish/unpublish/archive/restore/reorder/save failure,
  direct URL authorization and Back states, with light/dark screenshots, overflow, console/network
  and scoped Axe assertions.
- `scripts/verify.ps1 -Scope Changed` and `-Scope Full` each reached 184/199 mobile Playwright.
  The same 15 unrelated pre-existing failures remained: 12 tests expose only the exact accepted ADR
  0004 color-contrast debt and three retain stale Tribute success/info notice expectations. No
  Support scenario failed and no new Axe rule/node was introduced.

## Recovery and rollback

No real provider or external storage is contacted. The migration downgrade drops only the new
`support_articles` table and is safe only on a disposable verification database or after an explicit
backup/owner decision. Source rollback must be a targeted inverse patch; never reset the existing
uncommitted Support work or unrelated branch history.

## Outcomes & Retrospective

Quick Answers are now operator-owned runtime content with no migration seed or production fallback.
An administrator can manage the complete article lifecycle from Support, while public projections
fail closed to published resolved-locale content. Ticket/message persistence, R2 attachments,
retention and notifications remain intentionally outside this milestone. No external provider or
storage mutation, commit or push was performed.
