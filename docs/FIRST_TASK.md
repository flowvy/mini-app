# First Task for Claude Code

Copy this as your first prompt after opening Claude Code in the repo with CLAUDE.md:

---

```
/plan

Read @docs/ARCHITECTURE.md and @docs/DEV_ENVIRONMENT.md fully before doing anything.

Create the project skeleton that starts and runs locally. Specifically:

BACKEND (backend/):
- pyproject.toml: dependencies (aiogram, fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, alembic, redis, dishka, pydantic-settings, httpx, structlog, ruff), Python 3.12+, ruff config
- src/flowvy/__init__.py, __main__.py: entrypoint that starts FastAPI with uvicorn on :8000 in reload mode
- src/flowvy/config.py: pydantic-settings model loading from .env (BOT_TOKEN, DATABASE_URL, REDIS_URL, WEBHOOK_URL, DEBUG)
- src/flowvy/di.py: Dishka container with providers for db engine, async session, redis
- src/flowvy/api/factory.py: create_app() returning FastAPI instance
- src/flowvy/api/routes/health.py: GET /api/health returning {"status": "ok", "version": "0.1.0"}
- src/flowvy/bot/factory.py: create_bot() and create_dispatcher() with one router
- src/flowvy/bot/handlers/start.py: /start handler that replies with a greeting and web_app menu button
- src/flowvy/models/base.py: SQLAlchemy DeclarativeBase
- alembic.ini + migrations/env.py configured for async
- .env.example with all vars documented
- One pytest test for health endpoint

FRONTEND (frontend/):
- package.json with: react, react-dom, typescript, vite, @telegram-apps/sdk-react, biome
- vite.config.ts
- biome.json
- index.html with telegram-web-app.js script
- src/main.tsx: init Telegram SDK, render App
- src/app.tsx: simple layout with "Flowvy" title, theme detection, ready() call
- src/styles/tokens.css: (I will provide this file — use placeholder for now)
- src/styles/global.css: basic reset using token vars
- src/lib/telegram.ts: WebApp initialization helper
- .env.example

INFRA:
- docker-compose.dev.yml: PostgreSQL 16 + Redis 7 only (NO backend, NO frontend, NO nginx)
- .gitignore for Python + Node + env files

After creating files, run:
1. docker compose -f docker-compose.dev.yml up -d
2. cd backend && uv sync && uv run alembic upgrade head
3. cd frontend && pnpm install
4. cd backend && uv run python -m flowvy (verify it starts)
5. cd frontend && pnpm dev (verify it starts)
6. Use Playwright MCP to open http://localhost:5173 and screenshot the page
7. Run tests: cd backend && uv run pytest -x -v

Report results of each step. Fix any errors before reporting done.
```

---

## After the skeleton works:

Session 2: `Models + migrations (User, Subscription, Invite) + repositories + basic CRUD`
Session 3: `initData auth middleware + /api/me endpoint + frontend auth flow`
Session 4: `Home page with real API data + Playwright visual verification`
Session 5: `Remnawave API client + server list + subscription status`
...and so on, one feature per session.

Always start each session with `/plan`, end with `/verify`.
