# Эксплуатация Flowvy

В репозитории есть воспроизводимая **локальная разработка и validation CI**, но нет готового
production deployment/operations контура. Этот документ не является разрешением запускать MVP на
публичном сервере. Требования безопасности: [`SECURITY.md`](SECURITY.md).

## Localhost-only lifecycle

После создания безопасного `backend/.env`:

```powershell
.\scripts\bootstrap.ps1 -InstallBrowsers
.\scripts\dev-up.ps1
.\scripts\dev-down.ps1
```

`dev-up` проверяет ports `8001`/`5173`, поднимает PostgreSQL/Redis, принудительно использует Compose
URL вместо случайных process-level `DATABASE_URL`/`REDIS_URL`, применяет Alembic migrations,
запускает backend/frontend и ожидает API readiness/Vite. По умолчанию Telegram отключён для
запускаемых процессов. `-EnableTelegram` использует защищённый webhook при полной конфигурации либо
long polling при пустом `WEBHOOK_URL`; одновременно должен работать только один polling-процесс
test bot. PID и stdout/stderr находятся в `.artifacts/dev`. `dev-down` останавливает только
записанные process trees и Compose services, не удаляя `pgdata`.

Это намеренно непубличный режим без Telegram. На машине владельца запрос **полноценного** или
**штатного** Flowvy dev означает named-Tunnel lifecycle из раздела
[Cloudflare Tunnel](#cloudflare-tunnel), с `-EnableTelegram` и `https://dev-app.flowvy.io`.

Не удаляйте process file вручную, пока процессы живы. Не используйте `docker compose down -v` как
обычное исправление: volume содержит локальные данные и удаляется необратимо.

Для явно запрошенного чистого dev-сценария используйте только
`scripts/dev-reset-data.ps1 -ConfirmDevDataReset` после `dev-down`. Script очищает application schema
в database `flowvy` и Redis DB 0, повторно применяет migrations, сбрасывает singleton settings к
defaults и сохраняет test database, Docker volume и все внешние provider data. Ручной
`DROP DATABASE`, `docker compose down -v` и очистка provider не являются частью dev lifecycle.

## Проверка состояния

- `GET /api/health` подтверждает только liveness FastAPI и не обращается к зависимостям.
- `GET /api/ready` параллельно проверяет `SELECT 1` в PostgreSQL и Redis `PING` с двухсекундными
  timeout. Возвращает только `ok/error` по компонентам, без внутренних адресов/ошибок. `dev-up`
  ждёт именно этот route; Remnawave/Kuma/Beszel намеренно не входят в базовую readiness приложения.
- `docker compose -f docker-compose.dev.yml ps` показывает dev infrastructure.
- `.artifacts/dev/backend.stderr.log` и соседние logs — первая локальная диагностика, но в них не
  должны попадать secrets/payloads.
- `scripts/verify.ps1 -Scope Full` проверяет validation-контур; он не является runtime monitor.

## Миграции

Alembic загружает отдельный `MigrationSettings`, содержащий только `DATABASE_URL`, с тем же
приоритетом process environment → `backend/.env` → local default. Он не валидирует и не выводит
остальные application secrets. Перед ручной командой всё равно подтвердите точную target database. Локальный
`verify-migrations.ps1` создаёт случайную disposable БД, проверяет upgrade/downgrade/re-upgrade,
сохранение legacy Kuma-enabled настройки при переходе к Pulse provider selector и drift, затем
удаляет её; CI делает zero-to-head на ephemeral PostgreSQL.

## Tribute entitlement worker

Безопасный runtime default — `TRIBUTE_ENTITLEMENT_EXECUTION_ENABLED=false`. В этом режиме
authenticated events и entitlement decisions сохраняются, admin UI показывает `Planning only`, но
Remnawave mutation не выполняется. Переключатель намеренно server-only и не находится в Mini App.
Identified donation имеет второй независимый безопасный default
`TRIBUTE_IDENTIFIED_DONATION_AUTOMATION_ENABLED=false`: до controlled live evidence его derived
fingerprint создаёт review, а не pending grant. Anonymous donation всегда остаётся review-only.

Для безопасной локальной проверки donation semantics из корня используется
`.\scripts\verify-tribute-entitlements.ps1`. Команда работает только с disposable test PostgreSQL
и fake credentials, не читает runtime key и не выполняет внешние provider requests. Fixture
оставляет executor выключенным и проверяет signed HTTP intake, dedupe, planner decisions, bands и
review paths.

Параметры worker:

- `TRIBUTE_ENTITLEMENT_EXECUTION_ENABLED` — запускает lifespan worker; при `true` startup также
  требует полный `REMNAWAVE_URL`/`REMNAWAVE_API_TOKEN`;
- `TRIBUTE_IDENTIFIED_DONATION_AUTOMATION_ENABLED` — разрешает planner переводить доказанно
  неанонимные donation events в очередь; включается только после controlled live fingerprint
  evidence и не запускает worker самостоятельно;
- `TRIBUTE_ENTITLEMENT_WORKER_INTERVAL_SECONDS` — пауза пустой очереди, default 10 секунд;
- `TRIBUTE_ENTITLEMENT_LEASE_SECONDS` — после этого interrupted `processing` возвращается в retry,
  default 120 секунд;
- `TRIBUTE_ENTITLEMENT_MAX_ATTEMPTS` — предел transient provider attempts, default 5.
- `SPONSOR_CHECKOUT_PENDING_MINUTES` — срок одного локального redirect intent, default 30 минут,
  допустимый диапазон 5–180. Это не provider payment timeout и не доказательство оплаты.

Admin может сохранять sponsor offer как hidden draft при выключенном worker. Publish доступен только
когда backend видит включённый executor, enabled commerce rule, active access profile и валидный
Creator destination/catalog item. Для donation дополнительно нужен identified-donation flag. Home
никогда не читает draft и не вызывает Tribute catalog; published offer использует frozen snapshot.

Минимальный controlled rollout:

1. Создать в Tribute subscription либо donation destination; donation использовать автоматически
   только при принятом identity/fingerprint риске.
2. Сохранить destination, создать и preview automation rule, затем создать hidden sponsor offer.
3. Прогнать `verify-tribute-entitlements.ps1`, migration verifier и browser matrix. Убедиться, что
   executor/identified-donation gates остаются в ожидаемом состоянии.
4. Только по отдельному разрешению включить delivery на test target, опубликовать один offer и
   выполнить одну реальную оплату тем же Telegram account. Redirect сам по себе не успех: должны
   появиться authenticated inbox event, одна operation, confirmed checkout и applied access.
5. Проверить duplicate delivery, exact expiry, cancellation и base restoration до расширения
   rollout. Не создавать второй payment, пока Home показывает pending/provisioning/review.

Creator contract не документирует failed-charge/retry или next-charge state. Их нельзя выводить из
таймера checkout либо отсутствия webhook.

Остановка/перезапуск процесса не удаляет очередь. Stale lease возвращается в retry, а сохранённый
absolute target позволяет сначала reconciliate provider state и не повторять уже применённое
продление. Для временной остановки side effects выключают gate и штатно перезапускают backend;
pending/retry/review history сохраняется. Ledger вручную не редактируют. В Admin → Settings →
Tribute → Payment activity backend предлагает только допустимые решения:

- первый paid grant для active local user без Remnawave link выполняет exact Telegram lookup и
  создаёт provider user только при доказанном miss; create timeout повторно проверяется чтением;
- перед первым paid mutation создаётся один `entitlement_baselines` snapshot. Его нельзя править
  вручную: scheduled `effective_access_restore` использует его для полного возврата base profile;
- pending paid grant/refund блокирует due restore того же user. Новый applied paid state отменяет
  предыдущую scheduled restore и ставит новую на актуальный paid expiry;
- `provider_state_not_restorable`, `baseline_missing` и `provider_state_conflict` требуют
  расследования; автоматический overwrite в этих состояниях не выполняется.

- `Retry` существует только для исчерпавшего автоматические попытки `provider_unavailable`. Он
  ставит ту же idempotent operation в очередь, не сбрасывает счётчик попыток и при выключенном gate
  остаётся queued без Remnawave mutation;
- `Resolve` требует понятную заметку и закрывает review без изменения доступа. Это не ручной grant,
  revoke или подтверждение provider state.

Каждый submit содержит новый client request UUID. UI повторяет тот же UUID после неопределённой
HTTP-ошибки, backend блокирует operation и сохраняет одну append-only action с actor и previous
state. После первой real baseline/restore записи или operator action соответствующий migration
downgrade намеренно прекращается, чтобы не потерять effective-access либо audit history. Включение
worker на production-like target требует отдельной проверки
backup/rollback, одного контролируемого donation/subscription сценария и наблюдения журнала;
текущий MVP не имеет готового production rollout runbook.

## Cloudflare Tunnel

`scripts/tunnel-up.ps1 -ConfirmPublic` принимает только backend с недоступными debug routes,
собирает frontend без mock auth, запускает preview на `127.0.0.1:4173` и отдельный Quick Tunnel.
`scripts/tunnel-down.ps1` останавливает только сохранённые PID; установленная системная служба
`cloudflared` не изменяется. Quick Tunnel — только временный dev/test канал без SLA. Официальные
ограничения: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

На машине с WARP локальное имя `trycloudflare.com` может разрешаться в `198.18.0.0/15` и не замыкаться
назад через TLS. `scripts/verify-tunnel.ps1` обходит только эту локальную петлю через внешний DNS для
проверки публичного edge.

Для заранее созданного named Tunnel published application route должен указывать exact test
hostname на `http://localhost:80`. Repository поднимает только безопасную production-сборку и не
управляет connector/DNS/route:

```powershell
.\scripts\dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://<test-host>'
```

Текущий hostname Flowvy на машине владельца — `https://dev-app.flowvy.io`. Поэтому канонический
полноценный запуск здесь использует exact URL, а не placeholder:

```powershell
.\scripts\dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://dev-app.flowvy.io'
```

Полный preflight перечислен в
[`DEV_ENVIRONMENT.md`](DEV_ENVIRONMENT.md#штатный-flowvy-dev-контур).

Команда передаёт тот же origin backend как `WEBAPP_URL`, разрешает Vite только этот hostname,
проверяет public root и `/api/health`. `dev-down` останавливает repo-owned preview, но не системный
`cloudflared`. Контракт сверён 2026-08-04 с
[Cloudflare published application routes](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/)
и [Vite `server.allowedHosts`](https://vite.dev/config/server-options#server-allowedhosts); глобальный
`allowedHosts: true` запрещён.

## Telegram Main Mini App для referral testing

Flowvy использует Main Mini App, а не bot deep link и не Direct Mini App. Для точного test bot
откройте `@BotFather` → `/mybots` → нужный bot → **Bot Settings** → **Configure Mini App** →
**Enable Mini App**, затем сохраните постоянный HTTPS URL именованного Tunnel. Это точный путь из
официальной Telegram Mini Apps documentation. Quick Tunnel для настройки не подходит: его hostname
меняется, а Telegram хранит URL в конфигурации бота.

После изменения BotFather-конфигурации перезапустите Telegram-enabled backend:

```powershell
.\scripts\dev-down.ps1
.\scripts\dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://<test-host>'
```

На startup backend выполняет Bot API `getMe`. Только событие `telegram_main_app_ready` означает,
что `GET /api/me/invite` может выдать `t.me/<bot>?startapp=...`. События
`telegram_main_app_not_configured` и `telegram_main_app_capability_unavailable` означают, что ссылка
намеренно скрыта; не заменяйте её `?start=` или `/<short_name>` без отдельного изменения продуктового
контракта. Проверяйте новый link новым Telegram account: Telegram должен открыть Mini App, а backend
получить invite из подписанного `initData.start_param`. В logs нельзя искать или печатать сам payload,
Telegram ID либо token.

Downgrade, очистка volume и production migration требуют отдельного плана, backup и явного
разрешения. Проверенного restore procedure пока нет.

## CI и артефакты

GitHub Actions выполняет backend/frontend validation на pull request и push в `main`. Browser failure
artifacts сохраняются как `playwright-artifacts`; локальные `test-results`, `playwright-report`,
coverage и `.artifacts` игнорируются Git. CI не собирает image и ничего не deploy.

## Ветки и релизы

- `dev` — единственная рабочая ветка: текущая разработка коммитится и пушится прямо в неё.
- `main` — только релизное состояние. Обычная разработка напрямую туда не отправляется.
- Отдельные task/feature/agent-ветки не создаются без явного изменения этого правила пользователем.
- Перед релизом состояние `dev` проходит свежую полную проверку и требуемую сборку. После переноса в
  `main` создаётся и публикуется согласованный version tag; имя/версия тега не придумываются
  автоматически.

Автоматизация release image/deployment пока отсутствует. Текущий CI проверяет push в `main`, но не
заменяет отдельный release-план, сборку артефакта и публикацию тега.

## Что отсутствует для production

- container/image и immutable release process;
- reverse proxy, TLS, allowed hosts/CORS и secret store/rotation;
- production platform wiring для liveness/readiness и monitoring/alerting;
- structured log redaction, tracing и retention;
- PostgreSQL/Redis backup, проверенный restore, disaster recovery и rollback;
- migration rollout/compatibility strategy;
- capacity/rate/timeout budgets и Remnawave/Kuma/Beszel outage policy;
- реальные incident runbooks и ownership/on-call.

До появления этих элементов production start/deploy должен считаться заблокированным. Будущие
операционные процедуры хранятся в [`runbooks/`](runbooks/README.md), решения — в
[`decisions/`](decisions/README.md).
