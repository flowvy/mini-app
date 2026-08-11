# Flowvy

Flowvy — Telegram Mini App и бот для управления подпиской на Xray-прокси через Remnawave.
Пользователь видит подписку, устройства и состояние сервиса; администратор — сводку, пользователей
и настройки интеграций/оформления. FastAPI выступает BFF, React-клиент работает только с его API.

## Статус

Проект находится в состоянии незавершённого MVP и пока не готов к production. Основные экраны и
backend-потоки реализованы; добавлены единые проверки, CI и первый mock UI smoke. Однако остаются
важные пробелы в production-защите и покрытии интерфейса. Критичный auth/debug/device/webhook
контур закрыт кодом и тестами 2026-08-01. Проверенные факты, известные проблемы
и ближайшее действие хранятся в
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## Состав проекта

- `backend/` — Python 3.12, FastAPI, aiogram, Dishka, SQLAlchemy/Alembic, PostgreSQL, Redis.
- `frontend/` — React 19, TypeScript, Vite, TanStack Router/Query, Telegram Apps SDK.
- `docker-compose.dev.yml` — только локальные PostgreSQL и Redis.
- `scripts/` и `.github/workflows/ci.yml` — одинаковые локальные и CI-проверки.
- `.agents/skills/` и `.codex/` — процедуры, узкие агенты и project guardrails Codex.
- `docs/` — архитектура, запуск и текущее состояние.
- `plans/` — живые планы крупных задач и их завершённые итоги.

## Быстрый локальный запуск

Нужны Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js с pnpm и Docker Desktop/Engine.
Команды ниже рассчитаны на PowerShell и запускаются из корня репозитория.

```powershell
docker compose -f docker-compose.dev.yml up -d postgres redis

Set-Location backend
Copy-Item .env.example .env
uv sync --locked
uv run alembic upgrade head
uv run python -m flowvy
```

Перед запуском проверьте `backend/.env`. Для изолированного localhost без реальных интеграций задайте
очевидно фиктивный `BOT_TOKEN=000000:TEST`, оставьте пустыми `WEBHOOK_URL`, `REMNAWAVE_URL`,
`REMNAWAVE_API_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `BESZEL_EMAIL`, `BESZEL_PASSWORD` и оставьте
`DEBUG=false`. Пустой token допустим
только для health/UI-каркаса без Telegram-auth; защищённые запросы при нём возвращают отказ.
Debug включайте лишь на изолированном localhost и никогда не совмещайте с Tunnel.

Во втором терминале:

```powershell
Set-Location frontend
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

Frontend доступен на `http://localhost:5173`, API — на `http://localhost:8001`; liveness —
`http://localhost:8001/api/health`, readiness PostgreSQL/Redis — `http://localhost:8001/api/ready`.
Для локального каркаса интерфейса установите
`VITE_MOCK_AUTH=true`. Экраны с реальными данными всё равно требуют настроенного backend либо
детерминированных mock-ответов; mock auth сам по себе не имитирует Remnawave, Kuma и Beszel.

Полная инструкция, включая Telegram tunnel и ограничения debug-режима:
[`docs/DEV_ENVIRONMENT.md`](docs/DEV_ENVIRONMENT.md).

После создания и проверки локальных `.env` тот же запуск можно выполнить одной командой:

```powershell
.\scripts\dev-up.ps1
# по окончании
.\scripts\dev-down.ps1
```

На машине владельца постоянный Telegram dev-контур использует уже созданный named Tunnel
`dev-app.flowvy.io`:

```powershell
.\scripts\dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://dev-app.flowvy.io'
```

Команда предполагает, что `backend/.env` содержит локальные test credentials, BotFather Main App
указывает на тот же URL, а Cloudflare published application route уже направляет hostname на
`http://localhost:80`. Полный контракт и безопасная очистка dev-данных описаны в
[`docs/DEV_ENVIRONMENT.md`](docs/DEV_ENVIRONMENT.md#штатный-flowvy-dev-контур).

Первичная установка отдельно доступна через `scripts/bootstrap.ps1`; ключ `-InstallBrowsers`
добавляет Chromium и WebKit для Playwright.

Временный Cloudflare Quick Tunnel открывается только через безопасную production-сборку и после
проверки, что backend работает с `DEBUG=false`:

```powershell
.\scripts\tunnel-up.ps1 -ConfirmPublic
# по окончании
.\scripts\tunnel-down.ps1
```

`scripts/verify-tunnel.ps1` выполняет тот же flow на синтетической конфигурации, проверяет публичные
auth/debug границы и сам всё останавливает. Для постоянного Telegram test bot нужен именованный
Tunnel со стабильным URL, а не временный Quick Tunnel.

## Проверки

```powershell
# из корня: выбрать проверки по текущему diff
.\scripts\verify.ps1 -Scope Changed

# полный gate с Docker, migrations, contracts и UI smoke
.\scripts\verify.ps1 -Scope Full
```

Backend-тесты с репозиториями требуют отдельную PostgreSQL БД `test`, которую создаёт
`backend/scripts/init-test-db.sql` при первом создании Compose volume. Frontend имеет Vitest-набор и
детерминированную Playwright state matrix на mock API: критические маршруты, роли, ошибки, mutations,
console/network cleanliness, accessibility, keyboard focus и четыре browser/viewport проекта.

## Карта документации

- [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — что реально сделано, что сломано и что делать
  следующим.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — границы компонентов, данные и доверенные зоны.
- [`docs/DEV_ENVIRONMENT.md`](docs/DEV_ENVIRONMENT.md) — установка, запуск и безопасная локальная
  разработка.
- [`docs/PRODUCT.md`](docs/PRODUCT.md) и [`docs/ROADMAP.md`](docs/ROADMAP.md) — текущие продуктовые
  потоки и порядок будущей работы.
- [`docs/TESTING.md`](docs/TESTING.md) и [`docs/SECURITY.md`](docs/SECURITY.md) — доказательство
  готовности и обязательные trust-инварианты.
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) и [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — внешние
  контракты и честные границы локальной/production эксплуатации.
- [`PLANS.md`](PLANS.md) — правила ведения больших задач.
- [`AGENTS.md`](AGENTS.md) — постоянные инструкции Codex; в backend, frontend, tests, migrations и
  docs действуют более точные вложенные инструкции.
- [`.agents/skills/`](.agents/skills/) — аудит, исследование интеграций, проверка изменений и UI.

## Работа с Codex

Перед задачей Codex должен прочитать корневой и ближайший вложенный `AGENTS.md`, проверить dirty
worktree и открыть `PROJECT_STATE.md`. Для большой или прерываемой работы создаётся план в
`plans/active/`. Готовность подтверждается только свежими командами и, для UI, реальной проверкой
поведения и отображения.
