# Development Environment

## Architecture (Dev)

```
┌──────────────┐     ┌─────────────────┐
│  Your Phone  │────▶│  ngrok tunnel   │
│  (Telegram)  │     │  (HTTPS → local)│
└──────────────┘     └──┬──────────┬───┘
                        │          │
                 ┌──────▼───┐ ┌───▼──────────┐
                 │ Vite dev │ │ FastAPI+Bot  │
                 │ :5173    │ │ :8001        │
                 │ (HMR)   │ │ (uvicorn)    │
                 └──────────┘ └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │ Docker       │
                              │ PostgreSQL   │
                              │ Redis        │
                              └──────────────┘
```

No nginx in dev. No Docker for backend or frontend. Only PostgreSQL and Redis in containers.

## Prerequisites

- Python 3.12+ with uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Node.js 22+ with pnpm: `npm install -g pnpm`
- Docker + Docker Compose (for PostgreSQL, Redis)
- ngrok account (free tier) with auth token
- Telegram account in **test environment** (see below)
- Playwright for visual testing: `npx playwright install chromium`

## Initial Setup

```bash
# 1. Clone and enter
git clone <repo> flowvy && cd flowvy

# 2. Start DB and cache
docker compose -f docker-compose.dev.yml up -d

# 3. Backend setup
cd backend
uv sync                          # install Python deps
cp .env.example .env             # fill in BOT_TOKEN, DB credentials
uv run alembic upgrade head      # apply migrations
uv run python -m flowvy          # start backend on :8001

# 4. Frontend setup (new terminal)
cd frontend
pnpm install
cp .env.example .env             # set VITE_API_URL
pnpm dev                         # Vite dev server on :5173

# 5. ngrok tunnel (new terminal)
ngrok http 5173                  # tunnel to frontend
# Copy the HTTPS URL (e.g. https://abc123.ngrok-free.app)

# 6. Set Mini App URL in BotFather
# Message @BotFather on TEST environment → /setmenubutton → paste ngrok URL
```

## docker-compose.dev.yml

Only infrastructure services. Backend and frontend run natively for hot reload.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: flowvy
      POSTGRES_USER: flowvy
      POSTGRES_PASSWORD: flowvy_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

## Telegram Test Environment

The test environment allows HTTP URLs for Mini Apps (production requires HTTPS).

**iOS**: Settings → tap 10 times fast → Accounts → Login to another account → Test
**Desktop**: Side menu → hold Shift+Alt → right-click "Add Account" → Test Server
**macOS**: Settings icon → tap 10 times → hold Cmd → click "Add Account"

Create a new account in test env, then create a new bot via @BotFather in test env.

## ngrok Setup

```bash
# One-time auth
ngrok config add-authtoken <your-token>

# For frontend (Mini App)
ngrok http 5173

# For backend webhook (separate terminal if needed)
ngrok http 8000
```

With ngrok free tier you get a random URL that changes on restart. Paid tier gives a static domain.

After starting ngrok, update:
1. BotFather: /setmenubutton → new ngrok URL (frontend)
2. Bot webhook: backend sets this automatically on startup using env var `WEBHOOK_URL`

## Playwright Visual Testing

Claude Code uses Playwright MCP to visually verify frontend changes.

Setup (one-time in Claude Code):
```
claude mcp add playwright npx @playwright/mcp@latest
```

Then Claude can:
- Navigate to `http://localhost:5173`
- Take screenshots of any page
- Click elements, fill forms
- Verify layout across viewports (mobile, tablet, desktop)
- Compare screenshots for visual regression

## Environment Variables

### Backend (.env)
```
BOT_TOKEN=<from BotFather>
WEBHOOK_URL=<ngrok backend URL>/webhook
DATABASE_URL=postgresql+asyncpg://flowvy:flowvy@localhost:5432/flowvy
REDIS_URL=redis://localhost:6379/0
REMNAWAVE_URL=<your Remnawave panel URL, e.g. https://panel.example.com>
REMNAWAVE_API_TOKEN=<generate in Remnawave: Settings → API Tokens>
SUPPORT_URL=
RENEW_URL=
DEBUG=true
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8001/api
VITE_BOT_USERNAME=<your test bot username>
VITE_MOCK_AUTH=true
VITE_DEBUG_TELEGRAM_ID=<your Telegram ID from Remnawave panel>
```

## Debug Mode (without Telegram)

When `VITE_MOCK_AUTH=true`, the app bypasses Telegram authentication with a mock admin user. To see **real Remnawave data** without running inside Telegram:

1. Set `VITE_DEBUG_TELEGRAM_ID` in `frontend/.env` to a Telegram ID that exists in your Remnawave panel
2. Ensure `DEBUG=true` in `backend/.env`
3. The frontend will call `GET /api/debug/subscription/{telegramId}` instead of the auth-protected endpoint

This debug endpoint is disabled when `DEBUG=false` and returns 404. Never expose it in production.

If `VITE_DEBUG_TELEGRAM_ID` is not set, the hook falls back to the regular `GET /api/me/subscription` (requires Telegram initData).

## Hot Reload

- **Frontend**: Vite HMR — save file → see changes instantly in Telegram WebView (pull down to refresh if needed)
- **Backend**: uvicorn `--reload` flag — save file → server restarts automatically
- **No rebuild needed** for either during development
