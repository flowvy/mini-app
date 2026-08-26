# Локальная среда Flowvy

Инструкция разделяет безопасную локальную разработку и подключение реальных
Telegram/Remnawave/Kuma/Beszel. По умолчанию не используйте реальные внешние системы.

## Что понадобится

- Python 3.14.7 и `uv 0.12.6`;
- Node.js 24.19.0 LTS и `pnpm 11.24.0`;
- PowerShell 7 (`pwsh`) для checked-in lifecycle scripts;
- Docker Desktop/Engine с Compose;
- для реального Telegram Mini App — тестовый bot/account и HTTPS tunnel;
- Chromium и WebKit для browser test suite.

Проверка инструментов:

```powershell
python --version
uv --version
node --version
pnpm --version
docker version
docker compose version
pwsh --version
```

### Новый Mac

На Apple Silicon установите актуальные Command Line Tools, Docker Desktop for Mac (Apple Silicon),
PowerShell 7 и locked toolchain. Один воспроизводимый вариант через Homebrew:

```bash
xcode-select --install
brew install uv node@24 cloudflared
brew install --cask powershell
corepack enable
corepack prepare pnpm@11.24.0 --activate
uv python install 3.14.7 --default
```

Homebrew устанавливает `node@24` как keg-only formula. Если другая Node уже linked, добавьте exact
runtime в `PATH` текущего shell перед bootstrap и проверками:

```bash
export PATH="$HOME/.local/bin:$(brew --prefix node@24)/bin:$PATH"
node --version
python --version
```

Node 24 выбран осознанно как актуальная LTS-линия, а не как самая новая Current-линия.
`frontend/package.json` намеренно ограничивает runtime диапазоном `>=24.19.0 <25`, а
`frontend/.node-version` и CI фиксируют exact patch `24.19.0`. Более старый global Node 22 и
более новый Current Node 26 не являются repository toolchain; наличие их в `PATH`
не меняет checked-in requirement. После `brew install` всегда проверяйте exact
`node --version`; если formula перешла на другой patch, используйте version manager либо
подписанный exact build из [Node.js 24.19.0 archive](https://nodejs.org/download/release/v24.19.0/).
`uv python install --default` создаёт user-local `python`/`python3` shims в `$HOME/.local/bin`;
repository backend дополнительно фиксирует ту же версию через `backend/.python-version`.

После установки один раз откройте Docker Desktop и дождитесь `docker info`. `uv` официально
поддерживает Apple Silicon, `frontend/.node-version` фиксирует Node 24.19.0 LTS,
`frontend/package.json` фиксирует `pnpm@11.24.0`, и те же версии использует CI. `.venv`,
`node_modules`, `dist`, `.artifacts` и Docker volumes создаются локально из lockfiles/Compose и не
переносятся между машинами. Локальные `.env` переносятся только отдельным защищённым каналом и
никогда не попадают в Git.

Контракт сверён 2026-08-26 с официальными инструкциями и release data:
[Node.js release archive](https://nodejs.org/download/release/v24.19.0/),
[Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/),
[`uv` installation/platform support](https://docs.astral.sh/uv/getting-started/installation/),
[PowerShell platform variables](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_automatic_variables?view=powershell-7.6)
и [`cloudflared` downloads](https://developers.cloudflare.com/tunnel/downloads/).

Все local repository workflows выполняются в PowerShell 7 на macOS.

Для первичной установки locked dependencies из корня используйте:

```powershell
./scripts/bootstrap.ps1
# либо сразу установить Chromium и WebKit
./scripts/bootstrap.ps1 -InstallBrowsers
```

## Инфраструктура

Из корня репозитория:

```powershell
docker compose -f docker-compose.dev.yml up -d postgres redis
docker compose -f docker-compose.dev.yml ps
```

Compose публикует PostgreSQL 18.6 на `localhost:5432` и Redis 8.10.1 на `localhost:6379`. Backend и
frontend в Compose не входят. Named volume `pgdata18` сохраняет dev data между перезапусками.

PostgreSQL major нельзя обновлять прямым подключением старого data directory. При переходе с 16 на
18 сохраните старый `pgdata` volume и переносите данные через `pg_dump`/`pg_restore` либо
`pg_upgrade`; обычный `docker compose up` не является процедурой миграции данных. PostgreSQL 18
также использует mount `/var/lib/postgresql`, соответствующий текущему official image contract.

При первом создании volume PostgreSQL выполняет `backend/scripts/init-test-db.sql`: создаёт отдельные
database/user `test` для pytest. Если volume существовал раньше, init script повторно автоматически
не запускается. Не удаляйте volume ради тестов без явного согласия владельца данных.

## Backend

```powershell
Set-Location backend
uv sync --frozen
Copy-Item .env.example .env
```

Минимальная безопасная локальная конфигурация:

```dotenv
BOT_TOKEN=000000:TEST
WEBHOOK_URL=
TELEGRAM_WEBHOOK_SECRET=
WEBAPP_URL=http://localhost:5173
ADMIN_TELEGRAM_IDS=
DATABASE_URL=postgresql+asyncpg://flowvy:flowvy_dev@localhost:5432/flowvy
REDIS_URL=redis://localhost:6379/0
REMNAWAVE_URL=
REMNAWAVE_API_TOKEN=
REMNAWAVE_WEBHOOK_SECRET=
BESZEL_EMAIL=
BESZEL_PASSWORD=
BESZEL_ALLOWED_PRIVATE_ORIGINS=
DEBUG=false
```

`.env.example` безопасен для локального копирования: внешние URL пустые. Непустой `REMNAWAVE_URL`
заставляет backend проверить panel при startup и завершиться, если она недоступна. `000000:TEST` —
только очевидный fake. Пустой token разрешает health/UI-каркас, но Telegram-auth при нём закрыт.

Примените migrations и запустите API:

```powershell
uv run alembic upgrade head
uv run python -m flowvy
```

Backend слушает `http://localhost:8001`; базовая проверка:

```powershell
Invoke-RestMethod http://localhost:8001/api/health
```

Alembic загружает только `DATABASE_URL` через отдельный `MigrationSettings`: process environment
имеет приоритет над `backend/.env`, затем используется local default. Остальные application secrets
не валидируются миграционным процессом. Перед любой ручной миграцией всё равно подтвердите целевую БД.

## Frontend

В отдельном терминале:

```powershell
Set-Location frontend
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm dev
```

Рекомендуемый локальный `.env`:

```dotenv
VITE_API_URL=/api
VITE_MOCK_AUTH=true
VITE_DEBUG_TELEGRAM_ID=
VITE_DEBUG_DEVICES_EMPTY=
```

Vite слушает только `http://127.0.0.1:5173` и проксирует `/api` и `/webhook` на backend. Same-origin
`VITE_API_URL=/api` одинаково работает с localhost, preview и Tunnel.
Bot username и тип Mini App не являются frontend configuration. При Telegram-enabled startup
backend читает их через Bot API `getMe` и публикует referral URL только при
`has_main_web_app=true`. Публичный referral использует bot deep link `t.me/<bot>?start=ref_…`, чтобы
создать чат; кнопка полученного neutral Welcome открывает Main Mini App через
`t.me/<bot>?startapp=ref_…`. Direct Mini App для referral не поддерживается.

До live referral-теста откройте `@BotFather` → `/mybots` → точный test bot → **Bot Settings** →
**Configure Mini App** → **Enable Mini App** и задайте постоянный публичный HTTPS URL текущего
dev-контура. Menu Button или inline `web_app` button не заменяют эту настройку. Quick Tunnel годится
для краткой ручной проверки страницы, но его случайный hostname меняется после перезапуска и поэтому
не подходит как сохранённый Main Mini App URL.

### Что даёт mock auth

`VITE_MOCK_AUTH=true` создаёт локального mock admin и переводит hooks на `/api/debug/...` там, где
такой путь реализован. Для этого backend должен иметь `DEBUG=true`. Это позволяет проверять shell,
навигацию и часть настроек без Telegram, но не создаёт фиктивные Remnawave/Kuma/Beszel ответы:

- Home/Devices с `VITE_DEBUG_TELEGRAM_ID` обращаются к настоящему настроенному Remnawave;
- без ID часть запросов возвращается к auth-protected API;
- dashboard/users/Pulse также требуют provider data или явных network mocks.

Поэтому воспроизводимые UI-тесты должны перехватывать API либо поднимать fake services, а не
использовать реальную панель. Никогда не публикуйте frontend с `VITE_MOCK_AUTH=true` и backend с
`DEBUG=true`.

## Управляемый запуск

После создания и проверки `backend/.env` из корня можно запустить localhost-only контур без Telegram
и публичного Tunnel:

```powershell
./scripts/dev-up.ps1
```

Script устанавливает dependencies, поднимает PostgreSQL/Redis, явно привязывает backend и Alembic к
Compose URL (даже если в системном окружении уже есть другой `DATABASE_URL`), применяет migrations,
запускает backend/frontend фоновыми процессами и ждёт `http://127.0.0.1:8001/api/ready` и Vite. PID и
logs хранятся в `.artifacts/dev`; повторный запуск блокируется, а занятые `8001`/`5173` не
перехватываются. После уже выполненного bootstrap можно добавить `-SkipInstall`.

По умолчанию script обнуляет Telegram token/webhook только для запускаемых процессов, чтобы локальный
старт не перенастроил реального бота. Для осознанного теста test bot используйте
`dev-up.ps1 -EnableTelegram`: при пустом `WEBHOOK_URL` backend удалит прежний webhook и включит
long polling, а при полном HTTPS webhook-конфиге зарегистрирует callback. Для кнопки Mini App в
обоих случаях нужен публичный HTTPS `WEBAPP_URL`; для Main Mini App он должен совпадать с
постоянным URL, сохранённым в BotFather. Не запускайте второй polling-процесс этого бота.

Если named Tunnel уже создан и его published application route направлен на
`http://localhost:4173`, весь Telegram dev-контур запускается одной командой:

```powershell
./scripts/dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://<test-host>'
```

`NamedTunnelUrl` принимает только чистый HTTPS origin, передаёт его backend как process-level
`WEBAPP_URL`, собирает frontend без mock/debug flags и поднимает отдельный preview на
`127.0.0.1:4173`. Значение не записывается в `.env`. Script
проверяет local debug route, public root и
`/api/health`, но не создаёт DNS/route, не запускает и не перенастраивает системный `cloudflared`.

Остановка выполняется через `./scripts/dev-down.ps1`: script завершает только записанные им process
trees, включая repo-owned public preview, останавливает Compose services и сохраняет volumes.

## Штатный Flowvy dev-контур

Для этого репозитория постоянный test hostname — `https://dev-app.flowvy.io`. Он не является
секретом и предназначен только для локального test bot/Mini App. Термины **полноценный dev** и
**штатный dev** в задачах этого репозитория всегда означают именно Telegram-enabled named-Tunnel
контур ниже, а не простой `dev-up.ps1`. Localhost-only режим запускается только по явному запросу
без Tunnel/интеграций. После первичного bootstrap и заполнения локального `backend/.env` обычный
запуск после перезагрузки выполняется из корня:

```powershell
./scripts/dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://dev-app.flowvy.io'
```

Перед запуском должны одновременно выполняться условия:

- Docker Desktop и системный `cloudflared` connector запущены;
- Cloudflare route `dev-app.flowvy.io` направлен на `http://localhost:4173`;
- BotFather Main App test bot указывает на `https://dev-app.flowvy.io`;
- `backend/.env` содержит только локальные test credentials, `DEBUG=false`, а `WEBHOOK_URL` пуст
  для long polling;
- другой polling-процесс того же bot не работает.

### Named Tunnel на macOS

Public hostname и BotFather Main Mini App URL остаются `https://dev-app.flowvy.io`, а Cloudflare
Service URL — `http://localhost:4173`. Repository не читает tunnel token и не изменяет эту внешнюю
конфигурацию. Не запускайте параллельные tunnel connectors или polling-процессы одного Telegram bot.
После запуска подтвердите local/public root, `/api/health`, `/api/ready` = `200`, public debug =
`404` и только затем открывайте test Mini App. Public hostname → local Service URL mapping и macOS
launch-agent lifecycle сверены 2026-08-21 с
[Cloudflare routing](https://developers.cloudflare.com/tunnel/routing/) и
[Cloudflare macOS service](https://developers.cloudflare.com/tunnel/advanced/local-management/as-a-service/macos/).

Успешный startup означает: local/public root, `/api/health` и `/api/ready` отвечают `200`, public
debug route отвечает `404`, а backend log содержит `telegram_main_app_ready`. Остановка всегда
выполняется одной командой:

```powershell
./scripts/dev-down.ps1
```

Если нужен полностью чистый локальный сценарий, сначала остановите dev, затем используйте отдельную
команду с явным подтверждением:

```powershell
./scripts/dev-down.ps1
./scripts/dev-reset-data.ps1 -ConfirmDevDataReset
./scripts/dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://dev-app.flowvy.io'
```

`dev-reset-data.ps1` работает только с Compose service `postgres`, database `flowvy` и Redis DB 0.
Он отказывается запускаться при живом Flowvy dev/занятых app ports, пересоздаёт только schema
`public`, применяет migrations до `head`, возвращает singleton settings к migration defaults и
проверяет отсутствие user/runtime rows и Redis keys.
Отдельная test database и named Docker volume сохраняются; Remnawave и другие внешние системы не
изменяются. Ключ подтверждения обязателен, потому что восстановление удалённых dev-данных не
предусмотрено.

## Проверки

Backend, из `backend/`:

```powershell
uv run ruff check .
uv run ruff format --check .
uv run pytest -x -v
```

Полный pytest требует `test` PostgreSQL. Redis и внешние API должны подменяться там, где тест
проверяет изолированную логику. Если инфраструктуры нет, запустите только явно database-free tests и
сообщите, что полный suite не проверен.

Frontend, из `frontend/`:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:e2e:all
pnpm test:e2e:live  # только после dev-up и проверки реального target
```

Текущий baseline содержит unit tests для formatter/API decisions и Playwright state matrix для
критических user/admin routes на полностью mocked API. По умолчанию `test:e2e` запускает основной
Chromium viewport; `test:e2e:all` добавляет small mobile, WebKit/iPhone и desktop. Матрица включает
light/dark, role/loading/error/malformed/mutation, keyboard, axe, overflow и visual evidence.
`test:e2e:live` использует настоящий BFF/provider только read-only. Точные правила находятся в
`frontend/tests/e2e/AGENTS.md`.

Change-aware gate из корня:

```powershell
./scripts/verify.ps1 -Scope Changed
./scripts/verify.ps1 -Scope Full   # требует Docker и установленных browser binaries
```

Full gate включает `verify-tooling.ps1`, который парсит все PowerShell scripts и проверяет macOS
lifecycle contract.

`Full` добавляет migrations, полный pytest, Remnawave snapshot/client check и UI smoke. GitHub
Actions выполняет тот же минимальный backend/frontend контур на pull request и push в `dev`/`main`.

## Cloudflare Tunnel и реальный Telegram test flow

Обычный Vite dev server не публикуйте. Для временного UI/API smoke при уже запущенном backend с
`DEBUG=false`:

```powershell
./scripts/tunnel-up.ps1 -ConfirmPublic
# если локальный WARP не позволяет открыть собственный trycloudflare URL:
./scripts/tunnel-up.ps1 -ConfirmPublic -SkipLocalReachability
./scripts/tunnel-down.ps1
```

Script создаёт отдельную production-сборку с `VITE_API_URL=/api`, `VITE_MOCK_AUTH=false`, preview на
`:4173`, проверяет отсутствие debug route и сохраняет только собственные PID. Quick Tunnel имеет
динамический URL и подходит только для короткого smoke. Полная синтетическая проверка одной командой:

```powershell
./scripts/verify-tunnel.ps1
```

Для уже настроенного named Tunnel безопасный origin можно поднять отдельно на port `4173`:

```powershell
./scripts/tunnel-up.ps1 -ConfirmPublic `
    -NamedTunnelUrl 'https://<test-host>'
./scripts/tunnel-down.ps1
```

В Cloudflare published application route должен заранее существовать exact hostname с matching
service `http://localhost:4173`. В named mode script задаёт Vite только exact разрешённый hostname, проверяет public
root и `/api/health` и не создаёт второй connector. Для обычного рабочего цикла предпочтите единый
`dev-up -EnableTelegram -NamedTunnelUrl ...`, чтобы backend получил тот же `WEBAPP_URL`.

Для Telegram webhook используйте отдельного test bot и тот же стабильный HTTPS URL:

1. задайте `WEBHOOK_URL=https://<test-host>/webhook` в local-only backend environment;
2. сгенерируйте случайный `TELEGRAM_WEBHOOK_SECRET` допустимого формата;
3. оставьте `DEBUG=false`, включите Cloudflare Access там, где это совместимо с Telegram callbacks;
4. запустите `dev-up -EnableTelegram -NamedTunnelUrl 'https://<test-host>'` и проверяйте только test
   account/provider data.

Без `WEBHOOK_URL` этот же запуск использует long polling; публичный hostname всё равно нужен Main
Mini App. Published application routes описаны в
[Cloudflare Tunnel routing](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/),
а exact host allow-list — в [Vite server options](https://vite.dev/config/server-options#server-allowedhosts)
(проверено 2026-08-04). Не задавайте Vite `allowedHosts: true`.

Не записывайте token, initData, secret или приватный tunnel config в Git, logs, screenshots и планы.
Repository scripts не останавливают и не перенастраивают существующую службу Cloudflare.

## Остановка

Остановите процессы backend/frontend обычным `Ctrl+C`, затем из корня:

```powershell
docker compose -f docker-compose.dev.yml stop postgres redis
```

Команда сохраняет volume. Удаление volume необратимо удаляет локальную dev/test БД и не относится к
обычной остановке.
