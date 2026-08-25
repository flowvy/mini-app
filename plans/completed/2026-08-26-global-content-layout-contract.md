# Stable content layout across Flowvy surfaces

Status: completed
Owner: Пятница
Started: 2026-08-26
Updated: 2026-08-26

## Purpose

Dynamic text, icons, translations and provider values must not force adjacent UI slots out of
alignment or create horizontal overflow. The Home expiry/device metrics must share exact value and
label rows, including the mixed SVG infinity and numeric states.

## Current state

`frontend/src/styles/global.css` has a box-sizing reset but no application-wide intrinsic sizing or
long-token policy. Individual CSS modules therefore have to remember `min-width: 0`. In
`frontend/src/components/home/hero-card.module.css` and the analogous admin user hero, each metric is
an independent block. An inline Lucide SVG and numeric text produce different line boxes, so their
labels can land at different block coordinates.

## Scope

In scope: a low-specificity frontend content-sizing baseline, stable metric geometry on user and
admin hero surfaces, deterministic long-content/overflow/alignment tests, visual and accessibility
verification on all configured viewport projects and both themes. Out of scope: hiding arbitrary
content, fixed-height clipping, API/data changes, or redesigning unrelated surfaces.

## Acceptance

- Home and admin expiry/device labels have identical top coordinates for finite and unlimited values.
- Long unbroken content cannot enlarge a flex/grid item past the application viewport.
- Existing component-specific nowrap, ellipsis and wrapping policies continue to win over the base
  contract.
- User/admin routes pass overflow, console/network and strict Axe checks at 320x568, 430x932,
  iPhone/WebKit and desktop viewports in light and dark themes.
- Fresh frontend and repository verification gates pass.

## Approach

1. Add a zero-specificity intrinsic-size and long-token baseline in global CSS. This follows the CSS
   flex/grid automatic minimum-size and overflow-wrap contracts and remains overridable by modules.
2. Give the two hero metric groups explicit shared row geometry and block SVG rendering.
3. Add computed-layout regressions for alignment and the global shrink/wrap contract.
4. Run focused all-project UI verification, inspect screenshots, then run Changed and Full gates and
   restart the standard Telegram-enabled dev environment.

## Progress

- [x] 2026-08-26 00:26 +03:00 — traced current Home/admin hero composition and confirmed independent
  inline SVG/text line boxes are the immediate alignment cause.
- [x] 2026-08-26 00:26 +03:00 — checked CSS Flexbox/Grid sizing and overflow-wrap documentation.
- [x] 2026-08-26 — implemented the low-specificity intrinsic-size/text/media baseline and stable
  Home/admin KPI row geometry, including a narrow 2x2 Home stats layout.
- [x] 2026-08-26 — focused content-layout regression passed 8/8 across all four projects in light and
  dark themes; representative screenshots were inspected.
- [x] 2026-08-26 — Changed and Full repository gates passed; documentation and final diff review
  completed. Standard dev restart is recorded in Outcomes after runtime acceptance.

## Surprises & Discoveries

- The same independent metric composition exists in both the user Home hero and admin user hero, so
  a Home-only alignment rule would leave the underlying pattern inconsistent.

## Decision Log

- 2026-08-26 — use low-specificity CSS sizing/wrapping defaults plus explicit component geometry.
  Global `overflow: hidden` or fixed card heights were rejected because they conceal accessible
  content instead of containing it.

## Verification

- `frontend`: focused Playwright specification on all four projects with light/dark evidence.
- repository root: `pwsh ./scripts/verify.ps1 -Scope Changed` and
  `PLAYWRIGHT_PORT=<isolated>; pwsh ./scripts/verify.ps1 -Scope Full`.
- runtime: standard Telegram-enabled dev lifecycle and local/public health/readiness checks.

## Recovery and rollback

All changes are frontend CSS/tests/docs and are reversible by reverting the task diff. Browser tests
use mocked BFF data and do not contact Telegram, Remnawave or payment providers.

## Outcomes & Retrospective

The application now has one overridable content-sizing baseline instead of relying on every future
Flex/Grid module to remember the automatic-minimum-size exception. It preserves content rather than
clipping it. Hero KPI labels use explicit shared rows, so icon and text metrics cannot create
different label baselines. At 320 px, the secondary stats use a 2x2 grid because four complete
Russian labels cannot remain stable in four equal tracks.

Focused Playwright passed 8/8. The complete four-project suite passed 915/916 in its parallel run;
the sole timeout happened during navigation to the unrelated Russian Communication route and its
exact isolated rerun passed 1/1. Changed passed 442 service-free backend tests, Ruff,
lint/typecheck, 111 unit tests, production build, 229/229 mobile Playwright and docs. Full passed
migrations/drift, 563 backend tests, 56 pinned Remnawave contracts and the same frontend/docs gates.
Standard Telegram-enabled dev was then stopped through the tracked lifecycle and rebuilt from
scratch. Local frontend/backend/preview and public root/health/ready returned 200, public debug
returned 404, PostgreSQL/Redis were healthy, the local/public asset matched, and
`telegram_main_app_ready` appeared once with no backend error markers.
