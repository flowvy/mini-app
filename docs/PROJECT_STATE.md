# Текущее состояние Flowvy

Последняя полная проверка: **2026-08-13**
Проверенное текущее состояние: **рабочее дерево `dev` поверх `7da10bf`**
Последний полный baseline: **`dd3b5c8`** (`dev`, 2026-08-04)
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
- Remnawave user status проходит единый typed contract: четыре official provider-кода сохраняются,
  неизвестный/malformed inbound код нормализуется в BFF-only `UNKNOWN`, raw admin list больше не
  обходит provider model, dashboard агрегирует будущие status counters без утечки нового ключа.
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
- Telegram adapter не отправляет viewport/fullscreen startup-команды платформе `tdesktop` и один
  раз выходит из уже активного fullscreen. Это документированный app-side обход открытого
  Telegram Desktop Windows multi-monitor bug; нативные координаты и drag-area остаются под
  контролем Telegram. Владелец подтвердил возврат в управляемую оконную панель; её компактный
  стартовый размер `384x694` задаёт сам Telegram Desktop, а все границы поддерживают resize.
- Пользовательские маршруты Home, Devices, Pulse и Support.
- Удаление одного или всех HWID-устройств на Devices больше не ждёт повторный provider refetch для
  визуального завершения. После успешного `DELETE` pinned `@zumer/snapdom` 2.24.1 снимает строку в
	локальный canvas, а 12 compositor-only слоёв распыляют её пиксели примерно за 0,8 с одновременно со
	схлопыванием
  списка; bulk-удаление использует короткий каскад. Server state продолжает сверяться через TanStack
  Query. Ошибка capture безопасно оставляет CSS fallback, а `prefers-reduced-motion` убирает
  движение. Подтверждённое исчезновение использует один Telegram medium impact, ошибка — error
  notification; лишнего warning при открытии confirmation нет. Контракт SnapDOM сверялся с
  [official repository](https://github.com/zumerlab/snapdom) 2026-08-13.
- Admin dashboard, список/карточка пользователя, действия, выбор Pulse source, отдельные
  Kuma/Beszel/branding/welcome/access settings и Broadcast route.
- Admin settings используют один settings-specific composition layer для section headers,
  navigation/status/fact rows, notices и field groups. Overview группирует integrations,
  Flowvy Mini-App и system facts; вложенные Kuma/Beszel/Identity/Welcome/Access маршруты используют
  contained panels с внутренними group headers, одинаковым field/status/save rhythm и читаемой
  максимальной шириной на desktop. Общий semantic `FormSection` распространяет attached-header
  композицию на именованные секции Home details, Devices, Pulse groups/incidents, Admin dashboard и
  Admin user detail; внешний 8px rhythm задаётся ровно один раз контейнером страницы. Access profile
  открывается через native `dialog.showModal()` в browser top layer: compact viewport получает
  полноэкранный task surface без app header/tab bar, а desktop — центрированный dialog с dimmed inert
  контекстом. Отдельные header/body/footer, focus trap, `Escape` и возврат focus на фактический trigger
  проверены в Chromium/WebKit.
- Uptime Kuma, Beszel, Remnawave и Flowvy в Settings используют локальные монохромные brand marks в
  одинаковых нейтральных icon tiles; Pulse source тоже нейтрален и не маскируется под positive status.
  Welcome собран в одну content surface: premium constraint показан компактным inline warning у
  Greeting text, HTML/app-name подсказка перенесена в placeholder самого textarea, а формат
  MP4/GIF/photo описывает строку `Default media`. Создание access profile
  запускается из profiles surface: contextual action row для списка и один `Create profile` CTA в
  empty state; create/edit dialog различает title и submit action, provider fields остаются под
  `Advanced` disclosure.
- Неизвестный пользователь видит брендированный open/invite-only onboarding; успешная регистрация
  обновляет Query cache и открывает приложение без reload.
- На Home есть персональный invite code, число прямых приглашений, копирование с feedback и
  официальный Telegram share. Ссылка приходит с backend только после `getMe.has_main_web_app` и
  имеет один формат Main Mini App `t.me/<bot>?startapp=…`; при неподтверждённой capability UI не
  публикует ложную ссылку и оставляет copy/manual code. Invite-only onboarding вызывает отдельный
  no-body launch-redeem только по server-validated признаку и открывает приложение без reload. Во
  время загрузки карточка остаётся согласованным skeleton в итоговой позиции.
  Admin detail показывает число приглашённых без выпуска admin codes.
- Identity, Registration & Access и Welcome Message собраны в секции Flowvy Mini-App. Branding
  contract позволяет оператору задать app name/logo. Support остаётся отдельной локализованной
  заглушкой будущей встроенной поддержки без внешнего action. Access editor не
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
- Общий SegmentedControl использует recessed track и отдельный elevated sliding thumb: dashboard
  получает более выразительный navigation-вариант, а Pulse source, registration mode и validity —
  спокойный form-вариант. Dashboard реализует `tablist`/`tab`/`tabpanel`, form choices —
  `radiogroup`/`radio`; стрелки перемещают selection/focus, реальная смена даёт Telegram selection
  haptic, а `prefers-reduced-motion` отключает движение.
- Query hooks, typed view models, i18next English locale, CSS Modules и светлая/тёмная тема на
  дизайн-токенах. Product-owned copy, форматирование и accessible names находятся в locale;
  operator-owned identity/welcome и provider facts приходят как typed runtime data.
- Внешний вертикальный ритм пользовательских и admin-страниц использует единый design token 8px:
  карточки, заголовки секций, списки, feedback и save controls больше не задают отдельные
  page-level интервалы 12/16/20/22px. Геометрия закреплена browser regression на четырёх viewport,
  а визуальные evidence включают все маршруты в light/dark.
- Page-level load/auth/forbidden/not-found состояния используют единый переиспользуемый error UI.
  Stable backend codes получают локализованный текст, raw backend/provider `message` не выводится.
- Subscription/user status badges используют контекстные locale keys и явный neutral `UNKNOWN`;
  при неизвестном status admin UI не предлагает enable/disable mutation. Admin dashboard/filter
  переиспользуют общий plural-context, а access profile select больше не показывает raw enum text.
- Product-owned UI и документация называют Remnawave-доступ Xray-прокси или Remnawave-доступом;
  произвольные operator/provider-owned названия остаются runtime-данными и не нормализуются.
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
- Семь Vitest unit файлов (33 теста), включая автоматический запрет неиспользуемых locale leaves,
  прямого видимого JSX-copy, raw error message и неверной терминологии Xray-доступа;
  детерминированная Playwright state matrix на четырёх
  browser/viewport проектах и отдельный read-only live-smoke.

## Что не завершено или не доказано

- Broadcast пока отображает `coming soon`; отправка рассылки не реализована.
- Нет покупки/продления/платежей и управления уже выданным access profile как тарифом.
- Нет production deployment manifests, проверенных production runbooks и production-контура.
- Нет component tests и integrated fake-backend suite; offline/network-loss поведение проверяется
  только на уровне перехваченных ошибок, а не реальным отключением браузера.
- Новый GitHub Actions workflow ещё не выполнялся в удалённом репозитории; его зелёный статус не
  подтверждён этой локальной проверкой.
- Telegram Desktop 7.0.6 на Windows имеет открытый multi-monitor fullscreen bug `#30963`. Flowvy
  выходит из fullscreen при старте на `tdesktop`; live recovery подтверждён. Исправить нативное
  fullscreen-размещение или задать другой стартовый оконный размер через WebApp API невозможно.
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
  repo-owned safe preview. Владелец подтвердил live-переход по свежей ссылке новым аккаунтом:
  referral flow работает штатно.

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
- Единственная locale — English; locale parity и plural/fallback tests для нескольких языков
  отсутствуют.

## Последняя свежая проверка

P0 команды запускались 2026-08-01. Backend P1 этапы и Remnawave 3.x compatibility повторно полностью
проверены 2026-08-02 после webhook/Kuma/upload/provider/metrics/readiness изменений. Серия
registration/frontend/dev изменений проверена Full gate 2026-08-04 перед публикацией. Объединённое
изменение Remnawave user-status contract, provider-neutral copy и единых error states, а затем
возврат Support к встроенной заглушке и точные Remnawave/Flowvy Mini-App labels прошли полный
локальный gate 2026-08-11. Последующее исправление терминологии Xray-прокси прошло свежие
diff-применимые static/unit/build/docs проверки и 44-case UI-матрицу на четырёх проектах.
Унификация page-level вертикального ритма проверена 2026-08-12 отдельной полной frontend-матрицей.
Новый layered SegmentedControl проверен 2026-08-13 полной 204-case frontend-матрицей и отдельным
ручным просмотром affected light/dark evidence. Единая система Settings и Access dialog затем
прошли полный repository gate и 208-case browser matrix 2026-08-13; affected light/dark evidence
проверены на mobile, small-mobile и desktop.

| Область | Команда | Результат |
|---|---|---|
| Backend collection | full pytest run | 298 тестов выполнено |
| Backend lock/lint/format | `uv lock --check`; Ruff checks | пройдено, 130 Python файлов formatted |
| Backend полный suite | `uv run --frozen pytest -q` | 298 passed; известны только upstream Python 3.16 deprecation warnings pytest-asyncio |
| Telegram Main Mini App focused | capability/link/bot/auth/health/security tests | 46 passed; bounded transient `getMe`, strict `?startapp=`, signed no-body redeem, malformed payload и отсутствие `/start` fallback покрыты |
| Telegram Main Mini App live | новый test account и свежая `?startapp=` ссылка | владелец подтвердил корректное открытие и referral flow |
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
| Remnawave user-status contract | `scripts/verify.ps1 -Scope Changed` | 263 service-free backend tests, Ruff, 29 frontend unit tests, lint/type/build, 45 mobile Chromium scenarios и docs passed; 49 DB-dependent backend tests deselected by this scope |
| User-status UI matrix | focused Playwright at 320x568, 430x932 and 1280x900 | 9/9 scenarios passed; Home/admin detail light/dark evidence (12 screenshots) inspected; unknown badge, dashboard row, no inferred enable/disable, overflow, network/console and serious Axe checks passed |
| Полный локальный gate | `PLAYWRIGHT_PORT=5196; scripts/verify.ps1 -Scope Full` | migrations, 298 pytest, 41 Remnawave contract, frontend lint/type/unit/build, 43 Chromium browser и docs passed |
| Frontend lint/typecheck | `pnpm lint`; `pnpm typecheck` | пройдено, 166 linted files |
| Frontend unit | `pnpm test` | 5 files, 26 tests passed |
| Telegram Desktop viewport fix | 13 policy cases; Playwright mobile + desktop; live TDesktop 7.0.6 | 13/13 unit и 86/86 browser scenarios; light/dark Home evidence просмотрены; оконный recovery подтверждён владельцем |
| Dev lifecycle tooling | PowerShell parser + destructive guard checks | `dev-reset-data.ps1` parsed; запуск без confirmation и при живом dev закрывается до side effect |
| Frontend build | `pnpm build` | пройдено |
| Browser smoke | isolated Playwright mobile project | 43/43; server-confirmed Main Mini App auto-redeem, verified/unavailable referral URL, onboarding/profile/user-owned invite, browser Back, unified Home loading, provider tag failure, keyboard/tab-bar/native picker, semantic section headings, console/network/axe guards |
| Browser all projects | `PLAYWRIGHT_PORT=5196; pnpm test:e2e:all` | 160/160 behavioral scenarios passed: 430x932, 320x568, iPhone 13/WebKit и 1280x900 |
| Live browser smoke | `pnpm test:e2e:live` | Home/Devices/admin dashboard/users/settings прошли через реальный локальный BFF и Remnawave 2.8.1 |
| Visual UI | Playwright evidence + manual review | Beszel и date access editor повторно просмотрены в light/dark; section headers теперь semantic `h2` без изменения геометрии, touch picker, typography, hidden keyboard tab bar, overflow, axe и dialog focus прошли |
| Public Tunnel smoke | dedicated Flowvy named route + safe production build | root/health/readiness/asset `200`, backend debug route `404`; exact process-level `WEBAPP_URL`, system connector не изменён |
| GitHub CI | `.github/workflows/ci.yml` | локально не выполнялся и ещё не подтверждён remote run |
| Provider-neutral UI full gate | `CI=1; PLAYWRIGHT_PORT=5204; scripts/verify.ps1 -Scope Full` | one-head/zero-to-head/downgrade/re-upgrade/drift migrations, 315 backend tests, 53 Remnawave contract tests, Ruff, frontend lint/typecheck, 32 unit tests, production build, 50 mobile Chromium scenarios и docs passed |
| Support/dashboard focused matrix | focused Playwright at 430x932, 320x568, iPhone 13/WebKit и 1280x900 | 40/40; Support placeholder без external action, Identity-only settings, Remnawave/Flowvy Mini-App labels, Back/motion, overflow, console/network и route states passed |
| Support/dashboard visual evidence | Playwright screenshots + manual inspection | Support placeholder, Identity settings и dashboard labels просмотрены в light/dark и mobile/desktop; длинная вкладка помещается на 320x568, горизонтального overflow нет |
| Xray proxy terminology | official pinned READMEs + locale regression + frontend/docs/backend static gates | Remnawave/Xray contract зафиксирован по commits `a39e153`/`bc6e966`; 33 unit tests, lint, typecheck, build, Ruff и docs passed; прежняя ошибочная классификация отсутствует |
| Xray terminology UI matrix | 11 focused scenarios × 4 Playwright projects | 44/44; proxy/local access, devices empty state, disable dialog, Pulse, Remnawave/Flowvy tabs, provider identity и overflow прошли |
| Xray terminology visual evidence | access policy screenshots at 320x568 and 1280x900 | `No proxy access` просмотрен вручную в light/dark; текст помещается, контраст и геометрия сохранены |
| Unified page rhythm | changed-file Biome, `pnpm typecheck`, `pnpm test`, `pnpm build`, full Playwright all projects | общий внешний gap 8px проверен на user/admin routes; 33 unit и 204/204 browser scenarios прошли; 112 route/theme/viewport screenshots просмотрены вручную, overflow и serious Axe checks зелёные. Общий `pnpm lint` отдельно остаётся красным на трёх предшествовавших format findings вне этого изменения |
| Layered segmented controls | changed-file Biome, `pnpm typecheck`, `pnpm test`, `pnpm build`, `PLAYWRIGHT_PORT=5214; pnpm test:e2e:all` | 33 unit и 204/204 browser scenarios прошли на 430x932, 320x568, iPhone 13/WebKit и 1280x900; tabs/radiogroup semantics, arrow focus, sliding/reduced motion, overflow, serious Axe и mutations зелёные; dashboard/settings/access evidence вручную просмотрены в light/dark |
| Settings UI full gate | `scripts/verify.ps1 -Scope Changed`; `scripts/verify.ps1 -Scope Full` | 177 frontend files linted, typecheck/build, 33 unit и 52 mobile browser scenarios passed; 315 backend tests, 53 Remnawave contract tests, one-head/fresh/downgrade/re-upgrade/drift migrations и docs passed |
| Settings all-project UI matrix | `PLAYWRIGHT_PORT=5221; pnpm exec playwright test --workers=4` | 208/208 passed на 430x932, 320x568, iPhone 13/WebKit и 1280x900; nested route titles, pointer scrolling, focus trap/return, serious Axe, overflow, console/network и mutation/error states зелёные |
| Settings brand/spacing polish | `PLAYWRIGHT_PORT=5224; scripts/verify.ps1 -Scope Full`; `PLAYWRIGHT_PORT=5225; pnpm exec playwright test --workers=4` | Full repository gate и 208/208 browser scenarios прошли; нейтральный Pulse, четыре локальных brand marks, единый nested rhythm и упрощённый Welcome покрыты deterministic assertions |
| Settings visual evidence | deterministic Playwright screenshots + manual inspection | Overview, Kuma, Beszel, Identity, Welcome, Access policy и access editor просмотрены в light/dark на mobile/small-mobile/desktop; brand tiles, hierarchy, hint placement, contrast, wrapping, dialog scroll/footer и bottom chrome визуально согласованы |
| Nested Settings composition | `PLAYWRIGHT_PORT=5233; pnpm exec playwright test --workers=4`; `PLAYWRIGHT_PORT=5234; scripts/verify.ps1 -Scope Full` | 216/216 passed на mobile Chromium, small-mobile Chromium, iOS WebKit и desktop Chromium; Full repository gate пройден; contained panels, responsive form width, contextual empty/list creation, distinct create dialog, Premium inline warning, focus/keyboard/Axe/overflow/error states зелёные |
| Global sections и top-layer Access editor | `PLAYWRIGHT_PORT=4179; pnpm exec playwright test --workers=4`; `PLAYWRIGHT_PORT=4180; scripts/verify.ps1 -Scope Full` | 216/216 browser scenarios; Full gate: 315 backend, 53 Remnawave contract, migrations/drift, 33 frontend unit, production build, 54 mobile E2E и docs. Attached headers и единый 8px rhythm проверены на Home/Devices/Pulse/Admin; native `:modal`, compact full-screen bounds, desktop centering, focus/Escape/Axe и Greeting placeholder зелёные |
| Device removal motion | delayed-refetch Playwright regression; focused all-project matrix; `PLAYWRIGHT_PORT=5245; scripts/verify.ps1 -Scope Full` | Базовое fade/collapse удаление одного устройства и remove-all больше не зависело от задержанного на 1,2 с refetch; cancel/failure/success и reduced motion прошли, focused matrix 8/8 на mobile, small-mobile, iOS WebKit и desktop. Этот baseline затем заменён Telegram-like canvas dust effect; его свежая проверка указана ниже |
| Telegram-like device dust removal | focused all-project Playwright matrix; light/dark canvas evidence; `PLAYWRIGHT_PORT=5253; scripts/verify.ps1 -Scope Full` | 12/12 focused сценариев прошли на mobile Chromium, small-mobile Chromium, iOS WebKit и desktop Chromium; single/remove-all, delayed refetch, stagger, canvas pixels, fallback, reduced motion и overflow покрыты. Light/dark evidence просмотрены вручную. Full gate: migrations/drift, 315 backend, 53 Remnawave contract, Ruff, 33 frontend unit, lint/typecheck/build, 56 mobile E2E и docs passed; после live-отзыва blur убран из каждого кадра, число и DPR слоёв снижены, SnapDOM остаётся отдельным lazy chunk |
| Device dust smoothness optimization | compositor-property regression; light/dark midpoint evidence; `PLAYWRIGHT_PORT=5256; scripts/verify.ps1 -Scope Full` | Focused matrix 12/12 и evidence 2/2 passed: runtime-анимация использует только `transform`/`opacity`, без per-frame `filter`; 12 слоёв с DPR не выше 1,5 снижают canvas memory и upload cost. Full gate повторно прошёл migrations/drift, 315 backend, 53 Remnawave contract, Ruff, 33 frontend unit, lint/typecheck/build, 56 mobile E2E и docs |

## Следующее действие

Выбрать следующий продуктовый поток: подписки/продление или безопасный Broadcast.
Отдельно остаются live Remnawave 3.x, Kuma и первый подтверждённый удалённый CI run.
