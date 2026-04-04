# Flowvy Architecture

## Overview

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│  Telegram    │────▶│  ngrok (dev) │────▶│  Vite :5173       │
│  Mini App    │     │  nginx (prod)│     │  React 19 + TS    │
└─────────────┘     └──────┬───────┘     │  TanStack Query   │
                           │             │  TanStack Router   │
┌─────────────┐     ┌──────▼───────┐     └────────┬──────────┘
│  Telegram    │────▶│  FastAPI     │              │
│  Bot API     │     │  :8001       │◀─────────────┘
└─────────────┘     │  (webhook +  │     /api/* requests
                    │   REST API)  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌─────▼──────┐
       │ PostgreSQL  │ │Redis │ │ Remnawave  │
       │ (users,     │ │(cache│ │ API        │
       │  sessions)  │ │ FSM) │ │ (VPN panel)│
       └─────────────┘ └──────┘ └────────────┘
```

## Monorepo Structure

```
flowvy/
├── CLAUDE.md
├── docker-compose.dev.yml        # PostgreSQL + Redis only
├── .claude/
│   ├── settings.json
│   ├── skills/{backend,frontend,integrations}/SKILL.md
│   └── commands/{plan,verify}.md
├── docs/
│   ├── ARCHITECTURE.md           # this file
│   ├── DEV_ENVIRONMENT.md        # local dev setup
│   ├── FIRST_TASK.md             # Claude Code onboarding
│   └── api-remnawave.json        # full Remnawave OpenAPI spec (reference)
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── migrations/
│   └── src/flowvy/
│       ├── __main__.py           # uvicorn entrypoint
│       ├── config.py             # pydantic-settings
│       ├── di.py                 # Dishka providers
│       ├── bot/
│       │   ├── factory.py        # create_bot(), create_dispatcher()
│       │   └── handlers/         # /start, admin commands
│       ├── api/
│       │   ├── factory.py        # create_app(), webhook route, lifespan
│       │   ├── deps.py           # get_current_init_data()
│       │   └── routes/
│       │       ├── health.py     # GET /api/health
│       │       ├── users.py      # GET /api/me
│       │       ├── subscription.py  # GET /api/me/subscription
│       │       ├── devices.py    # GET/DELETE /api/me/devices
│       │       ├── nodes.py      # GET /api/nodes
│       │       └── admin/        # /api/admin/*
│       ├── services/
│       │   ├── user.py
│       │   ├── remnawave.py      # RemnawaveClient
│       │   └── cache.py          # Redis cache helpers
│       ├── repositories/
│       │   ├── base.py           # generic CRUD
│       │   ├── user.py
│       │   ├── subscription.py
│       │   └── invite.py
│       ├── models/               # SQLAlchemy ORM
│       │   ├── base.py, user.py, subscription.py, invite.py
│       └── schemas/              # Pydantic v2
│           ├── user.py
│           └── remnawave.py      # response models from Remnawave
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── biome.json
│   └── src/
│       ├── main.tsx
│       ├── app.tsx               # AuthGuard → ModeProvider → RouterProvider
│       ├── router.ts             # TanStack Router, 8 routes
│       ├── styles/
│       │   ├── tokens.css        # Flowvy design tokens (--v2-*)
│       │   └── global.css
│       ├── lib/
│       │   ├── api.ts            # fetch wrapper, Authorization: tma header
│       │   ├── telegram.ts       # @telegram-apps/sdk-react init
│       │   ├── query.ts          # QueryClient config, query keys
│       │   └── format.ts         # formatTraffic, getDaysLeft, etc.
│       ├── hooks/
│       │   ├── use-auth.ts
│       │   ├── use-subscription.ts  # TanStack Query → /api/me/subscription
│       │   ├── use-devices.ts       # TanStack Query → /api/me/devices
│       │   └── use-nodes.ts         # TanStack Query → /api/nodes
│       ├── contexts/
│       │   └── mode-context.tsx  # user/admin mode switch
│       ├── components/
│       │   ├── ui/               # StatusBadge, icons
│       │   ├── home/             # HeroCard, DetailSections
│       │   └── layout/           # AppShell, Header, TabBar
│       ├── pages/
│       │   ├── home.tsx, pulse.tsx, devices.tsx, support.tsx
│       │   └── admin/
│       └── types/
│           └── subscription.ts
```

## Remnawave Integration

### Connection

Configured via environment variables:
```
REMNAWAVE_URL=https://panel.example.com
REMNAWAVE_API_TOKEN=<api-token>
```

Validated on backend startup: `GET /api/auth/status`. If Remnawave is unreachable — backend refuses to start.

### User Mapping

Telegram user → Remnawave user:
1. initData provides `telegram_id`
2. Backend calls `GET /api/users/by-telegram-id/{telegramId}`
3. Response is an **array** — we take `response[0]`
4. If empty array — user has no Remnawave account ("No active subscription")
5. `remnawave_uuid` saved in our DB for subsequent calls

**Constraint**: one telegram_id = one Remnawave user. Enforced by provider when creating users.

### Caching Strategy

**Per-user data (subscription, devices)** — NO cache. Every request goes directly to Remnawave. 50-100ms latency is acceptable for a dashboard. User always sees current state.

**Global data (nodes, system stats)** — Redis cache:
- Nodes: 30 second TTL
- System stats / bandwidth: 60 second TTL
- Webhook events from Remnawave (`node.connection_lost`) invalidate cache immediately

**Remnawave unavailable** — frontend shows maintenance screen for users, error details for admins. No stale data served.

**Manual refresh** — button sends `?force=true`, backend bypasses cache.

### Endpoints Used (22 for MVP)

See `skills/integrations/SKILL.md` for full API reference.

## BFF Pattern (Backend-for-Frontend)

Our FastAPI does NOT proxy Remnawave 1:1. It aggregates data per screen.

| Mini App Screen | Our Endpoint | Remnawave Calls |
|----------------|-------------|-----------------|
| Home | `GET /api/me/subscription` | `by-telegram-id` → `sub/{shortUuid}/info` |
| Devices | `GET /api/me/devices` | `hwid/devices/{userUuid}` |
| Pulse | `GET /api/nodes` | `nodes` (cached 30s) |
| Admin Dashboard | `GET /api/admin/stats` | `system/stats` + `stats/bandwidth` (cached 60s) |
| Admin Users | `GET /api/admin/users` | `users?size=N&start=N` |

One screen = one HTTP request to our backend. Backend does the aggregation.

## TanStack Query (Frontend)

### Request Deduplication

Multiple components using the same `queryKey` share one request. If Home and a modal both need subscription data — only one fetch happens.

### Query Keys

All keys centralized in `lib/query.ts`:
```typescript
export const queryKeys = {
  subscription: ['subscription'] as const,
  devices: ['devices'] as const,
  nodes: ['nodes'] as const,
  adminStats: ['admin', 'stats'] as const,
  adminUsers: (page: number) => ['admin', 'users', page] as const,
};
```

### Freshness

| Data | staleTime | gcTime | Why |
|------|-----------|--------|-----|
| Subscription | 0 | 5 min | Always refetch on mount |
| Devices | 0 | 5 min | Always refetch on mount |
| Nodes | 30s | 5 min | Shared, changes slowly |
| Admin stats | 60s | 5 min | Aggregates, not critical |
| Admin users | 0 | 5 min | Admin manages, needs fresh |

### Invalidation After Mutations

```typescript
// After deleting a device:
queryClient.invalidateQueries({ queryKey: queryKeys.devices });
queryClient.invalidateQueries({ queryKey: queryKeys.subscription }); // device count changed
```

### v5 API Notes

- `gcTime` (not `cacheTime`)
- `isPending` (not `isLoading`)
- No `onError`/`onSuccess` in useQuery — use `useEffect`
- Single object parameter: `useQuery({ queryKey, queryFn })`

## Authentication Flow (Mini App)

1. Mini App opens → Telegram injects `initData`
2. Frontend sends `Authorization: tma <initData>` header
3. Backend validates HMAC via `aiogram.utils.web_app.safe_parse_webapp_init_data()`
4. Checks `auth_date` freshness (TTL configurable, default 24h)
5. Extracts `telegram_id` → `get_or_create` user in DB
6. Returns `UserResponse` with role

## aiogram + FastAPI Webhook

```python
@app.post("/webhook")
async def webhook(request: Request) -> Response:
    result = await dp.feed_webhook_update(bot=bot, update=await request.json())
    if result:
        return Response(content=result.model_dump_json(), media_type="application/json")
    return Response(status_code=200)
```

Lifespan: `bot.set_webhook()` + `dp.emit_startup()` on start, `dp.emit_shutdown()` + `bot.session.close()` on shutdown.

## Dependency Injection (Dishka)

- `APP` scope: Settings, AsyncEngine, Redis, httpx.AsyncClient, RemnawaveClient
- `REQUEST` scope: AsyncSession, repositories, services

## Mini App Modes

- **User mode**: Home, Pulse, Devices, Support (4 tabs)
- **Admin mode**: Dashboard, Users, Broadcast, Settings (4 tabs)
- Toggle in header, visible only for `role=ADMIN`
- Mode switch navigates to first tab of new mode
