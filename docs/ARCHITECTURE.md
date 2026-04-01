# Flowvy Architecture

## Overview

```
┌─────────────┐     ┌──────────────────────────────────────┐     ┌────────────┐
│  Telegram    │────▶│  nginx (TLS, reverse proxy, static)  │     │ PostgreSQL │
│  User/Admin  │     └──────┬──────────────┬────────────────┘     └─────▲──────┘
└─────────────┘            │              │                           │
                    ┌──────▼──────┐ ┌─────▼──────────┐         ┌─────┴──────┐
                    │ FastAPI     │ │ React Mini App │         │ SQLAlchemy │
                    │ (webhook +  │ │ (static build) │         │ async      │
                    │  REST API)  │ └────────────────┘         └────────────┘
                    └──────┬──────┘                                  ▲
                           │                                         │
                    ┌──────▼──────┐     ┌───────────┐         ┌─────┴──────┐
                    │ aiogram 3.x │     │   Redis   │────────▶│  Dishka DI │
                    │ (bot logic) │     │ (FSM,cache)│         │ container  │
                    └─────────────┘     └───────────┘         └────────────┘
```

## Monorepo Structure

```
flowvy/
├── CLAUDE.md
├── docker-compose.yml
├── .claude/
│   ├── settings.json
│   ├── skills/
│   │   ├── backend/SKILL.md
│   │   ├── frontend/SKILL.md
│   │   └── integrations/SKILL.md
│   └── commands/
│       └── plan.md
├── docs/
│   ├── ARCHITECTURE.md          # this file
│   └── API.md                   # REST API contracts (Mini App ↔ backend)
├── backend/
│   ├── pyproject.toml           # uv project, ruff config
│   ├── alembic.ini
│   ├── migrations/
│   │   └── versions/
│   └── src/
│       └── flowvy/
│           ├── __init__.py
│           ├── __main__.py      # entrypoint: uvicorn
│           ├── config.py        # pydantic-settings, env vars
│           ├── di.py            # Dishka providers
│           │
│           ├── bot/             # aiogram layer
│           │   ├── __init__.py
│           │   ├── factory.py   # create_bot(), create_dispatcher()
│           │   ├── middlewares/
│           │   │   ├── auth.py      # invite-only check
│           │   │   ├── db.py        # inject db session
│           │   │   └── throttle.py
│           │   ├── handlers/
│           │   │   ├── __init__.py   # include_routers()
│           │   │   ├── start.py
│           │   │   ├── admin/
│           │   │   └── user/
│           │   ├── keyboards/
│           │   ├── filters/
│           │   └── callbacks/
│           │
│           ├── api/             # FastAPI layer (Mini App backend)
│           │   ├── __init__.py
│           │   ├── factory.py   # create_app()
│           │   ├── deps.py      # FastAPI dependencies (auth, db)
│           │   ├── middleware/
│           │   │   └── telegram_auth.py  # initData validation
│           │   └── routes/
│           │       ├── __init__.py
│           │       ├── users.py
│           │       ├── subscriptions.py
│           │       ├── broadcast.py
│           │       ├── servers.py
│           │       └── webhooks/
│           │           ├── uptime_kuma.py
│           │           └── remnawave.py
│           │
│           ├── services/        # business logic
│           │   ├── broadcast.py     # message builder + sender
│           │   ├── subscription.py
│           │   ├── user.py
│           │   ├── monitoring.py    # VictoriaMetrics + cAdvisor queries
│           │   └── remnawave.py     # Remnawave API client
│           │
│           ├── repositories/    # data access
│           │   ├── base.py
│           │   ├── user.py
│           │   └── subscription.py
│           │
│           ├── models/          # SQLAlchemy ORM
│           │   ├── base.py      # DeclarativeBase
│           │   ├── user.py
│           │   ├── subscription.py
│           │   ├── broadcast.py
│           │   └── invite.py
│           │
│           └── schemas/         # Pydantic v2 schemas
│               ├── user.py
│               ├── broadcast.py
│               └── webhook.py
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── biome.json
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── app.tsx
│       ├── styles/
│       │   ├── tokens.css       # Flowvy design tokens
│       │   └── global.css
│       ├── lib/
│       │   ├── api.ts           # fetch wrapper, auth
│       │   ├── telegram.ts      # WebApp SDK init, initData
│       │   └── utils.ts
│       ├── hooks/
│       │   ├── use-auth.ts
│       │   ├── use-api.ts       # TanStack Query wrappers
│       │   └── use-theme.ts
│       ├── components/
│       │   ├── ui/              # shadcn-style primitives (button, input, modal, etc.)
│       │   ├── broadcast/       # message composer, emoji picker, keyboard builder
│       │   └── layout/          # shell, nav, header
│       ├── pages/
│       │   ├── home.tsx
│       │   ├── servers.tsx
│       │   ├── account.tsx
│       │   └── admin/
│       │       ├── dashboard.tsx
│       │       ├── broadcast.tsx
│       │       ├── users.tsx
│       │       └── promo.tsx
│       └── types/
│           └── index.ts
│
└── nginx/
    └── default.conf
```

## Key Patterns

### Dependency Injection (Dishka)

All services, repositories, and API clients are wired through Dishka. Providers define scope:
- `APP` scope: DB engine, Redis pool, HTTP clients (created once)
- `REQUEST` scope: DB session, repositories, services (per request/update)

This enables testability (swap providers in tests) and modularity (add new integrations as new providers).

### Authentication Flow (Mini App)

1. Mini App opens → Telegram injects `initData` into WebApp
2. Frontend sends `initData` in `Authorization: tg <initData>` header
3. Backend validates HMAC signature using bot token (see Telegram docs)
4. Extracts `user_id`, resolves role from DB
5. Returns JWT for subsequent requests (short-lived, refreshed via initData)

### Broadcast System

1. Admin composes message in Mini App (TipTap editor + attachments + buttons)
2. Frontend POSTs to `/api/broadcast` with structured payload:
   ```json
   {
     "content": { "text": "...", "entities": [...] },
     "media": { "type": "photo", "file_id": "..." },
     "keyboard": { "inline_keyboard": [[...]] },
     "recipients": { "type": "all" | "segment" | "ids", ... },
     "scheduled_at": null
   }
   ```
3. Backend validates, creates BroadcastTask in DB
4. Worker picks up task, iterates over recipients, calls Bot API with rate limiting
5. Progress tracked in DB, reportable via API

### Integration Webhooks

All external webhooks land at `/api/webhooks/<service>`. Each has a dedicated route + schema:
- **Uptime Kuma**: POST with `{heartbeat, monitor, msg}` → parse → notify admins
- **Remnawave**: event-based hooks → sync user state

### Monitoring Queries

VictoriaMetrics is Prometheus-compatible. Queries via HTTP:
```
GET /api/v1/query?query=<promql>
GET /api/v1/query_range?query=<promql>&start=<ts>&end=<ts>&step=<duration>
```

cAdvisor exposes `/metrics` (Prometheus format) and REST API at `/api/v2.0/stats/<container>`.

Both are queried from `MonitoringService` on backend, results cached in Redis (60s TTL).
