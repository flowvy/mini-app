# Browser test instructions

These instructions apply to deterministic UI and end-to-end tests. Follow `frontend/AGENTS.md`.

## Test boundary

- The default UI suite must not require Telegram, Remnawave, Kuma, PostgreSQL, Redis, or secrets.
  Mock the FastAPI boundary with fixed fixtures or start explicit local fake services.
- Give each test isolated state, a fixed clock/timezone/locale, stable fonts, and disabled or awaited
  animation. Do not depend on another test, current date, network order, or a developer's server.
- Reject unexpected API requests. Capture `console.error`, `pageerror`, and failed responses and make
  them test failures except for an explicitly asserted failure scenario.

## Coverage model

Maintain a small smoke path for every user-visible route and focused cases for changed behavior:

- User: `/`, `/devices`, `/pulse`, `/support`.
- Admin: `/admin/dashboard`, `/admin/users`, `/admin/users/search`, `/admin/users/:id`, `/admin/broadcast`, and settings
  routes for Pulse, Kuma, Beszel, the Tribute hub and its section routes, Communication/message
  editors, branding, registration/access, and Welcome content.
- Roles/states: normal user, admin, denied; loading, populated, empty, `401`, `403`, `404`, provider
  failure, timeout, and retry where the screen supports them.
- Subscription/device/Pulse cases: absent/active/expired, zero/many devices, deletion success/failure,
  all-up/partial/down/disabled status.
- Navigation: direct URL, tab/mode switch, Back/Forward, reload, dialogs, keyboard, and focus.
- Viewports/themes: at least a narrow `320x568`, primary Telegram-like `430x932`, admin desktop, and
  both light and dark rendering for visually affected components.

## Assertions and artifacts

- Prefer role, label, and visible-text locators. Avoid CSS structure and arbitrary sleeps.
- Separate functional assertions from screenshot assertions. Use targeted screenshots for stable,
  important states; inspect diffs before accepting a baseline.
- Check viewport overflow, safe-area controls, touch target access, focus visibility, and automated
  accessibility results. Automation supplements rather than replaces keyboard and visual review.
- Run Axe only after route/theme/animation state is stable. Strict desktop color parity is not an
  exception: never suppress or allow-list `color-contrast`, downgrade its impact, or call a scan
  passed when violations remain. Report exact routes, themes, rules, affected nodes, and color pairs;
  every finding fails the task.
- Keep traces, screenshots, and videos only as failure artifacts unless a reviewed baseline is part
  of the test. Never commit artifacts containing real user/provider data.

Use `pnpm test:e2e:ci` only for the fast deterministic `@ci-smoke` subset in GitHub Actions. Keep
`pnpm test:e2e` as the complete mobile-Chromium suite for local UI verification and release gates;
live Telegram or Swiftgram acceptance remains a separate manual check and never belongs in CI.

Run the configured Playwright command from `frontend/` after the test scaffold exists, followed by
`pnpm lint`, `pnpm test`, and `pnpm build`. If an interactive Codex browser is unavailable, the
deterministic Playwright suite remains mandatory and the missing manual inspection must be reported.
