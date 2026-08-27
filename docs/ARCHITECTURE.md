# Архитектура Flowvy

Этот документ фиксирует устойчивые компоненты, ownership данных и trust boundaries. Проверенное
текущее состояние и gaps находятся в [`PROJECT_STATE.md`](PROJECT_STATE.md), локальный lifecycle —
в [`DEV_ENVIRONMENT.md`](DEV_ENVIRONMENT.md), versioned provider contracts и primary sources — в
[`INTEGRATIONS.md`](INTEGRATIONS.md).

## Общая схема

```text
Telegram client / browser
        |
        | HTTPS, Telegram initData
        v
React Mini App ---- same-origin /api ----> FastAPI BFF
                                            |       |
                                            |       +--> Redis
                                            +----------> PostgreSQL
                                            |
                                            +--> Telegram Bot API
                                            +--> Remnawave
                                            +--> Uptime Kuma or Beszel
                                            +--> Tribute
                                            +--> optional Cloudflare R2
```

Frontend никогда не обращается к providers, PostgreSQL или Redis напрямую. FastAPI является BFF и
единственной application boundary для identity, authorization, normalization и side effects.

## Trust boundaries

- Telegram launch params, browser state, route params и frontend role/mode недоверенные. Identity
  подтверждает только backend-проверка raw `initData`.
- Admin permission вычисляется server-side при каждом защищённом действии из active local user,
  сохранённой роли и текущей server allow-list.
- Provider responses и webhook bodies являются внешним недоверенным вводом. Их ограничивают size,
  timeout, schema, freshness, replay/idempotency и allow-listed projections.
- Provider identifiers в PostgreSQL связывают локальные и внешние records, но не заменяют fresh
  ownership/identity checks перед чувствительным side effect.
- Secrets принадлежат server environment. Frontend может получить только безопасный capability/status
  flag; raw token, credential, signed URL или upstream diagnostic не становятся public state.
- PostgreSQL хранит durable business state. Redis хранит cache, metrics/activity и bounded
  coordination; его содержимое не является источником auth, role или payment truth.

Подробные security invariants принадлежат [`SECURITY.md`](SECURITY.md).

## Backend

### Composition и lifecycle

`python -m flowvy` запускает Uvicorn с application factory. Factory создаёт FastAPI, Dishka
container, middleware и routers. Debug routers регистрируются только при explicit `DEBUG=true`.
Production image дополнительно раздаёт собранный React frontend: `/assets` обслуживает immutable
сборочные файлы, а неизвестный client route получает SPA shell. Неизвестные `/api` и `/webhook`
routes никогда не подменяются HTML.

Application lifespan:

1. при наличии bot token проверяет Main Mini App capability;
2. выбирает Telegram webhook либо один local polling process;
3. при configured Remnawave выполняет startup reachability check;
4. запускает metrics, webhook retention, Tribute entitlement и Support retention workers;
5. при shutdown отменяет owned tasks, закрывает bot session и DI container.

Worker failure policy и operational recovery описаны в [`OPERATIONS.md`](OPERATIONS.md).

### Layers

- `api/routes/` принимает HTTP, применяет auth dependencies и преобразует service result в public
  schema/error response.
- `schemas/` определяет allow-listed inbound/outbound contracts.
- `services/` владеет business rules, provider orchestration, normalization и transaction intent.
- `repositories/` владеет SQLAlchemy queries и durable persistence operations.
- `models/` и Alembic migrations определяют database contract.
- `di*.py` связывает configuration, repositories, services, clients и route dependencies.
- `bot/` содержит Telegram dispatcher и handlers; chat commands не обходят BFF trust rules.

Route не должен собирать SQL/provider transaction вручную. Service не должен возвращать raw provider
payload. Repository не принимает frontend DTO как доверенный business object.

### HTTP flow

Обычный authenticated request проходит последовательность:

1. route/dependency проверяет Telegram `initData`, TTL и active user;
2. admin route дополнительно проверяет актуальную роль и allow-list;
3. Pydantic schema нормализует request;
4. service читает durable state и при необходимости вызывает provider через typed client;
5. repository фиксирует локальную transaction;
6. route возвращает allow-listed BFF schema и safe error code.

Reads не должны неявно создавать полностью неизвестного user. Device/admin/payment mutations
повторяют authorization или ownership непосредственно перед side effect.

### Durable data и concurrency

- PostgreSQL transactions владеют users, invites, settings, profiles, support, commerce, webhook
  inboxes, entitlement operations, audit и restoration state.
- Alembic — единственный production schema path; test `Base.metadata.create_all()` не доказывает
  migration correctness.
- User/provider/payment conflicts сериализуются row/advisory locks и unique constraints, а не
  process-local mutex.
- External side effect не считается durable успехом до подтверждённого local state transition.
  Неопределённый timeout требует read-only reconciliation перед retry.
- Retention удаляет только bounded historical rows/objects по документированному lifecycle и не
  ослабляет idempotency активных операций.

## External flows

### Telegram entry и sharing

Bot `/start` отправляет neutral localized Welcome и не регистрирует пользователя в chat. Main Mini
App referral destination переносит signed code в `startapp`; redemption доверяет только проверенному
`WebAppInitData.start_param`. Prepared sharing создаётся backend через Bot API и имеет browser/older
client fallback без выдачи bot credentials.

### Remnawave и Pulse

Remnawave client нормализует поддерживаемые 2.x/3.x user contracts, сохраняет stable provider
identity и fail-closed обрабатывает неизвестный major. Registration, subscription, devices и admin
mutations используют typed BFF projection. Uptime Kuma/Beszel выбираются одним provider-neutral Pulse
contract; SSRF, credential и degraded-state границы остаются backend-owned.

### Tribute checkout и entitlement

Admin configuration создаёт validated rules и published offer snapshots. User checkout хранит только
local redirect intent; redirect или browser return не подтверждают оплату. Signed Tribute webhook
фиксирует authenticated inbox/ledger state, после чего отдельный worker применяет immutable target к
Remnawave. Ambiguity, identity conflict или incomplete history переводят operation в review вместо
предполагаемого grant. Устойчивое решение: ADR
[`0003`](decisions/0003-tribute-managed-checkout-and-entitlements.md).

### Support и R2

Support requests, messages, lifecycle и Quick Answers хранятся локально. Telegram notifications
отправляются best effort после commit и не откатывают mutation. Attachment bytes идут напрямую между
browser и optional private R2 по short-lived checksum-bound presigned operations; backend хранит
metadata, проверяет upload через HEAD и авторизует download. Установка без R2 остаётся text-only.

## Frontend

### Composition

- `router.ts` — code-based route tree и lazy-loading boundary.
- `AppShell` владеет auth/onboarding, user/admin mode, Telegram navigation и shared layout.
- `lib/api.ts` — единственная HTTP boundary; она добавляет in-memory Telegram auth и effective
  `Accept-Language`, обрабатывает empty `204` и нормализует errors.
- TanStack Query hooks владеют server state, stable query keys, mutations и invalidation.
- Pages компонуют feature и shared UI components; authorization всё равно остаётся backend-owned.
- CSS Modules используют semantic tokens из `src/styles/tokens.css`; shared values сверяются с
  Flowvy Desktop, а Header/TabBar glass остаётся узким layout exception.

### Locale и content ownership

`i18n/locales/en.json` и `i18n/locales/ru.json` — полные product-copy catalogs с автоматической
key/placeholder parity проверкой. Locale выбирается из Telegram `language_code`, затем browser
preference, с English fallback. Operator-owned localized fields и provider facts приходят typed
runtime data и не превращаются в arbitrary locale keys. Устойчивое решение: ADR
[`0002`](decisions/0002-ui-copy-and-provider-owned-content.md).

### UI state contract

Data routes должны иметь loading, normal, empty/not-found, denied, degraded/error и retry states.
Mutations сохраняют контекст, блокируют duplicate action и показывают safe actionable failure.
Direct URL, refresh и Back/Forward не зависят от прохода через default route.

Telegram-native buttons, Popup, viewport и sharing используются только через поддерживаемый SDK
contract с accessible browser fallback. UI проверяется на mobile, narrow mobile, iOS WebKit и
desktop, в light/dark, с Axe, keyboard/focus, overflow, console и network guards.

## Runtime и delivery

Development topology состоит из PostgreSQL/Redis Compose services, FastAPI `:8001`, Vite `:5173` и
optional production preview/Tunnel. Checked-in PowerShell workflows владеют startup markers, PID
ownership, migrations, verification и safe shutdown. Debug нельзя публиковать.

Production topology определена ADR [`0006`](decisions/0006-production-container-and-delivery.md):
один non-root image содержит frozen FastAPI backend и собранный React frontend; Compose запускает
PostgreSQL, непостоянный Redis, одноразовую Alembic migration и один application process. App
публикуется только на host loopback, проверяет allow-listed `Host`, а внешний reverse proxy владеет
доменом и TLS. PostgreSQL volume — единственное встроенное durable storage; рабочие secrets живут
только в server `.env`.

Bare SemVer release tag после зелёного CI публикует `linux/amd64` и `linux/arm64` image в GHCR, затем
создаёт GitHub Release. Workflow не подключается к серверу и не выполняет production migration:
installation Compose применяет её перед каждым app start. Observability, проверенный backup/restore,
capacity limits и incident response остаются отдельными незавершёнными operations boundaries.
Инструкция установки находится в [`DEPLOYMENT.md`](DEPLOYMENT.md), release и operations procedures —
в [`OPERATIONS.md`](OPERATIONS.md).

## Architectural decisions

Durable решения хранятся в [`decisions/`](decisions/README.md):

- invite registration и access profiles;
- product/operator/provider content ownership;
- Tribute-managed checkout и durable entitlements;
- Desktop color parity без accessibility exception.
- production container, GHCR delivery и external TLS boundary.

Временная реализация остаётся в коде и Git-ignored task plan; завершённый plan удаляется после
переноса устойчивых результатов в canonical owner.
