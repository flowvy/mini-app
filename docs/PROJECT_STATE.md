# Текущее состояние Flowvy

Последняя проверка: **2026-08-04**
Проверенный кодовый baseline этой серии: **`dd3b5c8`** (`dev`)
Стадия: **незавершённый MVP; production readiness не подтверждена**

Этот файл описывает наблюдаемое состояние, а не желаемую функциональность. При расхождении с кодом,
миграциями или свежим выводом команды сначала исправляется факт, затем этот документ.

## Что уже существует

### Backend

- FastAPI BFF на `:8001`, Telegram bot на aiogram: защищённый `/webhook` в production и polling
  fallback для одного локального test-bot процесса.
- При Telegram-enabled startup Bot API `getMe` проверяет `has_main_web_app`; backend выдаёт
  персональную `?startapp=` ссылку только для подтверждённой Main Mini App. Auto-redeem извлекает
  code только из HMAC-проверенного `WebAppInitData.start_param`, без client body/URL fallback.
- Проверка Telegram Mini App `initData`, синхронизация локального пользователя и admin-роли из
  `ADMIN_TELEGRAM_IDS`.
- Пользовательские API для профиля, подписки, HWID-устройств и provider-neutral Pulse.
- Admin API для dashboard, пользователей, действий над пользователем, выбора Kuma/Beszel для Pulse,
  branding и welcome template/media.
- Явная открытая/invite-only регистрация: `/api/me` не создаёт полностью неизвестного пользователя
  чтением, но безопасно импортирует exact provider-only Remnawave match; onboarding работает
  одинаково из Mini App и бота.
- Access profiles задают local-only либо Remnawave grant со сроком, трафиком/reset strategy,
  устройствами, status, provider-owned tag, description и internal/external squads. Каталог tag
  читается из Remnawave и повторно проверяется backend перед сохранением изменённого значения. У
  каждого пользователя один постоянный многоразовый invite code; `invited_by_id` и direct count
  фиксируют приглашённых.
- Remnawave create-user поддерживает общий точный контракт 2.8.1/3.0.0/3.1.0, deterministic identity
  и reconciliation после неопределённого timeout без автоматических live mutations.
- Provider-only Remnawave user импортируется до invite/open gate в локальные user/invite/subscription:
  referral/default profile не применяются, существующий provider access не изменяется, lookup error
  закрывает flow временной недоступностью.
- Одновременные `/start` одной Telegram identity объединяются Redis lease с конечным TTL и
  token-safe завершением: накопившиеся после обрыва polling команды дают один согласованный ответ.
  Exact read-only Remnawave lookup делает один bounded retry только для явно transient transport/
  upstream ошибок; contract/auth/ambiguity failures не повторяются.
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
  Kuma/Beszel/branding/welcome/access settings и Broadcast route.
- Неизвестный пользователь видит брендированный open/invite-only onboarding; успешная регистрация
  обновляет Query cache и открывает приложение без reload.
- На Home есть персональный invite code, число прямых приглашений, копирование с feedback и
  официальный Telegram share. Ссылка приходит с backend только после `getMe.has_main_web_app` и
  имеет один формат Main Mini App `t.me/<bot>?startapp=…`; при неподтверждённой capability UI не
  публикует ложную ссылку и оставляет copy/manual code. Invite-only onboarding вызывает отдельный
  no-body launch-redeem только по server-validated признаку и открывает приложение без reload. Во
  время загрузки карточка остаётся согласованным skeleton в итоговой позиции.
  Admin detail показывает число приглашённых без выпуска admin codes.
- Name & Logo, Registration & Access и Welcome Message собраны в секции Bot. Access editor не
  дублирует список во время редактирования, явно объясняет бессрочный/безлимитный grant и использует
  общие FormField/Input/Select/Textarea. Select/date разделяют app-owned видимый слой Geist 13px и
  нативный semantic/editing слой 16px на touch: системный picker и защита от iOS focus zoom
  сохраняются, а закрытые select/input/date показывают единое Geist 13px значение. Touch picker не
  оставляет зелёную рамку после выбора; keyboard focus на desktop остаётся видимым. Compact date
  стоит в одной строке с label и внутри editor без лишнего helper; pending Remnawave options не
  меняют геометрию editor после открытия.
- App shell отслеживает touch focus и VisualViewport: tab bar и нижний edge chrome скрываются до
  окончания keyboard-ввода и возвращаются по Enter/blur, поэтому iOS keyboard больше не поднимает
  навигацию поверх активного поля. Native select/date picker и desktop focus навигацию не скрывают.
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
- `.gitignore` и `.gitattributes` фиксируют public-safe snapshot: локальные `.env`, credentials,
  browser auth state, logs, dumps, databases, dependencies, builds и verification artifacts не
  попадают в Git; tracked env examples не содержат форматоподобных bot/admin credentials.
- PowerShell scripts для bootstrap, запуска/остановки, change-aware/full verification, migrations,
  явного reset только локальных Flowvy PostgreSQL/Redis данных, Remnawave snapshot/client tests,
  безопасного Quick Tunnel и проверки документации.
- GitHub Actions CI с PostgreSQL/Redis, Ruff, Alembic, pytest, Biome/TypeScript/Vitest/build и
  Playwright Chromium smoke.
- Четыре Vitest unit файла (13 тестов), детерминированная Playwright state matrix на четырёх
  browser/viewport проектах и отдельный read-only live-smoke.

## Что не завершено или не доказано

- Support и Broadcast пока отображают `coming soon`; отправка рассылки не реализована.
- Нет покупки/продления/платежей и управления уже выданным access profile как тарифом.
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
- Реальный Remnawave проверен read-only. До очистки dev-БД Beszel успешно отдавал signed public
  `GET /api/pulse`: `200`, `operational`, 1 group и 7 monitors. 2026-08-04 локальная Flowvy DB
  пересоздана от `base` до `head`: users/subscriptions/invites/access profiles пусты, singleton
  settings сброшен к defaults. Поэтому Beszel/Pulse и registration policy нужно настроить заново.
  Kuma live target пока не настроен. Новый create-user flow намеренно не запускался против реальной
  панели: live проверка должна выполняться владельцем на отдельном тестовом invite/profile.
- Main Mini App referral contract проверен deterministic tests. После включения Main App в
  BotFather свежий Telegram-enabled startup подтвердил для test bot
  `getMe.has_main_web_app=true`; backend публикует только строгий `?startapp=` referral URL. Для
  Flowvy создан отдельный named-Tunnel hostname с route на local port
  `80`: public root/health/readiness и production asset отвечают `200`, debug route — `404`.
  Hostname другого проекта не изменялся; системный connector продолжает работать отдельно от
  repo-owned safe preview.

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
- Registration gate разделяет read и mutation; user-owned invite создаётся CSPRNG, не заменяет
  Telegram-auth, проверяет active owner и защищён Redis limiter. PostgreSQL advisory lock исключает
  дубли одной identity; open/local-only, invite-only, concurrent reusable referral и provider
  timeout reconciliation покрыты regression tests. Exact provider-only identity импортируется до
  policy, не засчитывается как referral и сохраняет прежний Remnawave access без mutations.

Основная route/UI error, mutation и permission матрица закрыта. Остаются удалённый CI, live
Kuma и полный Telegram test-bot flow.

### P2 — поддерживаемость

- Не настроен статический Python type checker.
- В `queryKeys` остаётся неиспользуемый ключ `nodes`, хотя отдельного nodes flow в текущем коде нет.
- Единственная locale — English; один admin fallback остаётся hardcoded, locale parity и
  plural/fallback tests отсутствуют.

## Последняя свежая проверка

P0 команды запускались 2026-08-01. Backend P1 этапы и Remnawave 3.x compatibility повторно полностью
проверены 2026-08-02 после webhook/Kuma/upload/provider/metrics/readiness изменений. Вся текущая
серия registration/frontend/dev изменений свежо проверена Full gate 2026-08-04 перед публикацией.

| Область | Команда | Результат |
|---|---|---|
| Backend collection | full pytest run | 298 тестов выполнено |
| Backend lock/lint/format | `uv lock --check`; Ruff checks | пройдено, 130 Python файлов formatted |
| Backend полный suite | `uv run --frozen pytest -q` | 298 passed; известны только upstream Python 3.16 deprecation warnings pytest-asyncio |
| Telegram Main Mini App focused | capability/link/bot/auth/health/security tests | 46 passed; bounded transient `getMe`, strict `?startapp=`, signed no-body redeem, malformed payload и отсутствие `/start` fallback покрыты |
| Bot `/start` single-flight focused | bot/registration/Remnawave tests | 64 passed; concurrent duplicate, transient retry, non-retryable failure, Redis fail-closed и token-safe finish покрыты |
| Provider-only import focused | registration/bot/auth/Remnawave tests | 70 passed; direct `/api/me`, referral bypass, no provider mutation и safe `503` покрыты |
| Remnawave webhook focused | route/service + PostgreSQL tests | 29 service-free и 3 repository tests passed; concurrent duplicate принят один раз |
| Kuma/Beszel/Pulse focused | target/client/provider/Pulse tests | draft test без persistence добавлен; DNS pinning, auth/contracts, pagination bounds, cache, history и status matrix входят в full suite |
| Media upload focused | bounded stream/provider tests | 11 passed; no second full buffer, pre-send rejection и safe errors |
| Provider/dashboard focused | client/routes/cache tests | 23 passed; email array, envelope, safe errors и allow-list projection |
| Metrics/readiness focused | middleware/collector/health tests | 13 passed; включая реальные Docker PostgreSQL/Redis и app lifespan |
| Alembic disposable | `scripts/verify-migrations.ps1` | один head; zero/previous-head upgrade, Kuma→Pulse provider preservation, webhook hardening, legacy UUID/numeric ID, downgrade/re-upgrade и drift пройдены |
| Remnawave snapshot/client | 41 client tests + live smoke | legacy 2.7.4 snapshot и exact 2.8.1/3.0.0/3.1.0 fixtures, включая user tags; реальная 2.8.1 прочитана без mutations |
| Docs | `scripts/verify-docs.ps1` | все локальные Markdown links разрешаются |
| Legacy cleanup | filesystem/text scan | obsolete assistant-specific paths/references не найдены |
| Public repository scan | Gitleaks 8.30.1 с `--redact=100` | 79 commit истории и опубликованный public snapshot: 0 findings; filename/URL/email audit содержит только official/document/test examples |
| PowerShell/tool policy | parser + `codex execpolicy check` | все scripts parsed; forbid/prompt/safe rule cases совпали с ожиданием |
| Codex fresh session | `codex exec --ephemeral --strict-config ...` | config принят; корневой `AGENTS.md`, четыре repo skills и custom role `repo_mapper` обнаружены |
| Change-aware gate | `scripts/verify.ps1 -Scope Changed -SkipE2E` | 249 service-free backend tests, frontend install/lint/type/unit/build и docs passed; E2E подтверждён отдельно |
| Полный локальный gate | `PLAYWRIGHT_PORT=5196; scripts/verify.ps1 -Scope Full` | migrations, 298 pytest, 41 Remnawave contract, frontend lint/type/unit/build, 43 Chromium browser и docs passed |
| Frontend lint/typecheck | `pnpm lint`; `pnpm typecheck` | пройдено, 164 linted files |
| Frontend unit | `pnpm test` | 4 files, 13 tests passed |
| Dev lifecycle tooling | PowerShell parser + destructive guard checks | `dev-reset-data.ps1` parsed; запуск без confirmation и при живом dev закрывается до side effect |
| Frontend build | `pnpm build` | пройдено |
| Browser smoke | isolated Playwright mobile project | 43/43; server-confirmed Main Mini App auto-redeem, verified/unavailable referral URL, onboarding/profile/user-owned invite, browser Back, unified Home loading, provider tag failure, keyboard/tab-bar/native picker, semantic section headings, console/network/axe guards |
| Browser all projects | `PLAYWRIGHT_PORT=5196; pnpm test:e2e:all` | 160/160 behavioral scenarios passed: 430x932, 320x568, iPhone 13/WebKit и 1280x900 |
| Live browser smoke | `pnpm test:e2e:live` | Home/Devices/admin dashboard/users/settings прошли через реальный локальный BFF и Remnawave 2.8.1 |
| Visual UI | Playwright evidence + manual review | Beszel и date access editor повторно просмотрены в light/dark; section headers теперь semantic `h2` без изменения геометрии, touch picker, typography, hidden keyboard tab bar, overflow, axe и dialog focus прошли |
| Public Tunnel smoke | dedicated Flowvy named route + safe production build | root/health/readiness/asset `200`, backend debug route `404`; exact process-level `WEBAPP_URL`, system connector не изменён |
| GitHub CI | `.github/workflows/ci.yml` | локально не выполнялся и ещё не подтверждён remote run |

## Следующее действие

Открыть свежую `?startapp=` ссылку абсолютно новым Telegram-аккаунтом: Mini App должна
зарегистрировать пользователя без manual code и применить default access. После этого выбрать
следующий продуктовый поток: подписки/продление, Support или безопасный Broadcast.
Отдельно остаются live Remnawave 3.x, Kuma и первый подтверждённый удалённый CI run.
