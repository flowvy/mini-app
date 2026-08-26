---
name: flowvy-ui-verify
description: Functionally and visually validate Flowvy's React Telegram Mini App after UI, CSS, route, client-state, or API-fixture changes using deterministic Playwright scenarios and browser evidence.
---

# Verify the Flowvy UI

Read `references/state-matrix.md` and `frontend/tests/e2e/AGENTS.md` before testing. The default test mode is deterministic and mocks every API request; it must not require backend debug routes or real credentials.

## Preflight

1. Inspect the diff and list every changed user-visible claim, control, route, and state.
2. Map those items to the route/state matrix. Add missing cases before declaring coverage.
3. Use fixed data, time, locale, timezone, fonts, theme, and disabled animations for visual evidence.
4. Start only the processes required by the chosen suite and record their identifiers. Confirm readiness before navigation.

## Functional pass

- Use role, label, and visible-text locators; do not depend on CSS module class names.
- Exercise controls with normal user input, including confirm/cancel, Back/Forward, direct URLs, and keyboard focus.
- Fail on unhandled API requests, unexpected non-2xx responses, `console.error`, `pageerror`, or uncaught request failures.
- Check loading, normal, empty, denied, validation, server-error, timeout/offline, and mutation success/failure where relevant.

## Visual and accessibility pass

- Check light and dark themes, safe areas, no horizontal overflow, fixed navigation, dialogs, focus visibility, long values, and mobile viewport fit.
- Run automated accessibility checks on stable pages, then manually check keyboard order, dialog focus/return, names, and contrast-sensitive states.
- Strict desktop parity never creates an accessibility exception. Any `color-contrast` or other Axe
  finding blocks completion; do not suppress, allow-list, downgrade, or describe a red gate as
  passed. ADR 0004 retains its former ledger only as historical evidence.
- Capture focused screenshots of changed screens. Update committed baselines only when the user explicitly accepts the visual change.

Use repository Playwright tests as the reproducible gate. The Codex in-app browser may supplement them for exploratory inspection, but browser availability must not change the pass criteria.

## Cleanup and output

Stop only processes started by this run. Keep artifacts under `frontend/test-results`, `frontend/playwright-report`, or `.artifacts`. Report scenarios passed, screenshots inspected, console/network/accessibility status, viewports, failures, and anything not covered. Do not fix source code when the user requested validation or review only.
