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
│       │   ├── factory.py        # create_app(), webhook route, lifespan, metrics task
│       │   ├── deps.py           # get_current_init_data() + last_seen tracking
│       │   ├── middleware.py     # MetricsMiddleware (request counters)
│       │   └── routes/
│       │       ├── health.py     # GET /api/health
│       │       ├── users.py      # GET /api/me
│       │       ├── subscription.py  # GET /api/me/subscription
│       │       ├── devices.py    # GET/DELETE /api/me/devices
│       │       ├── nodes.py      # GET /api/nodes
│       │       ├── pulse.py      # GET /api/pulse (Uptime Kuma status)
│       │       ├── webhooks.py   # POST /api/webhooks/remnawave (HMAC auth)
│       │       └── admin/        # /api/admin/*
│       │           ├── deps.py      # get_current_admin, CurrentAdmin
│       │           ├── dashboard.py  # GET /api/admin/dashboard
│       │           ├── settings.py  # GET/PATCH /api/admin/settings, kuma test
│       │           └── users.py     # GET /api/admin/users, search
│       ├── services/
│       │   ├── user.py
│       │   ├── remnawave.py      # RemnawaveClient (+get_metadata, +system stats)
│       │   ├── kuma.py           # UptimeKumaClient (public status page API)
│       │   ├── subscription.py   # SubscriptionService (BFF + DB upsert)
│       │   ├── admin_users.py     # AdminUsersService (list, search, actions, squad resolution)
│       │   ├── devices.py        # DevicesService (BFF, DB read + Remnawave)
│       │   ├── pulse.py          # PulseService (Kuma aggregation + Redis cache)
│       │   ├── provider_settings.py  # ProviderSettingsService (CRUD + kuma test)
│       │   ├── bot_stats.py      # BotStatsService (psutil, DB counts, Redis)
│       │   ├── dashboard.py      # DashboardService (aggregates both providers)
│       │   ├── metrics_collector.py  # background task (flush last_seen, record snapshots)
│       │   ├── cache.py          # Redis cache helpers
│       │   └── webhook_handler.py  # WebhookHandlerService (verify, persist, dispatch)
│       ├── repositories/
│       │   ├── base.py           # generic CRUD
│       │   ├── user.py
│       │   ├── subscription.py   # upsert_from_remnawave
│       │   ├── provider_settings.py  # singleton get/update
│       │   ├── invite.py
│       │   └── webhook_event.py  # WebhookEventRepository (save)
│       ├── models/               # SQLAlchemy ORM
│       │   ├── base.py, user.py, subscription.py, invite.py
│       │   ├── bot_metrics.py    # BotMetricsHistory (periodic snapshots)
│       │   ├── provider_settings.py  # singleton runtime config
│       │   └── webhook_event.py  # WebhookEvent (Remnawave webhook log)
│       └── schemas/              # Pydantic v2
│           ├── user.py           # UserResponse + FeaturesResponse
│           ├── devices.py        # DeviceResponse, DevicesResponse
│           ├── subscription.py   # SubscriptionResponse
│           ├── pulse.py          # PulseResponse, PulseGroup, PulseMonitor
│           ├── provider_settings.py  # ProviderSettingsResponse/Patch
│           ├── admin_users.py    # AdminUserResponse, AdminUsersResponse
│           ├── dashboard.py      # DashboardResponse, BotStatsResponse
│           ├── remnawave.py      # response models from Remnawave
│           └── webhooks.py       # WebhookPayload
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
│       │   ├── use-nodes.ts         # TanStack Query → /api/nodes
│       │   ├── use-pulse.ts         # TanStack Query → /api/pulse
│       │   ├── use-admin-settings.ts # TanStack Query → /api/admin/settings
│       │   └── use-admin-users.ts   # TanStack Query → /api/admin/users
│       ├── contexts/
│       │   └── mode-context.tsx  # user/admin mode switch
│       ├── components/
│       │   ├── ui/               # StatusBadge, icons, Toggle, InputField, ActionBtn, ConfirmDialog
│       │   ├── home/             # HeroCard, DetailSections
│       │   ├── devices/          # DeviceRow, PlatformIcon
│       │   ├── pulse/            # StatusBanner, HeartbeatBar, MonitorRow, MonitorGroup
│       │   ├── admin/            # KumaConfig, QuickLinks, UserRow
│       │   └── layout/           # AppShell, Header, TabBar
│       ├── pages/
│       │   ├── home.tsx, pulse.tsx, devices.tsx, support.tsx
│       │   └── admin/
│       └── types/
│           ├── subscription.ts
│           ├── devices.ts
│           ├── pulse.ts
│           ├── admin-settings.ts
│           └── admin-users.ts
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

### Local DB Sync (Subscription Upsert)

When `SubscriptionService.get_for_user()` fetches data from Remnawave, it upserts into our `subscriptions` table:
- `remnawave_uuid`, `status`, `device_limit`, `expires_at`
- Keyed by `user_id` (telegram_id) + `remnawave_uuid`

This enables `DevicesService` to read `remnawave_uuid` and `device_limit` from local DB without an extra Remnawave call. If the user visits Devices before Home (subscription not yet cached), DevicesService falls back to `get_user_by_telegram_id`, saves, then proceeds.

**Scope change**: `SubscriptionService` and `DevicesService` are REQUEST-scoped (need DB session). `RemnawaveClient` stays APP-scoped.

### Caching Strategy

**Per-user data (subscription, devices)** — NO cache. Every request goes directly to Remnawave. 50-100ms latency is acceptable for a dashboard. User always sees current state.

**Global data (nodes, system stats)** — Redis cache:
- Nodes: 30 second TTL
- Pulse (Kuma status): 60 second TTL (key `pulse:data`)
- External squads: 300 second TTL (key `external_squads`)
- Dashboard Remnawave stats: 30 second TTL (key `dashboard:remnawave`)
- Bot request counters: `bot:requests:total`, `bot:requests:{YYYY-MM-DD}` (no TTL, cumulative)
- Bot last seen: `bot:last_seen` hash (flushed to DB every N minutes)
- Webhook events from Remnawave (`node.connection_lost`) invalidate cache immediately

**Remnawave unavailable** — frontend shows maintenance screen for users, error details for admins. No stale data served.

**Manual refresh** — button sends `?force=true`, backend bypasses cache.

### Webhooks

Remnawave sends event webhooks to `POST /api/webhooks/remnawave`. Auth via HMAC-SHA256 signature (no JWT).

**Config**: `REMNAWAVE_WEBHOOK_SECRET` env var → `Settings.remnawave_webhook_secret`. If not set — endpoint returns 404.

**Verification**: `X-Remnawave-Signature` header contains HMAC-SHA256 of the raw body using the shared secret. Compared with `hmac.compare_digest()`.

**Payload**: `{ scope, event, timestamp, data }` — persisted to `webhook_events` table for audit/replay.

**Event flow**:
```
Remnawave → POST /api/webhooks/remnawave
  → verify HMAC signature
  → parse WebhookPayload
  → save to webhook_events (DB)
  → dispatch to handlers by scope
```

**Handler registry**: `WebhookHandlerService` maps scope → handler list. MVP handlers:
- `user.*` / `user_hwid_devices.*` — invalidate `dashboard:remnawave` cache on mutating events (modified, deleted, traffic_reset, revoked, enabled, disabled)
- `node.*` — invalidate `pulse:data` cache on any node event

Cache keys imported from `DashboardService.CACHE_KEY` and `PulseService.CACHE_KEY` — single source of truth.

**Scopes/events**: user, node, user_hwid_devices, service, crm. Full list in `skills/integrations/SKILL.md`.

### Endpoints Used (22 for MVP)

See `skills/integrations/SKILL.md` for full API reference.

## BFF Pattern (Backend-for-Frontend)

Our FastAPI does NOT proxy Remnawave 1:1. It aggregates data per screen.

| Mini App Screen | Our Endpoint | Remnawave Calls |
|----------------|-------------|-----------------|
| Home | `GET /api/me/subscription` | `by-telegram-id` → `sub/{shortUuid}/info` + DB upsert |
| Devices | `GET /api/me/devices` | DB read → `hwid/devices/{userUuid}` (fallback: `by-telegram-id` + DB upsert) |
| Pulse | `GET /api/pulse` | Kuma: `status-page/{slug}` + `heartbeat/{slug}` (cached 60s) |
| Admin Dashboard | `GET /api/admin/dashboard` | `system/stats` + `system/stats/bandwidth` (cached 30s) + bot metrics (DB + Redis) |
| Admin Users | `GET /api/admin/users` | `users?size=N&start=N` + `external-squads` (cached) |
| Admin Users Search | `GET /api/admin/users/search?q=` | `by-username`, `by-telegram-id`, or `by-email` + `external-squads` (cached) |
| Admin User Actions | `POST /api/admin/users/{uuid}/{action}` | `users/{uuid}/actions/{action}` |
| Admin User Delete | `DELETE /api/admin/users/{uuid}` | `DELETE users/{uuid}` |
| Admin Settings | `GET/PATCH /api/admin/settings` | `system/metadata` (version) |

One screen = one HTTP request to our backend. Backend does the aggregation.

## Provider Settings

Singleton table `provider_settings` (id=1) stores runtime-configurable settings:
- `kuma_enabled`, `kuma_url`, `kuma_slug` — Uptime Kuma integration
- `support_url`, `renew_url` — user-facing links (injected into subscription response at route level)

### Admin Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/settings` | Read settings + Remnawave version |
| PATCH | `/api/admin/settings` | Partial update (toggles auto-save, sub-screen save) |
| GET | `/api/admin/settings/kuma/test` | Test Kuma connection |

Admin auth: `get_current_admin` dependency validates Telegram initData + checks `user.role == ADMIN`.

### Admin User Actions

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/users/{uuid}/enable` | Enable user |
| POST | `/api/admin/users/{uuid}/disable` | Disable user |
| POST | `/api/admin/users/{uuid}/reset-traffic` | Reset traffic counters |
| POST | `/api/admin/users/{uuid}/revoke` | Revoke subscription link |
| DELETE | `/api/admin/users/{uuid}` | Permanently delete user |

All routes proxy to Remnawave `users/{uuid}/actions/*` endpoints. Admin auth required.

### External Squads Resolution

`AdminUsersService` resolves `externalSquadUuid` → squad name via `GET /api/external-squads`.
Result cached in Redis (key `external_squads`, 5 minute TTL). The resolved name is returned as
`externalSquadName` in `AdminUserResponse`.

### Feature Flags

`GET /api/me` returns `features: { pulse: bool }` read from `provider_settings.kuma_enabled`.
Frontend TabBar conditionally renders the Pulse tab based on `user.features.pulse`.

## Admin Dashboard

`GET /api/admin/dashboard` aggregates two metric providers into one response:

### Remnawave Stats (proxied raw)

- `GET /api/system/stats` → CPU, memory, uptime, user status counts, online stats, nodes
- `GET /api/system/stats/bandwidth` → bandwidth by period (2 days, 7 days, 30 days, calendar month, year)
- Both cached in Redis (key `dashboard:remnawave`, TTL 30s)
- Returns raw `dict` — no Pydantic models, structure may change upstream

### Bot Stats (own metrics)

**System**: `psutil` CPU cores, memory, app uptime, version.
**Users**: DB counts — total, new today, new this week, active 1h, active 24h.
**Requests**: Redis counters — `bot:requests:total`, `bot:requests:{YYYY-MM-DD}`.

### Bot Metrics Collection

**Request counting** — `MetricsMiddleware` runs on every HTTP request:
- `INCR bot:requests:total`
- `INCR bot:requests:{YYYY-MM-DD}`

**User activity tracking** — `get_current_init_data` auth dependency:
- After successful HMAC validation: `HSET bot:last_seen {telegram_id} {unix_ts}`
- No DB writes in the request path

**Background task** — `run_metrics_collector` (started in lifespan):
- Interval: `METRICS_SNAPSHOT_INTERVAL_SECONDS` (default 600s / 10 min)
- Flushes `bot:last_seen` Redis hash → `users.last_active_at` (batch UPDATE)
- Inserts snapshot row into `bot_metrics_history` (cumulative `api_requests_count`)
- Uses APP-scope dependencies: `Redis`, `async_sessionmaker`
- Graceful shutdown via `task.cancel()`

### DI Providers

`DashboardProvider` (in `di_dashboard.py`):
- `BotStatsService` — REQUEST scope (needs AsyncSession + Redis)
- `DashboardService` — REQUEST scope (needs RemnawaveClient + BotStatsService + Redis)

### Dashboard Frontend

Page: `pages/admin/dashboard.tsx` with segmented control (VPN | Bot tabs).

**VPN tab**: KPI grid (Users, Nodes, Today bandwidth, Lifetime) → Users by status (color dots) → Online stats → Bandwidth periods (current + prev + diff ↑↓) → System (CPU, Memory, Uptime).

**Bot tab**: KPI grid (Users, Active 24h, Requests today, Uptime) → User registrations → Activity (1h, 24h) → Requests → System (CPU, Memory, Uptime, Version).

Components: `SegmentedControl` (reusable UI), `DashboardKpiGrid` (2×2 cards), `DashboardBandwidthRow` (label + current/prev/diff).

Hook: `useDashboard()` — `queryKey: adminDashboard`, `staleTime: 30s`.

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
  pulse: ['pulse'] as const,
  adminDashboard: ['admin', 'dashboard'] as const,
  adminUsers: (start: number) => ['admin', 'users', start] as const,
  adminUsersSearch: (q: string) => ['admin', 'users', 'search', q] as const,
  adminSettings: ['admin', 'settings'] as const,
};
```

### Freshness

| Data | staleTime | gcTime | Why |
|------|-----------|--------|-----|
| Subscription | 0 | 5 min | Always refetch on mount |
| Devices | 0 | 5 min | Always refetch on mount |
| Nodes | 30s | 5 min | Shared, changes slowly |
| Pulse | 60s | 5 min | Kuma status, matches backend cache TTL |
| Admin dashboard | 30s | 5 min | Matches backend cache TTL |
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

## Internationalization (i18n)

### Setup

- **Library**: `i18next` + `react-i18next` + `i18next-resources-to-backend`
- **Init**: `frontend/src/i18n/index.ts` — configures i18next with lazy-loaded locale via dynamic `import()`
- **Locale files**: `frontend/src/i18n/locales/en.json` — nested JSON, all keys
- **Suspense**: `main.tsx` wraps `<App />` in `<Suspense>` so locale loads before render
- **Chunk splitting**: Vite `manualChunks` splits i18next into a separate vendor chunk; locale JSON is a separate async chunk

### Key Structure

Dot-separated, grouped by domain:

| Domain | Scope |
|--------|-------|
| `common.*` | Shared UI: auth guard, header, tab bar, confirm dialog, status badges |
| `home.*` | Home page: hero card, detail section, subscription states |
| `devices.*` | Devices page, device row, platform icons |
| `pulse.*` | Pulse/status page, status banner, monitor rows |
| `settings.*` | Admin settings, Kuma config, quick links sub-screens |
| `admin.*` | Admin pages: users list, user detail/hero, user actions |
| `format.*` | Format helpers: traffic units, time expressions, strategy labels |

### Usage Patterns

**React components** — `useTranslation` hook:
```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <span>{t('domain.key')}</span>;
}
```

**Non-React files** (lib/format.ts, action definitions) — direct `i18n.t()`:
```typescript
import i18n from '../i18n';

function formatSomething(): string {
  return i18n.t('format.someKey', { n: 42 });
}
```

**Interpolation** — double braces in JSON, object param in code:
```typescript
// en.json: "greeting": "Hello, {{name}}!"
t('greeting', { name: 'World' })
```

**Static config objects** (PAGE_META, tab definitions, status labels) — store i18n keys as strings, resolve with `t()` at render time:
```typescript
const TABS = [{ label: 'common.tab.home', icon: Home }];
// In JSX: {t(tab.label)}
```

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

- `APP` scope: Settings, AsyncEngine, Redis, httpx.AsyncClient, RemnawaveClient, UptimeKumaClient
- `REQUEST` scope: AsyncSession, repositories, services (incl. PulseService, BotStatsService, DashboardService)

## Mini App Modes

- **User mode**: Home, Pulse, Devices, Support (4 tabs)
- **Admin mode**: Dashboard, Users, Broadcast, Settings (4 tabs)
- Toggle in header, visible only for `role=ADMIN`
- Mode switch navigates to first tab of new mode
- `ModeProvider` initializes from `window.location.pathname` (if `/admin/*` → admin mode)

## Navigation Patterns

### Page Header

The global `Header` component uses `PAGE_META` — a map of `pathname → { title, icon }` — to display the current page name with an icon. Pages **not** in `PAGE_META` see the fallback title "Flowvy".

**Simple pages** (no sub-navigation): registered in `PAGE_META`. The global Header shows their title + icon. The page component renders only content, no header of its own.

Examples: Pulse, Devices, Support, Users, Broadcast.

**Drill-down pages** (with sub-screens): **not** registered in `PAGE_META`. They render their own header inside the page component and manage title/back button via `useState<View>`. The global Header shows "Flowvy" for these pages.

Examples: Settings (main → Kuma Config / Quick Links).

```
Simple page:              Drill-down page (main):     Drill-down page (sub):
┌──────────────────┐      ┌──────────────────┐        ┌──────────────────┐
│ [icon] Pulse  [T]│      │ Flowvy        [T]│        │ Flowvy        [T]│
├──────────────────┤      ├──────────────────┤        ├──────────────────┤
│                  │      │ [⚙] Settings     │        │ [←] Uptime Kuma  │
│ ...page content  │      │                  │        │                  │
│                  │      │ ...settings rows │        │ ...config form   │
└──────────────────┘      └──────────────────┘        └──────────────────┘
[T] = admin/user toggle
```
