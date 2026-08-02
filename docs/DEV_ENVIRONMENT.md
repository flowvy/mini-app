# Локальная среда Flowvy

Инструкция разделяет безопасную локальную разработку и подключение реальных
Telegram/Remnawave/Kuma/Beszel. По умолчанию не используйте реальные внешние системы.

## Что понадобится

- Python 3.12+ и `uv`;
- Node.js и `pnpm`;
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
```

Для первичной установки locked dependencies из корня используйте:

```powershell
.\scripts\bootstrap.ps1
# либо сразу установить Chromium и WebKit
.\scripts\bootstrap.ps1 -InstallBrowsers
```

## Инфраструктура

Из корня репозитория:

```powershell
docker compose -f docker-compose.dev.yml up -d postgres redis
docker compose -f docker-compose.dev.yml ps
```

Compose публикует PostgreSQL 16 на `localhost:5432` и Redis 7 на `localhost:6379`. Backend и frontend
в Compose не входят. Named volume `pgdata` сохраняет dev data между перезапусками.

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
VITE_BOT_USERNAME=
VITE_MOCK_AUTH=true
VITE_DEBUG_TELEGRAM_ID=
VITE_DEBUG_DEVICES_EMPTY=
```

Vite слушает только `http://127.0.0.1:5173` и проксирует `/api` и `/webhook` на backend. Same-origin
`VITE_API_URL=/api` одинаково работает с localhost, preview и Tunnel.

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

После создания и проверки `backend/.env` из корня можно запустить весь dev-контур:

```powershell
.\scripts\dev-up.ps1
```

Script устанавливает dependencies, поднимает PostgreSQL/Redis, явно привязывает backend и Alembic к
Compose URL (даже если в системном окружении уже есть другой `DATABASE_URL`), применяет migrations,
запускает backend/frontend скрытыми процессами и ждёт `http://127.0.0.1:8001/api/ready` и Vite. PID и
logs хранятся в `.artifacts/dev`; повторный запуск блокируется, а занятые `8001`/`5173` не
перехватываются. После уже выполненного bootstrap можно добавить `-SkipInstall`.

По умолчанию script обнуляет Telegram token/webhook только для запускаемых процессов, чтобы локальный
старт не перенастроил реального бота. Для осознанного теста Telegram после настройки HTTPS URL и
`TELEGRAM_WEBHOOK_SECRET` используйте `dev-up.ps1 -EnableTelegram`.

Остановка выполняется через `.\scripts\dev-down.ps1`: script завершает только записанные им process
trees, останавливает Compose services и сохраняет volumes.

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
.\scripts\verify.ps1 -Scope Changed
.\scripts\verify.ps1 -Scope Full   # требует Docker и установленных browser binaries
```

`Full` добавляет migrations, полный pytest, Remnawave snapshot/client check и UI smoke. GitHub
Actions выполняет тот же минимальный backend/frontend контур на pull request и push в `main`.

## Cloudflare Tunnel и реальный Telegram test flow

Обычный Vite dev server не публикуйте. Для временного UI/API smoke при уже запущенном backend с
`DEBUG=false`:

```powershell
.\scripts\tunnel-up.ps1 -ConfirmPublic
# если локальный WARP не позволяет открыть собственный trycloudflare URL:
.\scripts\tunnel-up.ps1 -ConfirmPublic -SkipLocalReachability
.\scripts\tunnel-down.ps1
```

Script создаёт отдельную production-сборку с `VITE_API_URL=/api`, `VITE_MOCK_AUTH=false`, preview на
`:4173`, проверяет отсутствие debug route и сохраняет только собственные PID. Quick Tunnel имеет
динамический URL и подходит только для короткого smoke. Полная синтетическая проверка одной командой:

```powershell
.\scripts\verify-tunnel.ps1
```

Для Telegram webhook используйте отдельного test bot и named Tunnel со стабильным HTTPS URL:

1. заранее задайте `WEBAPP_URL=https://<test-host>`, `WEBHOOK_URL=https://<test-host>/webhook`;
2. сгенерируйте случайный `TELEGRAM_WEBHOOK_SECRET` допустимого формата;
3. оставьте `DEBUG=false`, включите Cloudflare Access там, где это совместимо с Telegram callbacks;
4. перезапустите backend и проверяйте только test account/provider data.

Не записывайте token, initData, secret или приватный tunnel config в Git, logs, screenshots и планы.
Repository scripts не останавливают и не перенастраивают существующую службу Cloudflare.

## Остановка

Остановите процессы backend/frontend обычным `Ctrl+C`, затем из корня:

```powershell
docker compose -f docker-compose.dev.yml stop postgres redis
```

Команда сохраняет volume. Удаление volume необратимо удаляет локальную dev/test БД и не относится к
обычной остановке.
