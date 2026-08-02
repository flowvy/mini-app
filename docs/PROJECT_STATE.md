# Текущее состояние Flowvy

Последняя проверка: **2026-08-02**
Проверенный Git baseline до текущего diff: **`939281d`** (`dev`)
Стадия: **незавершённый MVP; production readiness не подтверждена**

Этот файл описывает наблюдаемое состояние, а не желаемую функциональность. При расхождении с кодом,
миграциями или свежим выводом команды сначала исправляется факт, затем этот документ.

## Что уже существует

### Backend

- FastAPI BFF на `:8001`, Telegram bot на aiogram и webhook route `/webhook`.
- Проверка Telegram Mini App `initData`, синхронизация локального пользователя и admin-роли из
  `ADMIN_TELEGRAM_IDS`.
- Пользовательские API для профиля, подписки, HWID-устройств и provider-neutral Pulse.
- Admin API для dashboard, пользователей, действий над пользователем, выбора Kuma/Beszel для Pulse,
  branding и welcome template/media.
- Remnawave client, HMAC-проверка Remnawave webhook и инвалидация связанных Redis cache keys.
- Version-aware Remnawave client поддерживает 2.7/2.8 и 3.0/3.1: числовой provider ID является
  основной identity, UUID остаётся optional только для legacy 2.x, неизвестный major закрывается.
- Async PostgreSQL/SQLAlchemy, Redis, Dishka DI и линейная цепочка Alembic migrations.
- Метрики запросов/активности и периодические snapshot-записи.
- Fail-closed Telegram auth: пустой token не принимается, проверяются TTL/future timestamp/user,
  inactive user блокируется, Redis activity write работает best-effort.
- Admin требует одновременно active user, сохранённую роль и актуальный `ADMIN_TELEGRAM_IDS`.
- Debug routers по умолчанию не регистрируются; Telegram webhook использует secret registration и
  header; device ownership подтверждается свежим Remnawave lookup перед чтением/удалением.
- Remnawave webhook сверяет официальные signature/timestamp delivery headers, отклоняет старые,
  будущие, слишком большие и malformed payloads, атомарно подавляет повторы и не хранит raw `data`.
  Event metadata имеет timezone-aware timestamps и пакетную 30-дневную очистку.

### Frontend

- React/TanStack приложение с Telegram SDK, mock-admin режимом и авторизационным guard.
- Пользовательские маршруты Home, Devices, Pulse и Support.
- Admin dashboard, список/карточка пользователя, действия, выбор Pulse source, отдельные
  Kuma/Beszel/branding/welcome settings и Broadcast route.
- Query hooks, typed view models, i18next English locale, CSS Modules и светлая/тёмная тема на
  дизайн-токенах.
- Прямые admin/user URL и browser history через TanStack Router.
- Same-origin `/api` для localhost/Tunnel и корректная обработка успешного `204 No Content`.

### Codex и проверка репозитория

- Корневой и вложенные `AGENTS.md`, живые ExecPlans и этот handoff-файл разделяют постоянные правила,
  план текущей задачи и проверенное состояние проекта.
- Четыре repo skills: read-only аудит, проверка diff, UI verification и исследование внешней
  интеграции.
- Минимальная `.codex/config.toml`, project rules для опасных команд и четыре узких custom agents для
  карты репозитория, документации, интеграций и UI.
- Устаревшие assistant-specific instructions, commands, skills, settings и browser cache удалены;
  явная filesystem/text проверка не нашла оставшихся legacy paths/references.
- PowerShell scripts для bootstrap, запуска/остановки, change-aware/full verification, migrations,
  Remnawave snapshot/client tests, безопасного Quick Tunnel и проверки документации.
- GitHub Actions CI с PostgreSQL/Redis, Ruff, Alembic, pytest, Biome/TypeScript/Vitest/build и
  Playwright Chromium smoke.
- Три Vitest unit файла (10 тестов), детерминированная Playwright state matrix на четырёх
  browser/viewport проектах и отдельный read-only live-smoke.

## Что не завершено или не доказано

- Support и Broadcast пока отображают `coming soon`; отправка рассылки не реализована.
- Нет production deployment manifests, проверенных production runbooks и production-контура.
- Нет component tests и integrated fake-backend suite; offline/network-loss поведение проверяется
  только на уровне перехваченных ошибок, а не реальным отключением браузера.
- Новый GitHub Actions workflow ещё не выполнялся в удалённом репозитории; его зелёный статус не
  подтверждён этой локальной проверкой.
- Repository pytest fixtures создают схему через `Base.metadata.create_all()`, но отдельный migration
  verifier проверяет disposable zero-to-head, downgrade/re-upgrade, один head и model drift. Для
  previous-head дополнительно проверяются webhook payload/backfill/redaction/timezone conversion и
  сохранность legacy Remnawave UUID при добавлении unique nullable numeric identity.
- `docs/api-remnawave.json` — локальный snapshot версии 2.7.4 без зафиксированного source/date.
  Он оставлен как legacy envelope fixture. Контракты 2.8.1, 3.0.0 и 3.1.0 сверены с official exact
  tags и release/API diff; установленная dev-панель 2.8.1 проверена read-only. Живой 3.x target пока
  не проверен, потому что локальная панель ещё не обновлена.
- Реальный Remnawave проверен read-only. Beszel сохранён и включён в локальном dev;
  signed public `GET /api/pulse` вернул `200`, `operational`, 1 group и 7 monitors.
  Kuma live target пока не настроен. Telegram dev bot открывает Mini App; ручная
  проверка последнего no-reload/keyboard UX остаётся за владельцем.

## Известные приоритетные проблемы

### Закрытые P0 — 2026-08-01

- `DEBUG=false` стал default; debug routers отсутствуют в обычном OpenAPI/route table.
- Пустой/пробельный `BOT_TOKEN` закрывает Telegram-auth, а неполный webhook config не проходит
  Settings validation.
- Inactive user и отозванный admin получают `403`; admin allow-list проверяется на каждый запрос.
- Device read/delete/delete-all используют свежий exact provider lookup и останавливаются при
  отсутствии/неоднозначности owner.
- Telegram webhook регистрирует и проверяет один secret; без конфигурации endpoint отсутствует.
- Публичный synthetic Quick Tunnel подтвердил: health `200`, auth без initData `401`, debug/webhook
  `404`, исходный TypeScript не выдаётся.

Это локальное доказательство, не независимый security audit и не разрешение production deployment.

### P1 — корректность и надёжность MVP

- Remnawave webhook имеет freshness/replay/size/schema checks, атомарную дедупликацию, минимальное
  хранение, timezone migration и bounded retention.
- Общая Kuma/Beszel transport boundary проверяет и pin-ит DNS, блокирует
  private/link-local/redirect/proxy targets, ограничивает body и скрывает upstream diagnostics.
  Kuma 1.x/2.x и Beszel v0.18.7 contracts зафиксированы; Pulse корректно обрабатывает
  incidents, all-down/pending/maintenance/empty, Beszel 1m/20m history и cache drift.
- Welcome-media сканируется до provider side effect и передаётся chunks без второй полной копии;
  raw Telegram/Remnawave/Kuma/Beszel errors не возвращаются клиенту.
- Remnawave email array и dashboard DTO зафиксированы contract tests; dashboard отдаёт только
  allow-listed поля, повреждённый cache восстанавливается.
- Remnawave 3.x migration закрыта в client/BFF/frontend: stream lookup с bounded cursor pagination,
  UUID-less user schema, numeric HWID/action paths и bodies, `204` delete, dual-version local cache и
  fail-closed identity conflicts покрыты deterministic tests.
- Request metrics больше не зависят от порядка Dishka middleware и работают best-effort; daily keys
  имеют 90-дневный TTL. Last-seen hash атомарно переименовывается, поэтому concurrent writes и
  неуспешный DB commit не теряются.
- `/api/health` остаётся liveness, `/api/ready` проверяет PostgreSQL/Redis; dev-up ждёт readiness.

Основная route/UI error, mutation и permission матрица закрыта. Остаются удалённый CI, live
Kuma и полный Telegram test-bot flow.

### P2 — поддерживаемость

- Не настроен статический Python type checker.
- В `queryKeys` остаётся неиспользуемый ключ `nodes`, хотя отдельного nodes flow в текущем коде нет.
- Единственная locale — English; один admin fallback остаётся hardcoded, locale parity и
  plural/fallback tests отсутствуют.

## Последняя свежая проверка

P0 команды запускались 2026-08-01. Backend P1 этапы и Remnawave 3.x compatibility повторно полностью
проверены 2026-08-02 после webhook/Kuma/upload/provider/metrics/readiness изменений.

| Область | Команда | Результат |
|---|---|---|
| Backend collection | full pytest run | 256 тестов выполнено |
| Backend lock/lint/format | `uv lock --check`; Ruff checks | пройдено, 118 Python файлов formatted |
| Backend полный suite | `uv run --frozen pytest -q` | 256 passed; warnings скрыты только в финальном orchestration output |
| Remnawave webhook focused | route/service + PostgreSQL tests | 29 service-free и 3 repository tests passed; concurrent duplicate принят один раз |
| Kuma/Beszel/Pulse focused | target/client/provider/Pulse tests | draft test без persistence добавлен; DNS pinning, auth/contracts, pagination bounds, cache, history и status matrix входят в full suite |
| Media upload focused | bounded stream/provider tests | 11 passed; no second full buffer, pre-send rejection и safe errors |
| Provider/dashboard focused | client/routes/cache tests | 23 passed; email array, envelope, safe errors и allow-list projection |
| Metrics/readiness focused | middleware/collector/health tests | 13 passed; включая реальные Docker PostgreSQL/Redis и app lifespan |
| Alembic disposable | `scripts/verify-migrations.ps1` | один head; zero/previous-head upgrade, Kuma→Pulse provider preservation, webhook hardening, legacy UUID/numeric ID, downgrade/re-upgrade и drift пройдены |
| Remnawave snapshot/client | 31 client tests + live smoke | legacy 2.7.4 snapshot и exact 2.8.1/3.0.0/3.1.0 fixtures; реальная 2.8.1 прочитана без mutations |
| Docs | `scripts/verify-docs.ps1` | все локальные Markdown links разрешаются |
| Legacy cleanup | filesystem/text scan | obsolete assistant-specific paths/references не найдены |
| PowerShell/tool policy | parser + `codex execpolicy check` | все scripts parsed; forbid/prompt/safe rule cases совпали с ожиданием |
| Codex fresh session | `codex exec --ephemeral --strict-config ...` | config принят; корневой `AGENTS.md`, четыре repo skills и custom role `repo_mapper` обнаружены |
| Change-aware gate | `scripts/verify.ps1 -Scope Changed -SkipE2E` | backend fast, frontend install/lint/type/unit/build и docs passed; E2E подтверждён отдельно |
| Полный локальный gate | `scripts/verify.ps1 -Scope Full` | migrations, 256 pytest, 31 Remnawave contract, frontend build/unit, 26 Chromium browser и docs passed |
| Frontend lint/typecheck | `pnpm lint`; `pnpm typecheck` | пройдено, 149 linted files |
| Frontend unit | `pnpm test` | 3 files, 10 tests passed |
| Frontend build | `pnpm build` | пройдено |
| Browser smoke | `pnpm test:e2e` | 26 mobile Chromium tests; no-reload Pulse, native keyboard dismissal, motion/Reduce Motion, iOS focus zoom, console/network/axe guards |
| Browser all projects | `pnpm test:e2e:all` | 104/104 passed: 430x932, 320x568, iPhone 13/WebKit, 1280x900 |
| Live browser smoke | `pnpm test:e2e:live` | Home/Devices/admin dashboard/users/settings прошли через реальный локальный BFF и Remnawave 2.8.1 |
| Visual UI | Playwright evidence + manual review | Pulse source, Beszel и единая load error state просмотрены в light/dark; overflow/cropping не найден, dialog focus проверен |
| Public Tunnel smoke | signed requests + built asset check | root/health `200`, новый JS с `hideKeyboard`/auth query, Beszel Pulse `200 operational` (7 monitors), debug API отсутствует в bundle |
| GitHub CI | `.github/workflows/ci.yml` | локально не выполнялся и ещё не подтверждён remote run |

## Разрешённая очистка прежнего worktree

2026-08-02 пользователь явно разрешил восстановить `frontend/src/components/ui/action-btn.module.css`
из Git и удалить untracked `RADIUS_AUDIT.md`. Оба пути после операции чисты.

## Следующее действие

Ручную в Telegram Mini App проверить: выключение/включение Pulse сразу меняет таб-бар,
а Enter скрывает клавиатуру во всех однострочных полях. После обновления dev-панели
повторить read-only smoke на Remnawave 3.x; отдельно нужны Kuma public URL/slug и первый
подтверждённый удалённый CI run. Затем выбирать следующий продуктовый поток: Support или безопасный
Broadcast.
