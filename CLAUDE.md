# Flowvy

Open-source Telegram Mini App + Bot for VPN subscription management (Remnawave). Providers self-host and rebrand.

@docs/ARCHITECTURE.md — monorepo structure, patterns, data flow.
@docs/DEV_ENVIRONMENT.md — local dev setup, ngrok, Telegram test env.

## Language

ALL communication with the user MUST be in Russian. Code, comments, docstrings, commit messages, variable names — in English. But all explanations, plans, questions, reports — only Russian.

## Stack

- **Backend**: Python 3.12+, aiogram 3.x, FastAPI, Dishka (DI), SQLAlchemy 2.x async, Alembic, PostgreSQL, Redis
- **Frontend**: React 19, TypeScript strict, Vite, TipTap, custom Flowvy CSS tokens — NO Tailwind
- **Tooling**: uv (Python), pnpm (JS), ruff (Python lint/fmt), biome (TS lint/fmt)
- **Visual testing**: Playwright MCP — screenshot and interact with localhost
- **Tunnel**: ngrok for Telegram HTTPS requirement

## YOU MUST follow these rules. No exceptions.

### Source of Truth: Official Documentation Only

Before using ANY library, framework, or API — **read its official documentation**. Do NOT rely on training data. Verify every method, parameter, and behavior.

Key docs:
- aiogram: https://docs.aiogram.dev + GitHub source
- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
- FastAPI: https://fastapi.tiangolo.com
- SQLAlchemy 2.x async: https://docs.sqlalchemy.org/en/20/
- TipTap: https://tiptap.dev/docs
- Dishka: https://dishka.readthedocs.io
- @telegram-apps/sdk-react: https://docs.telegram-mini-apps.com

If uncertain — **search the web or read source code**. NEVER guess.

### Python Virtual Environment

ALWAYS use uv for Python. uv creates .venv automatically inside backend/ on `uv sync`.
NEVER use `pip install` globally. NEVER use `python` directly — use `uv run python`, `uv run pytest`, `uv run alembic`.
All Python commands must run through `uv run` to ensure the correct virtual environment.

### If You Don't Know — ASK

Do not proceed with assumptions. Present options with tradeoffs. NEVER invent API methods or behaviors.

### 200 Lines Per File Maximum

No exceptions. Split immediately when approaching the limit. Every React component, hook, service, repository, model — its own file.

### Zero Duplication

Before writing new code, **grep the entire codebase** for existing implementations. Extract shared logic.

### Zero Dead Code

No commented-out code, unused imports, unused variables, TODOs without issue references. Run linters after every change.

### Zero Hardcoding

All config via env vars (`config.py` / `import.meta.env.VITE_*`). All colors via `var(--v2-*)` CSS tokens. Never a raw hex in a component.

### Three Layers (Backend)

Handlers/Routes → Services → Repositories. No business logic in handlers. No DB queries outside repositories.

### Read Before Edit

Read the entire file before modifying. Read all importers/callers before changing an interface. Check cross-references after changes.

### Reference Files

When given reference files from another project (e.g. flowvy_desktop), READ EVERY LINE before implementing. Do not paraphrase, rename, or "improve" labels, hints, descriptions, or UX patterns from the reference. Replicate the content exactly, adapt only the layout for the target platform. After implementing, re-read the reference file and diff your output against it — every label, every hint, every prop must match unless explicitly told otherwise.

### Test After Every Change

```bash
cd backend && uv run pytest -x -v
cd frontend && pnpm test
cd frontend && pnpm build  # type-check
```

For UI changes: use Playwright MCP tools to verify visually. Do not skip this.

**Playwright MCP workflow:**
1. `browser_navigate` to `http://localhost:5173` + target page path
2. `browser_take_screenshot` (fullPage: true) — visually verify layout, colors, text
3. `browser_snapshot` — get element refs for interaction
4. `browser_click` / `browser_type` — test interactive elements (buttons, inputs, toggles)
5. `browser_take_screenshot` — verify state after interaction
6. Repeat for each screen/state that changed

**What to check:** correct labels, spacing, colors match `var(--v2-*)` tokens, no overlapping elements, responsive width, dark theme rendering, interactive states (hover, focus, disabled).

### Type Safety

Python: type hints on all signatures. `from __future__ import annotations`. No untyped `# type: ignore`.
TypeScript: strict mode. No `any`. No `as` assertions without comment. No `@ts-ignore`.

### Async Only (Backend)

No sync I/O. No `requests` — use `httpx.AsyncClient`. No `time.sleep` — use `asyncio.sleep`.

### i18n

All user-facing strings MUST use react-i18next: `t('domain.key')` in components, `i18n.t('key')` in non-React files.
NEVER hardcode English strings in JSX, placeholders, aria-labels, error messages, button labels.
Keys follow dot notation grouped by domain: `common.*`, `home.*`, `devices.*`, `pulse.*`, `settings.*`, `admin.*`, `format.*`.
Interpolation uses double braces: `t('key', { var: value })` → `{{var}}` in en.json.
Locale files: `frontend/src/i18n/locales/en.json`.
When adding new UI strings, add the key to en.json FIRST, then use `t()` in the component.

## Code Style

**Python**: `ruff check --fix . && ruff format .` — stdlib → third-party → local imports. `snake_case` functions, `PascalCase` classes. Google-style docstrings on all public functions.

**TypeScript**: `pnpm biome check --fix .` — `interface` for object shapes. Named exports. Props as `{Name}Props`.

## Git

Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`. One logical change per commit. Meaningful messages.

## When Compacting

Preserve: modified files list, task status, remaining steps, architectural decisions from this session.
