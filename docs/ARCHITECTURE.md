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
FastAPI BFF + aiogram webhook/polling (:8001)
       |             |              |
       v             v              v
 PostgreSQL        Redis        External HTTP
 local state    cache/metrics   Remnawave, Kuma/Beszel,
                                Tribute, Telegram Bot API
```

Frontend не обращается к Remnawave, Kuma, Beszel, Tribute, PostgreSQL или Redis напрямую. FastAPI формирует
ответы под конкретные экраны, проверяет Telegram identity и скрывает особенности внешних API.

## Доверенные границы

1. **Telegram Mini App input** — недоверенный до проверки подписи и `auth_date` по bot token.
2. **Frontend role/mode** — только отображение. Решение о доступе всегда принимает backend.
3. **Remnawave/Kuma/Beszel/Tribute и webhooks** — внешние данные: нужны timeout, schema validation,
   безопасная ошибка, проверка подписи и защита от повторов там, где есть side effect.
4. **PostgreSQL** — локальная долговременная запись. Изменяется приложением и Alembic migrations.
5. **Redis** — временные cache/metrics/activity данные; потеря Redis не должна менять права доступа.
6. **Debug routes** — намеренно обходят Telegram auth и допустимы только на изолированном localhost.

## Backend

### Сборка приложения и lifecycle

`flowvy.api.factory:create_app` создаёт FastAPI, Dishka container, middleware и routers. Lifespan:

- создаёт bot/dispatcher; при полном webhook-конфиге регистрирует callback, иначе для локальной
  разработки удаляет устаревший webhook и запускает long polling;
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
Kuma, отдельных proxy-free Beszel/Tribute clients и bot. SQLAlchemy session и большинство BFF services имеют
REQUEST scope; provider commits или rollbacks транзакцию после обработки запроса.

### HTTP-потоки

Пользовательские маршруты:

- `GET /api/me` — проверка initData и чтение существующего пользователя; exact provider-only
  Remnawave match импортирует локально без изменения provider, а полностью неизвестного пользователя
  не создаёт и возвращает стабильный `registration_required`/`invite_required` code.
- `GET /api/onboarding`, `POST /api/onboarding/register|redeem|redeem-launch` — явная открытая
  регистрация, ручной invite code либо Main Mini App invite из проверенного Telegram
  `initData.start_param`. Launch-mutation не принимает code в body. `GET /api/me/invite` отдаёт
  собственный код, счётчик и referral URL только при подтверждённой capability бота.
- `GET /api/me/subscription` — Remnawave user/subscription и upsert локальной subscription.
- `GET/DELETE /api/me/devices...` — свежее сопоставление Telegram user с числовым Remnawave user ID,
  optional legacy UUID и HWID devices.
- `GET /api/pulse` — нормализованный статус выбранного Kuma/Beszel provider, если Pulse включён.

Admin routes под `/api/admin` повторно получают текущего локального пользователя и проверяют его
роль. Они отдают dashboard, полный/постраничный список пользователей, detail/actions и provider,
branding/welcome settings. `POST /api/admin/settings/tribute/test` выполняет только фиксированный
read-only запрос первой страницы products с server-side key; ключ в response не входит.
`/api/admin/registration` управляет режимом, access profiles и live squad options. Admin Broadcast
API в текущем коде отсутствует.

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

При Telegram-enabled startup backend вызывает Bot API `getMe` и кэширует только username и
`has_main_web_app`. Ссылка приглашения имеет единственный формат Main Mini App
`t.me/<bot>?startapp=ref_<code>` и выдаётся только при `has_main_web_app=true`. Client launch
parameter и `initDataUnsafe` не участвуют в attribution: auto-redeem извлекает код только из уже
HMAC-проверенного raw `initData`. Если capability нельзя подтвердить, система не подменяет этот
flow bot- или Direct Mini App-ссылкой.

При `GET /api/me` локальная запись синхронизируется, если уже существует. После local miss выполняется
exact Remnawave lookup по Telegram ID: provider-only user импортируется в local user/invite/subscription
без referral attribution, default profile и provider mutation. Provider miss продолжает обычный
onboarding, а lookup error fail closed возвращает временную недоступность. Второе исключение — первый
bootstrap identity из `ADMIN_TELEGRAM_IDS`, чтобы владелец не заблокировал сам себя invite-only
режимом. Обычная регистрация полностью нового пользователя всегда является отдельной mutation. Admin
dependency доверяет только текущему backend allow-list и локальной записи, не client mode.

Invite redemption ограничивается по Telegram ID через Redis и fail-closed при его недоступности.
В PostgreSQL берётся transaction-scoped advisory lock на Telegram ID: повторный запрос одной identity
не создаёт дубль, а один пользовательский код может зарегистрировать разных людей. Если provisioning Remnawave успел выполниться перед
timeout, повторный exact lookup завершает локальную запись без создания дубля.

### Данные и кэш

PostgreSQL хранит пользователей, подписки, access profiles, один публичный invite code на пользователя,
прямую attribution в `users.invited_by_id`, singleton provider settings, историю bot metrics и
принятые Remnawave webhook events. Код не является authentication credential; доступ задаёт общий
registration profile. Код хранится в БД, потому что владелец может посмотреть и переслать его снова.
Alembic migrations образуют одну линейную цепочку.

Redis используется для:

- `dashboard:remnawave` — Remnawave dashboard, TTL 30 секунд;
- `pulse:data` — provider-neutral Pulse aggregation, TTL 60 секунд;
- `external_squads` — имена squads, TTL 300 секунд;
- request counters и `bot:last_seen` до периодической записи activity в PostgreSQL;
- часовое окно попыток invite redemption;
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

### Pulse providers

`provider_settings.pulse_provider` выбирает `disabled`, `kuma` или `beszel`. Kuma URL/public
status-page slug и Beszel Hub URL меняются через admin settings. Pulse service получает данные
выбранного client, переводит их в общий groups/monitors/heartbeats/incidents contract и кэширует в
Redis. При выключенной или неполной настройке `/api/pulse` возвращает `404`.

Kuma использует публичный status-page contract. Beszel авторизуется серверными
`BESZEL_EMAIL`/`BESZEL_PASSWORD`, читает назначенные systems и `1m`/`20m` system stats; секреты не
входят в settings API или БД. Оба client используют origin-only policy, DNS validation/pinning,
redirect/proxy запрет, ограниченное тело и безопасное error mapping. Private Docker/LAN origins
требуют отдельного точного allow-list для каждого provider.

### Tribute payments administration

Текущий Tribute slice ограничен admin configuration и проверкой API access. Секрет
`TRIBUTE_API_KEY` хранится только в server environment. Fixed-origin client обращается только к
`https://tribute.tg/api/v1/products?page=1&size=1`, запрещает redirects/proxy environment,
ограничивает timeout/body и валидирует минимальную JSON-схему. Ни платеж, ни возврат, ни provider
mutation при проверке не создаются.

Frontend выделяет Payments в отдельную Settings section и показывает credential presence,
read-only API check и persisted automation rules для donations, subscriptions и digital products.
Rule сопоставляет provider/source conditions с внутренним access profile, но не является provider
product/price. `fixed` задаёт постоянное число дней, а `volume` выбирает максимальный подходящий
порог и целочисленно вычисляет `floor(amount_minor * unit_days / unit_amount_minor)` для всей суммы.
Calculated days явно переопределяют default validity выбранного access profile; traffic/device/
squad/tag/provider options переиспользуются. `extend` означает будущую базу
`max(now, current_expiry)`, `replace` — `now`; сам executor в текущем slice отсутствует.

PostgreSQL `commerce_rules` хранит provider-neutral match/action columns и schema-validated JSONB
calculator payload. Admin-only CRUD повторно проверяет active access profile. Draft preview
выполняет тот же backend calculator, не сохраняет rule и не изменяет пользователя. Frontend вводит
major currency units, но wire/storage используют integer minor units; floating-point не участвует
в entitlement calculation.

Webhook URL намеренно отсутствует: receiver, signature/freshness/replay/idempotency, event storage,
identity reconciliation, entitlement execution и checkout остаются следующим backend/product
этапом. Существующий внешний receiver оператор должен оставить без изменений.

### Webhooks и Telegram bot

Remnawave webhook доступен только при непустом shared secret. Валидное событие сохраняется в
PostgreSQL и инвалидирует dashboard/Pulse cache по scope/event. Signature, freshness, replay,
idempotency, payload size и retention проверяются до/после сохранения в соответствующей границе.

Aiogram dispatcher содержит обычный `/start` flow, ручной ввод invite code и отправку welcome
template/media. `/start` не является referral transport и не разбирает `ref_` payload: приглашение
в Main Mini App приходит по HTTPS вместе с подписанным initData. В production Telegram webhook
живёт в том же FastAPI process; при пустом `WEBHOOK_URL` dev-процесс использует polling. Отдельного
worker сейчас нет.

## Frontend

`App` собирает `QueryClientProvider`, `AuthGuard`, `ModeProvider` и TanStack `RouterProvider`.

- `lib/api.ts` добавляет Telegram init data и является общим fetch wrapper.
- `hooks/` описывают query/mutation lifecycles и переключаются на debug endpoints в mock mode.
- `/me`, admin settings и Pulse живут в едином TanStack Query cache. Успешная settings mutation
  сразу обновляет settings/user cache, заново проверяет `/me` и сбрасывает
  старый Pulse response при смене provider-конфигурации.
  Решение следует official TanStack Query v5 guidance для
  [mutation response updates](https://tanstack.com/query/latest/docs/framework/react/guides/updates-from-mutation-responses)
  и [related-query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations),
  проверено 2026-08-02.
- `contexts/mode-context.tsx` хранит user/admin presentation mode; начальное значение выводится из
  URL.
- `components/` содержит feature и reusable UI; страницы остаются composition boundary.
- `styles/tokens.css`, CSS Modules и Telegram theme/safe-area интеграция задают внешний вид.
- Один frontend browser adapter нормализует editable focus, pointer activation и геометрию
  `VisualViewport`; shell и top-layer editors подписываются на общий snapshot и CSS variables,
  поэтому не создают собственные keyboard listeners или event-cancellation workaround.
- `i18n/locales/en.json` — единственный текущий locale resource и источник product-owned UI-copy.
  Operator-owned identity и bot welcome приходят через branding/settings contract;
  provider facts остаются typed runtime data. Полная граница описана в
  [`decisions/0002-ui-copy-and-provider-owned-content.md`](decisions/0002-ui-copy-and-provider-owned-content.md).
- Page-level load/auth/forbidden/not-found состояния используют единый `ErrorState`; inline mutation
  errors берут безопасный текст из locale, а raw provider/backend `message` не отображается.

До появления local user `AuthGuard` показывает отдельный onboarding без app navigation. Успешная
mutation сразу кладёт полученного user в общий TanStack Query cache, поэтому вход не требует reload.
Для launch invite frontend получает от backend только boolean о наличии корректного signed
`start_param` и вызывает no-body mutation; сам код из URL/SDK frontend не читает и не пересылает.

Пользовательские URL: `/`, `/devices`, `/pulse`, `/support`. Support остаётся локализованной
заглушкой будущего встроенного support flow и не перенаправляет во внешний канал. Admin URL:
`/admin/dashboard`, `/admin/users`, `/admin/users/$userId`, `/admin/broadcast`, `/admin/settings` и
отдельные Kuma, Beszel, Tribute, branding, welcome и registration/access subroutes. Broadcast пока остаётся
заглушкой.

## Автоматизация разработки

`scripts/bootstrap.ps1` устанавливает locked Python/Node dependencies. `dev-up.ps1` и
`dev-down.ps1` управляют локальными процессами и Compose services с PID/log artifacts под
`.artifacts/`. `scripts/verify.ps1` выбирает backend, frontend, docs и UI gates по diff либо запускает
полный контур; специализированные scripts проверяют Alembic, Remnawave snapshot/client tests и
локальные Markdown links.

Frontend имеет Vitest unit seed и Playwright mock state matrix. Browser suite запускает только Vite,
перехватывает каждый `/api/*` request и проверяет critical user/admin routes, роли, ошибки, mutations,
accessibility и visual evidence без Telegram, backend, PostgreSQL, Redis, Remnawave, Kuma, Beszel или Tribute.
Отдельный live-smoke читает настроенный provider через уже запущенный локальный BFF и не входит в CI.

GitHub Actions повторяет locked install, backend lint/tests/migrations с disposable PostgreSQL/Redis
и frontend lint/typecheck/unit/build/Chromium smoke. CI не выполняет deployment.

## Runtime и deployment

В dev PostgreSQL/Redis работают в Compose, а backend/frontend — локальными процессами с reload/HMR.
Vite проксирует `/api` и `/webhook` на `:8001`. Production image, reverse proxy, TLS, secret
management, observability, backup/restore и deployment pipeline в репозитории пока не определены;
имеющийся GitHub workflow является только validation CI.
