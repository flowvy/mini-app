# Эксплуатация Flowvy

В репозитории есть воспроизводимая **локальная разработка и validation CI**, но нет готового
production deployment/operations контура. Этот документ не является разрешением запускать MVP на
публичном сервере. Требования безопасности: [`SECURITY.md`](SECURITY.md).

## Локальный lifecycle

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

Не удаляйте process file вручную, пока процессы живы. Не используйте `docker compose down -v` как
обычное исправление: volume содержит локальные данные и удаляется необратимо.

Для явно запрошенного чистого dev-сценария используйте только
`scripts/dev-reset-data.ps1 -ConfirmDevDataReset` после `dev-down`. Script очищает application schema
в database `flowvy` и Redis DB 0, повторно применяет migrations и сохраняет test database, Docker
volume и все внешние provider data. Ручной `DROP DATABASE`, `docker compose down -v` и очистка
provider не являются частью dev lifecycle.

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

Текущий hostname Flowvy на машине владельца — `https://dev-app.flowvy.io`; каноническая команда и
preflight перечислены в [`DEV_ENVIRONMENT.md`](DEV_ENVIRONMENT.md#штатный-flowvy-dev-контур).

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
