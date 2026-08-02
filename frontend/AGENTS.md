# Frontend instructions

Applies to `frontend/`. Follow the repository root and `tests/e2e/AGENTS.md` when relevant.

## Current shape

- React 19, strict TypeScript, Vite, TanStack Router/Query/Virtual, Telegram Apps SDK, i18next,
  CSS Modules, and Flowvy design tokens in `src/styles/tokens.css`.
- `lib/api.ts` is the HTTP boundary and attaches Telegram init data. Hooks own query/mutation state;
  pages compose feature and UI components; `router.ts` is the route source of truth.
- The frontend is a client of the FastAPI BFF. It must not call Remnawave, Kuma, Beszel, PostgreSQL,
  or Redis.

## Implementation rules

- Preserve strict types; avoid `any`, `@ts-ignore`, and unchecked assertions. Keep provider/backend
  wire types separate from view-only state when their shapes differ.
- Centralize server state in TanStack Query with stable keys from `lib/query.ts`. After mutations,
  invalidate or update every affected list/detail/dashboard key.
- Keep API behavior in `lib/api.ts` and hooks. Explicitly handle `204`/empty bodies, structured and
  unstructured errors, cancellation, and retry behavior; do not parse every success as JSON.
- Put every user-visible string and accessible label in the locale resources before using it. Keep
  translation keys grouped by feature and update the i18n catalog when it remains part of the repo.
- Use existing CSS Modules and `--v2-*` tokens. Check Telegram safe areas, small mobile heights,
  long text, focus visibility, reduced motion, and light/dark contrast. Avoid one-off inline colors.
- Prefer semantic controls and accessible names. Dialogs need focus management, Escape/cancel,
  destructive-action clarity, and disabled/loading behavior.
- Route and mode changes must work through direct navigation and browser Back/Forward, not only
  clicks from the default page. Do not trust the client role for authorization.
- Mock auth is a local UI aid, not a security boundary. It must never be enabled in a public build.

## Verification

Run from `frontend/`:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Start with the smallest relevant unit/component test, then the full commands. The current Vitest file
and mocked critical-route Playwright smoke are only a seed; add focused states for the changed flow.
For UI changes, also manually inspect affected states at mobile and admin desktop viewports. Fail on
unexpected `console.error`, `pageerror`, and failed or unmocked requests. Do not update screenshots
until the behavioral result is understood.
