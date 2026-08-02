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
запускаемых процессов; `-EnableTelegram` требует заранее настроенного HTTPS webhook и секрета. PID и
stdout/stderr находятся в `.artifacts/dev`. `dev-down` останавливает только записанные process trees
и Compose services, не удаляя `pgdata`.

Не удаляйте process file вручную, пока процессы живы. Не используйте `docker compose down -v` как
обычное исправление: volume содержит локальные данные и удаляется необратимо.

## Проверка состояния

- `GET /api/health` подтверждает только liveness FastAPI и не обращается к зависимостям.
- `GET /api/ready` параллельно проверяет `SELECT 1` в PostgreSQL и Redis `PING` с двухсекундными
  timeout. Возвращает только `ok/error` по компонентам, без внутренних адресов/ошибок. `dev-up`
  ждёт именно этот route; Remnawave/Kuma намеренно не входят в базовую readiness приложения.
- `docker compose -f docker-compose.dev.yml ps` показывает dev infrastructure.
- `.artifacts/dev/backend.stderr.log` и соседние logs — первая локальная диагностика, но в них не
  должны попадать secrets/payloads.
- `scripts/verify.ps1 -Scope Full` проверяет validation-контур; он не является runtime monitor.

## Миграции

Alembic загружает отдельный `MigrationSettings`, содержащий только `DATABASE_URL`, с тем же
приоритетом process environment → `backend/.env` → local default. Он не валидирует и не выводит
остальные application secrets. Перед ручной командой всё равно подтвердите точную target database. Локальный
`verify-migrations.ps1` создаёт случайную disposable БД, проверяет upgrade/downgrade/re-upgrade и
drift, затем удаляет её; CI делает zero-to-head на ephemeral PostgreSQL.

## Временный Cloudflare Tunnel

`scripts/tunnel-up.ps1 -ConfirmPublic` принимает только backend с недоступными debug routes,
собирает frontend без mock auth, запускает preview на `127.0.0.1:4173` и отдельный Quick Tunnel.
`scripts/tunnel-down.ps1` останавливает только сохранённые PID; установленная системная служба
`cloudflared` не изменяется. Quick Tunnel — только временный dev/test канал без SLA. Официальные
ограничения: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

На машине с WARP локальное имя `trycloudflare.com` может разрешаться в `198.18.0.0/15` и не замыкаться
назад через TLS. `scripts/verify-tunnel.ps1` обходит только эту локальную петлю через внешний DNS для
проверки публичного edge. Для постоянного тестового hostname используйте named Tunnel и Cloudflare
Access; repository scripts не меняют существующий service/DNS/config.

Downgrade, очистка volume и production migration требуют отдельного плана, backup и явного
разрешения. Проверенного restore procedure пока нет.

## CI и артефакты

GitHub Actions выполняет backend/frontend validation на pull request и push в `main`. Browser failure
artifacts сохраняются как `playwright-artifacts`; локальные `test-results`, `playwright-report`,
coverage и `.artifacts` игнорируются Git. CI не собирает image и ничего не deploy.

## Что отсутствует для production

- container/image и immutable release process;
- reverse proxy, TLS, allowed hosts/CORS и secret store/rotation;
- production platform wiring для liveness/readiness и monitoring/alerting;
- structured log redaction, tracing и retention;
- PostgreSQL/Redis backup, проверенный restore, disaster recovery и rollback;
- migration rollout/compatibility strategy;
- capacity/rate/timeout budgets и provider outage policy;
- реальные incident runbooks и ownership/on-call.

До появления этих элементов production start/deploy должен считаться заблокированным. Будущие
операционные процедуры хранятся в [`runbooks/`](runbooks/README.md), решения — в
[`decisions/`](decisions/README.md).
