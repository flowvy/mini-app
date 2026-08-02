# Архитектура Flowvy

Документ описывает устойчивые границы текущего кода. Точный статус реализации и известные риски —
в [`PROJECT_STATE.md`](PROJECT_STATE.md); локальный запуск — в
[`DEV_ENVIRONMENT.md`](DEV_ENVIRONMENT.md).

## Общая схема

```text
Telegram Mini App / Browser
            |
            | HTTPS / Authorization: tma <initData>
            v
React + TanStack Router/Query (:5173 в dev)
            |
            | /api/*
            v
FastAPI BFF + aiogram webhook (:8001)
       |             |              |
       v             v              v
 PostgreSQL        Redis        External HTTP
 local state    cache/metrics   Remnawave, Kuma,
                                Telegram Bot API
```

Frontend не обращается к Remnawave, Kuma, PostgreSQL или Redis напрямую. FastAPI формирует ответы
под конкретные экраны, проверяет Telegram identity и скрывает особенности внешних API.

## Доверенные границы

1. **Telegram Mini App input** — недоверенный до проверки подписи и `auth_date` по bot token.
2. **Frontend role/mode** — только отображение. Решение о доступе всегда принимает backend.
3. **Remnawave/Kuma/webhooks** — внешние данные: нужны timeout, schema validation, безопасная ошибка,
   проверка подписи и защита от повторов там, где есть side effect.
4. **PostgreSQL** — локальная долговременная запись. Изменяется приложением и Alembic migrations.
5. **Redis** — временные cache/metrics/activity данные; потеря Redis не должна менять права доступа.
6. **Debug routes** — намеренно обходят Telegram auth и допустимы только на изолированном localhost.

## Backend

### Сборка приложения и lifecycle

`flowvy.api.factory:create_app` создаёт FastAPI, Dishka container, middleware и routers. Lifespan:

- создаёт bot/dispatcher и регистрирует Telegram webhook, если задан `BOT_TOKEN`;
- проверяет доступность Remnawave при непустом `REMNAWAVE_URL`;
- запускает периодический сбор метрик через Redis и PostgreSQL;
- при остановке завершает задачу и закрывает bot/container.

Точка входа `python -m flowvy` запускает Uvicorn на `0.0.0.0:8001`; reload зависит от `DEBUG`.

### Слои

- `api/routes/` — HTTP input/output, зависимости аутентификации и перевод известных ошибок в HTTP.
- `services/` — orchestration и BFF-агрегация для экранов.
- `repositories/` — повторяемая работа с локальными SQLAlchemy models.
- `schemas/` — Pydantic contracts backend/frontend и адаптация внешних ответов.
- `models/` — локальная схема PostgreSQL.
- `di.py`, `di_bff.py`, `di_dashboard.py`, `di_webhooks.py`, `di_bot.py` — Dishka wiring.

APP scope используется для Settings, engine/session factory, Redis, shared httpx client, Remnawave,
Kuma и bot. SQLAlchemy session и большинство BFF services имеют REQUEST scope; provider commits или
rollbacks транзакцию после обработки запроса.

### HTTP-потоки

Пользовательские маршруты:

- `GET /api/me` — проверка initData, создание/обновление локального пользователя, feature flags и
  branding.
- `GET /api/me/subscription` — Remnawave user/subscription и upsert локальной subscription.
- `GET/DELETE /api/me/devices...` — свежее сопоставление Telegram user с числовым Remnawave user ID,
  optional legacy UUID и HWID devices.
- `GET /api/pulse` — агрегированный public status page Kuma, если функция включена.

Admin routes под `/api/admin` повторно получают текущего локального пользователя и проверяют его
роль. Они отдают dashboard, полный/постраничный список пользователей, detail/actions и provider,
branding/welcome settings. Admin Broadcast API в текущем коде отсутствует.

Служебные маршруты:

- `GET /api/health` — liveness процесса без обращения к зависимостям.
- `GET /api/ready` — readiness PostgreSQL и Redis с коротким timeout и безопасным `503`.
- `POST /api/webhooks/remnawave` — HMAC-проверка, сохранение события и cache invalidation.
- `POST /webhook` — передача Telegram update в aiogram dispatcher.
- `/api/debug/*` и `/api/debug/admin/*` — локальные auth-bypass версии части потоков; каждый handler
  вызывает debug guard.

### Authentication и authorization

Frontend отправляет raw Telegram init data как `Authorization: tma <value>`. Backend использует
aiogram validation с `BOT_TOKEN`, проверяет TTL и наличие пользователя. После успешной проверки
время активности записывается в Redis hash.

При `GET /api/me` локальный user создаётся или синхронизируется. Admin role определяется списком
`ADMIN_TELEGRAM_IDS` из environment и записывается в PostgreSQL. Admin dependency доверяет только
текущей локальной записи, не client mode. Незакрытые auth-риски перечислены в `PROJECT_STATE.md`.

### Данные и кэш

PostgreSQL хранит пользователей, подписки, invites, singleton provider settings, историю bot metrics
и принятые Remnawave webhook events. Alembic migrations образуют одну цепочку от начальной схемы до
удаления устаревших quick-link columns.

Redis используется для:

- `dashboard:remnawave` — Remnawave dashboard, TTL 30 секунд;
- `pulse:data` — Kuma aggregation, TTL 60 секунд;
- `external_squads` — имена squads, TTL 300 секунд;
- request counters и `bot:last_seen` до периодической записи activity в PostgreSQL;
- Telegram media `file_id` cache в message sender.

Subscription и devices для отдельного пользователя читаются из Remnawave без общего response cache;
локальная subscription хранит числовой provider ID, optional legacy UUID, status, expiry и device
limit для последующих запросов.

## Внешние интеграции

### Remnawave

`RemnawaveClient` — async wrapper поверх shared `httpx.AsyncClient` с timeout 10 секунд. Он скрывает
`response` envelope и преобразует часть ответов в Pydantic schemas. Поддерживаются lookup
пользователя, subscription info, HWID devices, admin user actions, metadata, external squads и
dashboard statistics.

Для version-sensitive операций client один раз читает metadata и поддерживает две ветки: 2.x с
legacy user UUID/lookup endpoints и 3.0/3.1 с числовым `userId` и filtered user stream. BFF/admin
использует числовой ID независимо от upstream generation; неизвестный major закрывается ошибкой.

`docs/api-remnawave.json` — reference snapshot, а не гарантированно актуальный контракт. Любое
изменение интеграции требует сверки с primary source/фактической версией панели и contract tests.

### Uptime Kuma

URL и public status-page slug хранятся в `provider_settings` и меняются через admin settings. Pulse
service получает public status/heartbeat data, группирует результат и кэширует его в Redis. При
выключенной функции `/api/pulse` возвращает `404`.

### Webhooks и Telegram bot

Remnawave webhook доступен только при непустом shared secret. Валидное событие сохраняется в
PostgreSQL и инвалидирует dashboard/Pulse cache по scope/event. Freshness и deduplication пока не
реализованы.

Aiogram dispatcher содержит `/start` flow и отправку welcome template/media. Telegram webhook живёт
в том же FastAPI process; отдельного worker сейчас нет.

## Frontend

`App` собирает `QueryClientProvider`, `AuthGuard`, `ModeProvider` и TanStack `RouterProvider`.

- `lib/api.ts` добавляет Telegram init data и является общим fetch wrapper.
- `hooks/` описывают query/mutation lifecycles и переключаются на debug endpoints в mock mode.
- `contexts/mode-context.tsx` хранит user/admin presentation mode; начальное значение выводится из
  URL.
- `components/` содержит feature и reusable UI; страницы остаются composition boundary.
- `styles/tokens.css`, CSS Modules и Telegram theme/safe-area интеграция задают внешний вид.
- `i18n/locales/en.json` — единственный текущий locale resource.

Пользовательские URL: `/`, `/devices`, `/pulse`, `/support`. Admin URL: `/admin/dashboard`,
`/admin/users`, `/admin/users/$userId`, `/admin/broadcast`, `/admin/settings` и отдельные Kuma,
branding, welcome subroutes. Support и Broadcast пока заглушки.

## Автоматизация разработки

`scripts/bootstrap.ps1` устанавливает locked Python/Node dependencies. `dev-up.ps1` и
`dev-down.ps1` управляют локальными процессами и Compose services с PID/log artifacts под
`.artifacts/`. `scripts/verify.ps1` выбирает backend, frontend, docs и UI gates по diff либо запускает
полный контур; специализированные scripts проверяют Alembic, Remnawave snapshot/client tests и
локальные Markdown links.

Frontend имеет Vitest unit seed и Playwright mock state matrix. Browser suite запускает только Vite,
перехватывает каждый `/api/*` request и проверяет critical user/admin routes, роли, ошибки, mutations,
accessibility и visual evidence без Telegram, backend, PostgreSQL, Redis, Remnawave или Kuma.
Отдельный live-smoke читает настроенный provider через уже запущенный локальный BFF и не входит в CI.

GitHub Actions повторяет locked install, backend lint/tests/migrations с disposable PostgreSQL/Redis
и frontend lint/typecheck/unit/build/Chromium smoke. CI не выполняет deployment.

## Runtime и deployment

В dev PostgreSQL/Redis работают в Compose, а backend/frontend — локальными процессами с reload/HMR.
Vite проксирует `/api` и `/webhook` на `:8001`. Production image, reverse proxy, TLS, secret
management, observability, backup/restore и deployment pipeline в репозитории пока не определены;
имеющийся GitHub workflow является только validation CI.
