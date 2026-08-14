# Текущее состояние Flowvy

Последняя полная проверка: **2026-08-14**; последний change-aware gate: **2026-08-14**
Проверенное текущее состояние: **`dev` с Tribute entitlement ledger и auditable operator review**
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
  branding, welcome template/media, server-side Tribute API access check и persisted commerce rules.
- Tribute credential остаётся только в server environment. BFF сообщает Mini App лишь факт его
  наличия, а ручная проверка администратора выполняет фиксированный read-only
  `GET https://tribute.tg/api/v1/products?page=1&size=1` с bounded timeout/body, без redirect,
  environment proxy и передачи upstream diagnostics клиенту.
- Provider-neutral `commerce_rules` сопоставляют Tribute donation/subscription/digital-product с
  active access profile. Fixed или volume calculator использует integer minor units; draft preview
  не пишет БД. Тот же canonical calculator используется planner. Priority, enabled state и
  extend/replace policy сохраняются вместе с immutable rule/profile snapshots в entitlement plan.
- Отдельный `POST /api/webhooks/tribute` реализует authenticated inbox: при настроенном server-only
  key проверяет raw-body HMAC до strict JSON parsing, 64-KiB limit, 25-часовую freshness с 5-минутным
  future tolerance и атомарно подавляет exact-body replay. PostgreSQL хранит только нормализованные
  metadata без raw body/signature/username, общий worker очищает их через 90 дней. Известные event
  family проходят отдельные typed payload schemas; planner в той же transaction создаёт durable
  decision, но webhook request не выполняет Remnawave HTTP.
- `entitlement_operations` является ledger/outbox с provider semantic key, source/root links,
  локальной identity, безопасными reason codes, snapshots, absolute expiry и retry/lease state.
  Digital-product purchase/refund использует документированный unique `purchase_id`; разные
  deliveries одной покупки создают одну operation. Donations/subscriptions остаются review-only,
  потому что Tribute не документирует unique identity отдельного платежа. Cancellation не считается
  refund, неизвестный Telegram ID не создаёт пользователя.
- Admin-only operator action API вычисляет eligibility на backend: только
  `review/provider_unavailable` можно вернуть в retry, а любую review operation — закрыть как
  `resolved` с обязательной заметкой и без access mutation. Operation row и client request UUID
  блокируются внутри transaction; append-only audit сохраняет actor, previous state и note, а
  повтор того же UUID не создаёт вторую action.
- Feature-gated executor по умолчанию выключен. При явном server-only включении он сериализует
  операции одного пользователя, повторно проверяет live Remnawave/Telegram identity, применяет
  absolute `expireAt` через official version-aware update-user contract и reconciles timeout без
  повторного продления. Refund replay сохраняет более поздние ещё не возвращённые grants; конфликт
  или неполная история останавливаются в review.
- Детерминированный `scripts/verify-tribute-entitlements.ps1` проводит production HTTP/Dishka/
  PostgreSQL path через подписанные purchase/refund payloads официальной формы, exact duplicates,
  grant и compensation. Stateful fake Remnawave подтверждает два absolute-expiry update без сети;
  runtime executor остаётся выключенным.
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

- React/TanStack приложение с Telegram SDK, mock-admin режимом и авторизационным guard. Первый
  успешно прочитанный Telegram `initData` удерживается только в памяти текущего WebView для поздних
  API mutations: повторное чтение launch params не может оставить `Preview` без Authorization, а
  значение не пишется в отдельное storage и не логируется.
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
  Kuma/Beszel/branding/welcome/access/Tribute settings и Broadcast route.
- Settings выделяет Payments отдельно от взаимоисключающего Pulse source. Вложенный Tribute flow
  показывает server-side состояние API key, безопасный read-only API check и rule builder для
  донатов, подписок и цифровых товаров. Admin выбирает payment conditions, fixed/volume duration,
  active access profile, extend/replace, priority и enabled state; backend preview показывает
  результат без save/access side effect. Экран показывает `Planning only` либо включённое delivery
  из server config и admin activity journal с loading/empty/error/retry/applied/review/resolved
  состояниями. Доступные Retry/Resolve приходят с backend; подтверждение удерживает modal при
  ошибке, возвращает focus и явно сообщает результат. Raw payload/diagnostics не выводятся;
  callback URL в UI не публикуется.
- Штатный подписанный Tribute test-ping подтверждён controlled delivery 2026-08-14: отдельный exact
  object с bounded `test_event` получает `200` после HMAC, не пишет inbox и не запускает commerce.
  Реальная доставка подтвердила ожидаемый 64-hex signature encoding без раскрытия тела или секрета.
- Tribute draft preview проверен через настоящий authenticated FastAPI route точным camelCase
  payload `500 / 3499 / 30`: backend возвращает 4 дня. Ошибки сессии, admin-доступа, валидации и
  временной недоступности получают отдельный безопасный текст без raw diagnostics, а изменение
  черновика скрывает устаревший результат. Amount-band поля теперь явно различают порог, payment
  unit и access per unit; формула показана над полосами.
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
- Uptime Kuma, Beszel, Remnawave, Tribute и Flowvy в Settings используют локальные монохромные brand marks в
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
- Один browser adapter отслеживает editable focus, pointer activation и `VisualViewport`, публикует
  фактические offset/height как CSS variables и раскрывает активный control через `scrollIntoView()`.
  Tab bar и editor footer скрываются на всём touch-editing lifecycle и возвращаются только после
  восстановления visual viewport, а не на раннем `focusout`; локальных `preventDefault`, ручного
  blur или Telegram keyboard workaround в редакторах нет. Native select/date picker и desktop focus
  навигацию это состояние не включают.
- Общие `ActionBtn` и `FormSaveButton` используют CSS border spinner с прозрачным фоном и стабильной
  геометрией вместо вращения inline SVG; loading state сохраняет accessible label и не создаёт
  отдельный WebKit compositing rectangle.
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
- Девять Vitest unit файлов (37 тестов), включая автоматический запрет неиспользуемых locale leaves,
  прямого видимого JSX-copy, raw error message и неверной терминологии Xray-доступа;
  детерминированная Playwright state matrix на четырёх
  browser/viewport проектах и отдельный read-only live-smoke.

## Что не завершено или не доказано

- Broadcast пока отображает `coming soon`; отправка рассылки не реализована.
- Tribute receiver пока не получал реального payment event: существующий внешний webhook не изменён,
  а production event-family payload shapes подтверждены только официальной документацией и fixtures.
  Signature и отдельный test-ping проверены live. Semantic idempotency, planning, absolute grant и
  refund compensation реализованы только для digital products по документированному `purchase_id`;
  executor остаётся выключенным по default и не проверялся controlled live purchase/provider
  mutation. Donation/subscription auto-delivery заблокирован отсутствием документированной unique
  identity отдельного платежа. Checkout и подтверждённый rollback production данных отсутствуют.
  Operator retry/resolve реализован, но не заменяет controlled provider investigation или rollout.
  Официальный Tribute sandbox/test payment не документирован; API check подтверждает только
  read-only доступ.
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
Админский Tribute onboarding затем прошёл полный repository gate и 244-case browser matrix
2026-08-13; configured/missing-key, success/failure, light/dark и responsive evidence просмотрены
вручную, а реальный Tribute API и платежи не вызывались.
Provider-neutral commerce-rule builder продолжил этот slice 2026-08-13: Full gate прошёл 344
backend, 53 Remnawave contract, 36 frontend unit и 67 mobile browser tests; отдельные 36 Tribute
scenarios прошли на mobile Chromium, 320px Chromium, iOS WebKit и desktop Chromium. Flexible
donation editor и preview просмотрены вручную в light/dark; реальный Tribute, webhook и access
mutation не вызывались.
Последующий mobile UX polish выровнял Currency/Priority без растягивания resting value, заменил
amount-band stack на компактные стандартные form rows с явными единицами и скрывает общий editor
footer на время touch-ввода без зарезервированной пустой полосы. Кнопки внутри формы сохраняют tap,
после действия штатно закрывают клавиатуру и только затем возвращают footer. Light/dark evidence
после 1,1-секундной выдержки просмотрены вручную. Реальный Tribute, webhook и access mutation не
вызывались.
Глобальный mobile-input follow-up 2026-08-14 заменил этот локальный keyboard workaround единым
VisualViewport/focus lifecycle: сфокусированный control раскрывается в видимом scrollport, а нижний
chrome не возвращается между `focusout` и завершением системной анимации клавиатуры. Tribute получил
официальный круглый star mark, а общий loading indicator больше не вращает inline SVG. Focus,
непрерывность lifecycle, loading/Axe/overflow и console/network guards прошли 72/72 сценария на
430x932 Chromium, 320x568 Chromium, iPhone/WebKit и desktop Chromium; affected light/dark evidence
просмотрены вручную. Реальный Tribute, webhook и access mutation не вызывались.
Observe-only Tribute receiver 2026-08-14 добавил защищённый raw-body ingress, минимальный
PostgreSQL inbox, atomic exact replay и bounded retention. Ни постоянный callback, ни реальные
payment deliveries, ни commerce/access/provider mutation не включались.
Последующая штатная тестовая доставка Tribute подтвердила 64-hex подпись и отдельную форму
`test_event`: первый запрос безопасно выявил schema difference, после strict test-ping адаптации
Tribute показал success, endpoint вернул `200`, inbox остался пустым.

| Область | Команда | Результат |
|---|---|---|
| Backend collection | full pytest run | 345 тестов выполнено |
| Backend lock/lint/format | `uv lock --check`; Ruff checks | пройдено, 143 Python файла formatted |
| Backend полный suite | `uv run --frozen pytest -q` | 345 passed; известны только upstream Python 3.16 deprecation warnings pytest-asyncio |
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
| Frontend lint/typecheck | `pnpm lint`; `pnpm typecheck` | пройдено, 192 linted files |
| Frontend unit | `pnpm test` | 9 files, 37 tests passed |
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
| Tribute admin onboarding | `PLAYWRIGHT_PORT=5264; scripts/verify.ps1 -Scope Full`; `PLAYWRIGHT_PORT=5267; pnpm exec playwright test --workers=2` | Full gate: migrations/drift, 328 backend, 53 Remnawave contract, Ruff, frontend lint/typecheck, 33 unit, production build, 61 mobile E2E и docs passed. Итоговая матрица 244/244 прошла на mobile Chromium, small-mobile Chromium, iOS WebKit и desktop Chromium; все 16 Tribute scenarios, Axe/overflow/console/network guards и визуальные состояния зелёные. Реальный Tribute не вызывался |
| Tribute commerce rules admin UX | `PLAYWRIGHT_PORT=5269; scripts/verify.ps1 -Scope Full`; `PLAYWRIGHT_PORT=5270; pnpm exec playwright test tests/e2e/tribute.spec.ts --workers=4` | Full gate: one-head/zero-to-head/downgrade/re-upgrade/drift, 344 backend, 53 Remnawave contract, Ruff, frontend lint/typecheck, 36 unit, production build, 67 mobile E2E и docs passed. Affected Tribute matrix 36/36 прошла на 430x932, 320x568, iPhone/WebKit и desktop; CRUD/preview/no-match/failure/unavailable-profile, nested native dialog, Axe/overflow/console/network зелёные. Flexible 500/3500 bands и 4000→417 preview просмотрены в light/dark. Реальный Tribute/webhook/access mutation не вызывались |
| Tribute rule editor mobile polish | `PLAYWRIGHT_PORT=5291; scripts/verify.ps1 -Scope Full`; focused Tribute and shared-editor all-project matrices | Full gate: migrations/drift, 344 backend, 53 Remnawave contract, Ruff, frontend lint/typecheck, 36 unit, production build, 68 mobile E2E и docs passed. Tribute 40/40 и Access/keyboard 52/52 прошли на 430x932, 320x568, iPhone/WebKit и desktop. Compact bands, aligned currency/priority, footer без delayed reserved space, сохранённые Add band/Preview taps, keyboard dismissal, save, Axe/overflow/console/network зелёные; light/dark evidence после 1,1 секунды просмотрены вручную |
| Tribute preview runtime repair | authenticated FastAPI regression; retained-initData unit; `PLAYWRIGHT_PORT=5294; pnpm exec playwright test tests/e2e/tribute.spec.ts --workers=4`; `PLAYWRIGHT_PORT=5295; scripts/verify.ps1 -Scope Full` | Exact production payload возвращает 4 дня; first-read initData regression зелёный. Tribute 44/44 прошли на 430x932, 320x568, iPhone/WebKit и desktop; late preview auth, safe `401` copy, stale-error reset, explicit payment-unit labels, console/network/overflow и визуальный dark error state проверены. Full gate прошёл migrations/drift, 345 backend, 53 Remnawave contract, Ruff, frontend lint/typecheck, 37 unit, production build, 69 mobile E2E и docs. Стандартный dev перезапущен; local/public asset `index-j_XaGRQy.js` совпадает, readiness `200`, public debug `404` |
| Global mobile input/loading UX | `PLAYWRIGHT_PORT=5314; scripts/verify.ps1 -Scope Changed`; focused all-project Playwright matrix and visual evidence | Changed gate: 293 service-free backend tests, Ruff, 37 frontend unit, lint/typecheck/build, 69 mobile smoke и docs passed. Дополнительно 72/72 affected browser scenarios прошли на 430x932, 320x568, iPhone/WebKit и desktop Chromium. Active-control reveal, deferred footer/tab return, сохранённая button activation, CSS spinner без SVG/backing box, Axe/contrast, overflow, console/network guards зелёные; Tribute Settings и pending Save просмотрены в light/dark |
| Tribute observe-only webhook inbox | focused HTTP/repository suites; `PLAYWRIGHT_PORT=5321; scripts/verify.ps1 -Scope Full`; live test-ping; follow-up full backend и `scripts/verify.ps1 -Scope Changed` | 51/51 focused и 383/383 current backend passed; Changed gate — 328 service-free, Ruff/docs. Исходный Full gate прошёл one-head, zero/previous-head upgrade, downgrade/re-upgrade/drift, 53 Remnawave contract, frontend lint/typecheck, 37 unit, production build и 69 mobile E2E. Controlled Tribute test подтвердил strict 64-hex signature и отдельный `test_event`: endpoint `200`, inbox 0 rows, без commerce/access side effect |
| Tribute entitlement ledger и admin activity | focused contract/concurrency suites; `PLAYWRIGHT_PORT=5188; pnpm exec playwright test tests/e2e/tribute.spec.ts --workers=4`; `PLAYWRIGHT_PORT=5196; scripts/verify.ps1 -Scope Full` | Focused webhook/executor 43 passed, commerce/provider/planner/executor/Remnawave selection 59 passed; отдельная executor concurrency suite 8/8 подтвердила сериализацию операций одного пользователя. Full gate: one-head/upgrade/downgrade/re-upgrade/drift, 402 backend, 55 Remnawave contract, Ruff, frontend lint/typecheck, 37 unit, production build, 71 mobile browser и docs passed. Tribute all-project matrix 52/52 прошла на 430x932, 320x568, iPhone/WebKit и desktop; activity loading/empty/populated/error/retry, admin allow-list, Axe/overflow/console/network зелёные. Mobile dark и desktop light evidence просмотрены. Executor default off; live payment/provider mutation не вызывались |
| Tribute digital-product E2E fixture | `scripts/verify-tribute-entitlements.ps1`; `PLAYWRIGHT_PORT=5198; scripts/verify.ps1 -Scope Full` | Focused production-boundary smoke 1/1 прошёл: signed purchase/refund, exact duplicates, две semantic operations, один absolute grant и одна compensation через stateful fake Remnawave, local expiry восстановлен. Full gate: migrations/drift, 403 backend, 55 Remnawave contract, Ruff, frontend lint/typecheck, 37 unit, production build, 71 browser и docs passed. Реальные Tribute/Remnawave endpoints не вызывались; executor runtime default не менялся |
| Tribute operator review workflow | 32 focused backend tests; `PLAYWRIGHT_PORT=5201; pnpm exec playwright test tests/e2e/tribute.spec.ts --workers=4`; deterministic visual evidence; `PLAYWRIGHT_PORT=5202; scripts/verify.ps1 -Scope Full` | Append-only actor audit, request UUID idempotency, row-lock concurrency, retry eligibility, required resolve note, safe API projection и stale conflict прошли. Tribute all-project matrix 60/60 зелёная на 430x932, 320x568, iPhone/WebKit и desktop; 12 action/dialog screenshots просмотрены в light/dark на 320/430/1280 px. Full gate: one-head/upgrade/downgrade/re-upgrade/drift, 410 backend, 55 Remnawave contract, Ruff, frontend lint/typecheck, 37 unit, production build, 74 mobile browser и docs passed. Executor остаётся выключенным; реальные Tribute/Remnawave endpoints не вызывались |

## Следующее действие

Следующий Tribute slice — alerts/metrics и отдельный production rollout/rollback runbook. Executor
остаётся выключенным и callback URL не публикуется.
Контролируемый live digital-product purchase/refund возможен только после явного выбора изолированной
provider identity и товара; deterministic fixture уже покрывает тот же production-boundary path без
сети. Для donation/subscription сначала нужен официальный unique payment identifier либо иной
документированный provider contract; без него эти события остаются operator journal-only review.

Отдельно остаются безопасный Broadcast, live Remnawave 3.x, Kuma и первый подтверждённый удалённый
CI run.
