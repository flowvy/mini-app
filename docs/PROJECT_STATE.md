# Текущее состояние Flowvy

Последняя полная проверка: **2026-08-21**; последний change-aware gate: **2026-08-22**
Проверенное текущее состояние: **`dev` с layered Telegram Back navigation, always-on Tribute delivery, multi-period sponsor offers, paid/base reconciliation и кроссплатформенным dev-tooling**
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
- Device response после fresh Remnawave ownership check allow-list'ит `platform`, `osVersion`,
  `deviceModel`, `userAgent`, nullable `requestIp`, `createdAt` и `updatedAt`; provider metadata не
  сохраняется в Flowvy и не логируется.
- Admin API для dashboard, пользователей, действий над пользователем, выбора Kuma/Beszel для Pulse,
  branding, welcome template/media, server-side Tribute API access check, persisted checkout
  destinations и commerce rules.
- Tribute credential остаётся только в server environment. BFF сообщает Mini App лишь факт его
  наличия, а admin check выполняет fixed-origin read-only `GET /subscriptions` с bounded
  timeout/body, без redirects, environment proxy или upstream diagnostics.
- Admin-only Tribute catalog нормализует strict subscription/period schema в allow-listed response.
  `provider_settings` хранит subscription ID → HTTPS destination; donation link, expected amount,
  exact one-time/recurring mode и recurring period принадлежат конкретному `sponsor_offer`.
- `commerce_rules` поддерживает только donation и subscription. Donation использует fixed/volume
  calculator в integer minor units; subscription применяет signed absolute `expires_at`. Draft
  preview не пишет БД и не вызывает provider.
- `sponsor_offers` отделяет title/description/order от access rule. Publish fail-closed проверяет
  enabled rule/profile, subscription catalog либо точные donation условия и сохраняет immutable
  checkout snapshot. Одна provider subscription соответствует одному rule и одному опубликованному
  offer со всеми catalog periods/prices. Снятие с публикации очищает snapshot в SQL `NULL`, не
  обращается к Tribute и оставляет редактируемую конфигурацию для повторной проверки. Удаление rule
  атомарно удаляет связанные offers, но сохраняет payment/checkout history, entitlement snapshots и
  уже выданный доступ; pending payment после удаления больше не автоматизируется.
- `GET /api/me/sponsor` вычисляет no/base/paid, pending, provisioning, review, one-time и recurring
  states только из локальных durable facts. `POST /api/me/sponsor/checkouts` создаёт один expiring
  redirect intent, а не provider payment. Pending check имеет явный progress/result;
  `DELETE /api/me/sponsor/checkouts/{id}` идемпотентно закрывает только локальное ожидание своего
  checkout и возвращает offers. Поздний matching signed event всё равно может подтвердить `expired`
  intent; Tribute не вызывается. Только matching signed event может подтвердить checkout.
- `POST /api/webhooks/tribute` проверяет raw-body HMAC, bounded body, freshness и strict supported
  schema до planner. Поддерживаются donation и subscription lifecycle events. Иное подписанное имя
  сохраняется как `ignored` audit metadata без checkout match, entitlement operation или
  Remnawave mutation; raw body/signature/username не хранятся.
- `entitlement_operations` — durable ledger/outbox. Subscription deduplicates absolute
  `subscription/user/expires_at` state; identified donation автоматизируется после полного
  checkout/rule match, anonymous или неоднозначный donation всегда review-only. Cancellation не
  отзывает уже оплаченный доступ.
- Admin operator actions вычисляются backend: terminal provider failure можно retry, review можно
  resolve с обязательной заметкой без access mutation. Request UUID и append-only audit обеспечивают
  идемпотентность.
- Executor запускается вместе с приложением, повторно проверяет identity, применяет immutable
  profile/absolute target и сохраняет `entitlement_baselines` для scheduled восстановления base
  access. Автоматизацию будущих платежей выключает rule toggle; provider conflict или неполная
  история останавливаются в review.
- `scripts/verify-tribute-entitlements.ps1` проводит подписанный donation flow через production
  FastAPI/Dishka/PostgreSQL boundary с fake providers и без реальных внешних запросов.
- Явная открытая/invite-only регистрация: `/api/me` не создаёт полностью неизвестного пользователя
  чтением, но безопасно импортирует exact provider-only Remnawave match; onboarding работает
  одинаково из Mini App и бота.
- Access profiles задают local-only либо Remnawave grant со сроком, трафиком/reset strategy,
  устройствами, status, provider-owned tag, description и internal/external squads. Для rule-managed
  grant доступен явный `automation` без локальных дней/даты; он сохраняет только benefits и не может
  быть registration default. Каталог tag читается из Remnawave и повторно проверяется backend перед
  сохранением изменённого значения. У
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
- Devices показывает monochrome logo glyph и название ОС из provider `platform`, а не `osVersion`;
  под моделью двумя компактными строками доступны Added, Updated, ОС и IP. UA остаётся в
  allow-listed BFF response, но не выводится в UI. Nullable metadata имеет явный `Not reported`,
  unknown platform не угадывается, длинные значения не создают horizontal overflow.
- Удаление одного или всех HWID-устройств на Devices больше не ждёт повторный provider refetch для
  визуального завершения. Подтверждение выполняется общим native `ConfirmDialog`/`alertdialog`, не
  меняет геометрию device row и сначала фокусирует заголовок, не выделяя Cancel или destructive
  action как заранее выбранный. После успешного `DELETE`
  pinned `@zumer/snapdom` 2.24.1 снимает строку в
  локальный canvas, а 12 compositor-only слоёв распыляют её пиксели примерно за 0,8 с одновременно со
  схлопыванием
  списка; bulk-удаление использует короткий каскад. Server state продолжает сверяться через TanStack
  Query. Ошибка capture безопасно оставляет CSS fallback, а `prefers-reduced-motion` убирает
  движение. Подтверждённое исчезновение использует один Telegram medium impact, ошибка — error
  notification; лишнего warning при открытии confirmation нет. Контракт SnapDOM сверялся с
  [official repository](https://github.com/zumerlab/snapdom) 2026-08-13.
- Admin dashboard, список/карточка пользователя, действия, выбор Pulse source, отдельные
  Kuma/Beszel/branding/welcome/access/Tribute settings и Broadcast route.
- Settings выделяет Payments отдельно от Pulse source. Tribute route показывает server-only
  credential state, read-only subscription API check, payment destinations, donation/subscription
  rule builder, sponsor offers и allow-listed activity journal. Subscription выбирается по имени,
  цене и периоду из каталога; сохранённый временно отсутствующий ID не теряется. Donation
  использует fixed/volume preview, subscription — только provider expiry. Retry/Resolve и безопасный
  modal/focus/VisualViewport lifecycle переиспользуют общие UI primitives; raw payload и provider
  diagnostics не выводятся.
- На том же route admin создаёт user-facing sponsor offer из существующего automation rule.
  Publish проверяет готовность rule/profile/destination на backend. Список показывает storefront
  preview: статус, видимость, описание и все сохранённые provider periods/prices без обрезанной
  технической строки. Старые дубли одной subscription не удаляются автоматически: основная карточка
  показывает общую матрицу периодов, остальные остаются явными, но свёрнутыми строками для проверки,
  редактирования или удаления. Editor и список переиспользуют общий SubscriptionBillingList, native
  dialog, FormField, Toggle, ActionBtn и ConfirmDialog без отдельной form/modal системы. Для donation
  каждая карточка получает собственную Tribute link и ожидаемую сумму; глобального donation link в
  Payment links больше нет. Существующий offer можно связать с другим automation rule; backend
  повторно проверяет новую связку и обновляет published snapshot, а уже начатый checkout сохраняет
  прежний immutable rule snapshot. Переключатель опубликованного оффера переводит его в Draft без повторной
  provider-проверки; Home получает только оставшиеся published-ready варианты.
- Offer description поддерживает ограниченный переносимый CommonMark. Общий Tiptap editor всегда
  показывает один фиксированный toolbar над полем на touch, keyboard и fine-pointer устройствах;
  системный selection menu не заменяется и второй контекстный popup не создаётся. Toolbar имеет
  WAI-ARIA semantics, roving tab stop и arrow/Home/End navigation. Результат форматирования виден
  сразу без отдельного preview; системные Cut/Copy/Paste actions не подавляются. Backend сохраняет line
  structure, а admin cards/Home рендерят единый
  allow-listed semantic результат без raw HTML. Лимит относится к 300 видимым символам, а source
  получает запас до 2 000 символов под Markdown syntax. Тот же editor/renderer является готовой
  frontend-границей будущего Broadcast; Telegram serialization ещё не реализована.
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
- Home также читает server-computed sponsor state. No/base access показывает ready offers; one-time
  active — точную дату и `Extend`; subscription trial/active — `Manage in Tribute` без повторной
  покупки, подтверждённый paid-through срок и branded note о том, что отмена отобразится после
  period-end provider event; UI не обещает auto-renew без signed evidence. Другие published
  subscription offers видны, но заблокированы до этой даты; donation offers в locked list
  не подмешиваются, а BFF не создаёт overlapping subscription checkout. Recurring donation
  показывает access-first title, точную дату,
  `Manage auto-donation in Tribute` и branded note о period-end cancellation timing; отдельного
  paid-period cancelled state у donation нет. Pending checkout,
  provisioning и review скрывают новый checkout и прямо просят не платить повторно. Donation offer
  предупреждает использовать тот же Telegram account и не включать anonymity. Redirect сам по себе
  не меняет access. Subscription offer является отдельной коммерческой карточкой: заданные
  оператором название и описание, read-only список provider prices/billing intervals и одна
  настоящая кнопка `Continue in Tribute`. Flowvy не создаёт названия отдельных услуг из technical
  period enum; цена является главным фактом, а interval — вторичным условием списания. Billing rows
  не имеют radio/check/selected affordance, потому что Flowvy не может передать предварительный
  выбор периода по документированному Tribute URL contract. Единый expiry parser
  принимает Unix и ISO contracts и распознаёт только
  документированный lifetime sentinel конца 2099 года; Home, sponsor state и admin user surfaces
  показывают его как `No expiry`, не как календарную дату 2100 года.
- Identity, Registration & Access и Welcome Message собраны в секции Flowvy Mini-App. Branding
  contract позволяет оператору задать app name/logo; пользовательские sponsor-сообщения используют
  этот app name, а не жёстко заданный Flowvy. Support остаётся отдельной локализованной
  заглушкой будущей встроенной поддержки без внешнего action. Access editor не
  дублирует список во время редактирования, явно объясняет бессрочный/безлимитный grant и использует
  общие FormField/Input/Select/Textarea. Input использует один нативный control; select/date
  разделяют app-owned видимый слой Geist 13px и нативный semantic/picker layer. Защита от iOS focus
  zoom сохраняет 16px editing text на touch. Touch picker не
  оставляет зелёную рамку после выбора; keyboard focus на desktop остаётся видимым. Compact date
  стоит в одной строке с label и внутри editor без лишнего helper; pending Remnawave options не
  меняют геометрию editor после открытия.
- App shell и fullscreen editor остаются в layout viewport и не переписывают pixel geometry из
  `VisualViewport`. Текстовые controls явно связывают нативные `Search`/`Next`/`Done`/`Go` hints с
  соответствующим submit, переходом к следующему текстовому control, завершением ввода или preview;
  multiline editor сохраняет обычный `Enter`. Эти локальные действия не используют глобальные
  focus/pointer listeners, `scrollIntoView()`, viewport heuristics или
  `Telegram.WebApp.hideKeyboard()`. Web-owned tab
  bar монтируется только на точных top-level routes; user detail, focused `/admin/users/search` и
  вложенные settings task routes не вводят его в lifecycle экранной клавиатуры и используют Telegram
  BackButton. Его единый coordinator сначала закрывает верхний confirmation/editor, а затем ведёт
  detail route к явному parent route без предварительного browser-history pop. Dirty settings
  включают `beforeunload` только при реальных изменениях; user/admin mode синхронизируется с URL при
  Back/Forward. Основной Users route открывает настоящий search input только после перехода в эту
  task surface. Primary save actions в fullscreen editors и выделенных Kuma/Beszel/Identity/Welcome
  settings routes в поддерживаемом Telegram client передаются одним нативным `MainButton`, а browser
  и старые клиенты сохраняют одну DOM create/save кнопку. Section-scoped `Save payment links`
  остаётся внутри длинного Tribute route и не маскируется под глобальное действие всего экрана.
  Native action скрывается на время вложенного discard/delete confirmation и при уходе с task.
  Отдельный `Cancel` удалён из access-profile, commerce-rule и sponsor-offer editors, потому что
  закрытие остаётся доступно через header close и `Escape`.
  Их явные background/text colors берутся из тех же adaptive tokens, что прежний DOM footer;
  disabled primary action остаётся неактивным и получает прежнюю 40% приглушённую палитру.
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
  operator-owned identity/welcome и provider facts приходят как typed runtime data. Compact UI
  copy не заканчивается точкой; internal punctuation, URL, версии, числа и provider-owned текст не
  переписываются. Locale catalog test применяет это правило ко всем JSON-локалям.
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
- Единые PowerShell 7 scripts для Windows/macOS/Linux: locked bootstrap, запуск/остановка,
  change-aware/full verification, migrations, явный reset только локальных Flowvy PostgreSQL/Redis
  данных, Remnawave snapshot/client tests, безопасный Quick Tunnel и проверка документации.
  Platform helper выбирает native executables/TCP/process-tree lifecycle; named preview остаётся на
  `80` в Windows и использует непривилегированный `4173` на macOS/Linux.
- GitHub Actions CI с PostgreSQL/Redis, Ruff, Alembic, pytest, Biome/TypeScript/Vitest/build и
  Playwright Chromium smoke.
- Двенадцать Vitest unit файлов (49 тестов), включая автоматический запрет неиспользуемых locale leaves,
  прямого видимого JSX-copy, raw error message и неверной терминологии Xray-доступа;
  детерминированная Playwright state matrix на четырёх
  browser/viewport проектах и отдельный read-only live-smoke.

## Что не завершено или не доказано

- Broadcast пока отображает `coming soon`; отправка рассылки не реализована.
- Tribute receiver получил controlled real non-anonymous donation и monthly subscription: HMAC,
  inbox, planner, checkout confirmation, Remnawave grant и base restore scheduling подтверждены;
  raw payload/PII не читались. Subscription idempotently применяет absolute provider expiry, а
  безопасно matched identified donation проходит автоматизацию; anonymous donation всегда review.
  Period-end donation/subscription cancellation и последующее renewal ещё не наблюдались live.
  Creator webhook не документирует failed-charge/retry и next-charge state, поэтому UI их не
  угадывает. Operator retry/resolve не заменяет controlled provider investigation или rollout.
- Нет production deployment manifests, проверенных production runbooks и production-контура.
- Нет component tests и integrated fake-backend suite; offline/network-loss поведение проверяется
  только на уровне перехваченных ошибок, а не реальным отключением браузера.
- Новый GitHub Actions workflow ещё не выполнялся в удалённом репозитории; его зелёный статус не
  подтверждён этой локальной проверкой.
- Кроссплатформенный lifecycle прошёл parser/contracts, безопасный Windows localhost smoke и Full
  gate. Фактические bootstrap, process-tree shutdown и named preview `:4173` ещё нужно принять на
  новом Mac до переключения Cloudflare origin и Telegram polling.
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
Live iOS evidence 2026-08-21 показал, что этот adapter сам создаёт двухфазное восстановление:
клавиатура уже скрыта, но shell/dialog ещё удерживают последний `visualViewport.height`, после чего
страница скачком получает полную высоту. Follow-up удалил adapter, 96px keyboard heuristic,
application-owned viewport CSS variables, delayed dialog close, synthetic input blur/hideKeyboard и
compact resting-value overlay; shell/dialog вернулись к нативной layout viewport geometry.
Fresh verification 2026-08-21: `verify.ps1 -Scope Changed` прошёл backend service-free 389 tests,
frontend lint/typecheck, 49 unit tests, production build и 109 mobile Chromium Playwright scenarios.
Клавиатурные regression tests дополнительно прошли на 430x932 Chromium, 320x568 Chromium,
iPhone/WebKit и desktop Chromium; focused access editor просмотрен в light/dark на Chromium/WebKit.
Следующая live iOS запись дважды показала примерно 0,5-секундный разрыв между появлением keyboard и
поздним layout перерасчётом DOM footer. Telegram прямо запрещает использовать `viewportHeight` для
плавной нижней привязки, а WebKit не реализует `interactive-widget=resizes-content` и VirtualKeyboard
API. Изначально общий editor использовал locked SDK 3.11.8 `MainButton` + Bot API 7.10+
`SecondaryButton`; capability, enabled/loading updates, click wiring, cleanup и DOM fallback были
покрыты unit и browser bridge regressions без keyboard/focus heuristics. Последующий live iOS acceptance
подтвердил синхронное появление кнопок с keyboard. Follow-up вернул нативным кнопкам прежнюю
light/dark палитру Flowvy и сделал disabled primary action визуально отличимым; смена темы во время
открытого editor также обновляет native button parameters.
Editor follow-up убрал дублирующий `Cancel` со всех fullscreen forms: Telegram получает только
`MainButton`, а DOM fallback показывает одну create/save кнопку. Header close, `Escape`,
focus trap/return и busy guard сохранены; неиспользуемая `SecondaryButton` branch удалена.
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
| Alembic disposable | `scripts/verify-migrations.ps1` | один head; zero/previous-head upgrade, Kuma→Pulse provider preservation, webhook hardening, legacy UUID/numeric ID, rollback-only sponsor offer/checkout runtime inserts, downgrade/re-upgrade и drift пройдены |
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
| Frontend unit | `pnpm test` | 10 files, 43 tests passed |
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
| Tribute operator review workflow | 32 focused backend tests; `PLAYWRIGHT_PORT=5201; pnpm exec playwright test tests/e2e/tribute.spec.ts --workers=4`; deterministic visual evidence; `PLAYWRIGHT_PORT=5202; scripts/verify.ps1 -Scope Full` | Append-only actor audit, request UUID idempotency, row-lock concurrency, retry eligibility, required resolve note, safe API projection и stale conflict прошли. Tribute all-project matrix 60/60 зелёная на 430x932, 320x568, iPhone/WebKit и desktop; 12 action/dialog screenshots просмотрены в light/dark на 320/430/1280 px. Full gate: one-head/upgrade/downgrade/re-upgrade/drift, 410 backend, 55 Remnawave contract, Ruff, frontend lint/typecheck, 37 unit, production build, 74 mobile browser и docs passed. Executor остаётся выключенным; реальные Tribute/Remnawave endpoints не вызывались |
| Tribute operator feedback/focus polish | full Tribute all-project Playwright, focused shared-confirm matrix, deterministic keyboard transition/post-resolve evidence; frontend lint/type/unit/build | Tribute 63 passed и 1 desktop-only keyboard case штатно skipped на 430x932, 320x568, iOS WebKit и desktop; shared-confirm 16/16. Touch Resolve удерживает native dialog до VisualViewport restoration, закрывает его до paint, не раскрывает сжатую подложку и сохраняет `scrollY`; success отражается только в operation row. Четыре keyboard-transition и шесть post-resolve light/dark screenshots на 320/430/1280 px просмотрены вручную. Lint, 37 unit tests и production build прошли |
| Tribute sponsor offers и Home storefront | focused sponsor/webhook/repository suites; `PLAYWRIGHT_PORT=5198; pnpm exec playwright test tests/e2e/tribute.spec.ts --workers=2`; deterministic light/dark evidence; `PLAYWRIGHT_PORT=5201; scripts/verify.ps1 -Scope Full` | Provider-neutral offer snapshots, publish guards, local pending checkout, webhook confirmation, server-computed no/base/one-time/recurring/pending/provisioning/review/refunded states и duplicate-payment protection покрыты. Tribute matrix: 135 passed, 1 desktop-only keyboard case skipped на 430x932, 320x568, iOS WebKit и desktop; Axe/overflow/console/unexpected-network guards зелёные, Home/editor evidence просмотрены вручную. Full gate: migrations/drift, 454 backend, 56 pinned Remnawave contract, Ruff, frontend lint/typecheck, 43 unit, production build, repository Playwright и docs passed. Redirect не считается оплатой; live payment/provider mutation не выполнялись; executor остался выключен |
| Tribute live donation semantics | обезличенные retained production logs старого receiver; official Creator webhook comparison; 53 focused webhook/planner tests; `scripts\verify-tribute-entitlements.ps1`; полный backend gate | Логи без payload/PII подтвердили `new_donation + once`, `new_donation + monthly`, `recurrent_donation + monthly` и unregistered path. Flowvy теперь определяет initial donation mode по `period`: monthly initial payment совпадает с recurring rule и сохраняет provider period. Donation production-boundary fixture 1/1 и combined smoke 2/2 прошли: signed HTTP/HMAC, exact dedupe, one-time/recurring rule selection, 500/3500 bands, anonymous/unknown review и отсутствие provider link/mutation. Полный backend: Ruff/format и 459 tests passed. Официальная страница показывает только one-time `new_donation` example; это не доказывает уникальную transaction identity, поэтому runtime identified automation и executor остались выключены |
| Tribute controlled live one-time donation | реальный неанонимный 100 RUB Creator donation; safe validation diagnostics; migration verifier; 59 focused tests; полный backend gate | Test webhook получил `200`; первая payment delivery прошла HMAC, но выявила только `period:literal_error` и получила `400` без persistence. Bounded one-time aliases и weekly/monthly/quarterly/halfyearly/yearly recurring periods добавлены без permissive fallback. Provider retry создал один observed `new_donation`, один 30-day grant и один Remnawave attempt; operation `applied`, local/provider expiry совпали, base restore запланирован. Migration verifier прошёл, полный backend: Ruff/format и 464 passed. Raw body, signature, key и Telegram ID не читались/не логировались. Уникальный transaction ID и successful duplicate delivery этим тестом не доказаны |
| Tribute per-tariff donation destinations | 18 focused backend tests; 16/16 affected Tribute browser scenarios; deterministic light/dark evidence; repeated refund regression 5/5; `PLAYWRIGHT_PORT=5220; scripts/verify.ps1 -Scope Full` | Каждый donation offer хранит одну HTTPS-ссылку и ожидаемую minor-unit сумму; несколько offers могут переиспользовать один amount-band rule. Publish fail-closed проверяет calculator, immutable snapshot и readiness; signed webhook amount/currency подтверждают только совпавший checkout, но остаются источником entitlement calculation. Global donation URL удалён из UI и оставлен legacy-only. Full gate: one-head/previous-head/downgrade/re-upgrade/drift, Ruff, 469 backend, 56 pinned Remnawave contract, frontend lint/type/unit/build, repository Playwright и docs passed; editor проверен на mobile, small-mobile, iOS WebKit и desktop в light/dark |
| Tribute migrated UUID runtime repair | live admin create failure; rollback-only service reproduction; repair migration `w3x4y5z6a7b8`; migrated-schema offer/checkout INSERT proof; 18 focused tests; `PLAYWRIGHT_PORT=5223; scripts/verify.ps1 -Scope Full` | Реальная Alembic-схема выявила отсутствующий server default у UUID PK `sponsor_offers`/`sponsor_checkouts`, тогда как pytest `create_all()` использовал корректный ORM default. Forward repair добавил `gen_random_uuid()` обеим таблицам и применён к dev. Тот же published 100 RUB offer после upgrade создаётся как `ready`; diagnostic transaction откатана. Full gate: migration inserts, one-head/upgrade/downgrade/re-upgrade/drift, Ruff, 469 backend, 56 pinned Remnawave contract, frontend lint/type/unit/build, repository Playwright и docs passed |
| Shared lifetime expiry presentation | 4 format unit cases; frontend lint/typecheck; 43 unit; production build; 12 focused Playwright cases | Повторная clean registration создала active secondary user с одной Remnawave-linked subscription и без commerce records. Общий Unix/ISO parser использует Flowvy lifetime sentinel `2099-12-31T23:59:59Z`; Home detail, sponsor card, admin list/hero/detail и entitlement target formatting больше не содержат отдельных lifetime эвристик. `Basic access / No expiry` подтверждён в light/dark на 430x932, 320x568, iOS WebKit и desktop; screenshots просмотрены, Axe/overflow/console/network guards зелёные. |
| Tribute repeated clean one-time live flow | обезличенные DB invariants, read-only exact Remnawave lookup и runtime log counts | После удаления secondary user локально и в Remnawave повторная invite-only registration создала lifetime base access. Новый dedicated 100 RUB non-anonymous checkout получил ровно один authenticated `new_donation`, стал `confirmed` и создал один applied 30-day grant с первой попытки плюс один pending base restore. Duplicate/problem operations отсутствуют; local subscription, operation target/provider expiry, Remnawave identity и полный paid profile совпадают. Home показал active sponsor state и `Extend access`; runtime за flow содержит один webhook 2xx, 0 errors и 0 warnings. Raw payload, credential и идентификаторы не читались и не выводились. |
| Tribute controlled-runtime restart (historical) | published offer/rule/profile/checkout DB audit; ready-offer service check; public route/readiness | Исторический controlled restart подтвердил, что active grant и offer сохраняются при изменении runtime rollout state, а `SponsorStateService` скрывает renewal action при нуле ready offers. Этот прежний gate удалён: текущая автоматизация управляется rule toggle, а видимость payment choice — offer toggle. |
| Tribute recurring-donation state contract | 22 focused backend tests; 147/1 full Tribute browser cases; deterministic light/dark evidence; `PLAYWRIGHT_PORT=5240; scripts/verify.ps1 -Scope Full`; provider support answer; controlled live initial/cancel observation | Initial recurring `new_donation` и `recurrent_donation` связываются с applied donation grant и дают access-first `recurring_donation_active`/`Manage auto-donation in Tribute`, а не one-time `Extend` или обещание auto-renew. Tribute support подтвердила, что `cancelled_donation` приходит только в конце paid period и API не позволяет проверить состояние вручную. Поэтому UI до конца периода одинаков до/после отмены, показывает точную access date и branded timing note; period-end event даёт `recurring_expired`/base flow. `recurring_cancelled_active` остаётся subscription-only. Mobile/small-mobile/iOS WebKit/desktop matrix зелёная, light/dark recurring cards просмотрены вручную, overflow/Axe/console/network guards прошли. Full gate завершился за 253,8 с: migrations/drift, Ruff, 477 backend, 56 pinned Remnawave, frontend lint/type/unit/build, repository Playwright и docs. Live initial 100 RUB recurring donation пришёл как `new_donation + weekly`, применил один 30-day grant и согласовал local/Remnawave state; фактический period-end cancellation webhook ещё не наблюдался. |
| Tribute exact donation offer contract | official Creator/subscriber donation docs; 90 focused backend tests; migration verifier; 147/1 full Tribute browser cases; `PLAYWRIGHT_PORT=5250; scripts/verify.ps1 -Scope Full`; standard dev restart | Donation link не фиксирует payer-controlled amount/mode/frequency. Offer и immutable checkout snapshot теперь требуют exact amount, one-time/recurring mode и recurring period; Home показывает точные действия до редиректа. Signed mismatch закрывает checkout и создаёт `review / donation_offer_mismatch` до grant, exact match разрешает только linked offer rule. Admin editor переиспользует текущие segmented/select/form primitives; mobile/small-mobile/iOS/desktop light/dark evidence проверена без overflow/Axe/console/network ошибок. Full gate за 253,6 с прошёл migrations/runtime inserts/drift, Ruff, 484 backend, 56 pinned Remnawave contracts, frontend lint/type/unit/build, repository Playwright и docs. Dev upgraded до `x3y4z5a6b7c8`; legacy `any` offer безопасно снят с публикации до выбора exact schedule; local/public health и frontend `200`, public debug `404`. Реальные Tribute/Remnawave requests не выполнялись. |
| Tribute controlled live monthly subscription | official subscriptions/webhooks OpenAPI `1.0.0`; live read-only catalog; real signed monthly payment; allow-listed DB/Remnawave reconciliation; 94 subscription/webhook/sponsor tests plus 21 executor/operator tests; controlled cancellation observation | Catalog currency lower-case drift нормализован на provider boundary; конкретная subscription подтвердила один monthly period. Published offer создал pending checkout, signed `new_subscription` подтвердил exact item, identified user, 100 RUB/month, `regular` и absolute expiry; checkout стал confirmed. Remnawave применил весь paid profile, но provider сохранил более грубую fractional timestamp precision, из-за чего strict comparison безопасно дал review. Millisecond normalization и manual Retry для идемпотентного `provider_state_mismatch` reconciled ту же operation как applied без второй оплаты/мутации. После отмены в Tribute немедленного cancellation webhook не было: paid grant/expiry остались корректны. Home теперь access-first подтверждает срок и Manage CTA, не утверждает auto-renew без provider evidence и branded note объясняет period-end update. Lifetime base restore запланирован на paid expiry. Raw webhook, secrets и identifiers не читались/не выводились. |
| Tribute donation/subscription-only contract | focused 136 backend tests; migration verifier; donation production-boundary smoke; focused four-project Tribute matrix; `PLAYWRIGHT_PORT=5272; scripts/verify.ps1 -Scope Full`; standard Telegram-enabled dev restart | Runtime schemas, catalog, rules, checkout attribution, planner, frontend controls/copy and fixtures accept only donation/subscription; other signed events remain ignored audit metadata. Migration `y4z5a6b7c8d9` preserved audit, removed abandoned mutable configuration and replaced legacy provider-reference column names. Focused UI: 147 passed, 1 expected desktop-only keyboard skip; light/dark evidence inspected. Full gate: one-head/previous-head/zero-to-head/downgrade/re-upgrade/runtime inserts/drift, Ruff, 481 backend, 56 Remnawave contract, frontend lint/typecheck/43 unit/build, 97 Playwright and docs passed. Dev data was preserved; local/public health and frontend `200`, ready `200`, public debug `404`, zero invalid rule/checkout/event-family rows and zero startup error markers. |
| Sponsor-offer unpublish repair | PostgreSQL repository regression; focused sponsor service suite; focused visibility Playwright; `PLAYWRIGHT_PORT=5275; scripts/verify.ps1 -Scope Changed` | Nullable offer snapshot now uses SQLAlchemy `JSONB(none_as_null=True)`, so published → Draft stores SQL `NULL` instead of invalid JSONB `null`. Focused backend 20/20 and focused browser 1/1 passed. Changed gate passed Ruff, 383 service-free backend tests, frontend lint/typecheck/43 unit/build, 98 mobile Playwright tests and docs; existing development data was preserved. |
| Remnawave device metadata UI | official exact 2.8.1/3.1.0 schemas; `scripts\verify-contracts.ps1`; focused four-project Devices matrix; light/dark evidence; `PLAYWRIGHT_PORT=5339; scripts\verify.ps1 -Scope Full` | BFF allow-list `requestIp`/UA/Updated и platform-based OS glyphs подтверждены. Focused Devices matrix 20/20 прошла на 430x932, 320x568, iOS WebKit и desktop; Android/iOS/macOS/Windows/Linux, nullable/long metadata, deletion, Axe/overflow/console/network зелёные. Light/dark screenshots на 320/430 px просмотрены. Full gate: migrations/drift, Ruff, 483 backend, 56 pinned Remnawave contract, frontend lint/typecheck/43 unit/build, 100 mobile Playwright и docs passed. Реальный Remnawave не вызывался. |
| Compact locale punctuation и neutral dialog focus | Apple HIG Alerts/Writing, Material Writing и Microsoft Style Guide; locale invariant; focused Devices matrix; full mobile Playwright | Во всех 189 English locale leaves удалена только финальная точка с сохранением internal punctuation; будущие JSON-локали покрыты catalog regression. Device confirmation фокусирует semantic heading, а не Cancel. Focused Devices 9/9 прошли на 430x932, 320x568 и iOS WebKit, шесть light/dark screenshots просмотрены; frontend lint/typecheck, 44 unit, build и полный mobile Playwright 100/100 зелёные. |
| Tribute always-on automation и multi-period subscription UX | official Creator API/OpenAPI `1.0.0` и subscription publishing docs; full backend; `scripts\verify-contracts.ps1`; Tribute all-project matrix; focused light/dark evidence; `scripts\verify.ps1 -Scope Changed -SkipE2E` | Скрытые rollout-флаги и admin `Webhook delivery` удалены: rule toggle управляет будущей payment-to-access автоматизацией, offer toggle — только публичной видимостью. Один provider subscription теперь имеет одну automation rule и один offer со всеми `periods[]`; Home показывает month/3 months/year и цены до перехода. Официального period-preselection URL-контракта нет, поэтому период выбирается в Tribute без guessed query parameters. Ruff и full backend 483/483, pinned contracts 56/56, frontend lint/typecheck/43 unit/build, Tribute 151 passed + 1 documented skip, focused evidence 4/4 и changed/docs gate прошли. Mobile/small-mobile light/dark screenshots просмотрены; реальный платеж или provider mutation не выполнялись. |
| Tribute offer-card UX redesign | Apple HIG Layout/Segmented controls, Baymard Plan Matrix/subscription research, Carbon tiles, NN/g heuristics и официальный Tribute URL contract; shared presenter unit coverage; deterministic admin/Home light/dark evidence; `PLAYWRIGHT_PORT=5383; pnpm exec playwright test tests/e2e/tribute.spec.ts --workers=2`; `scripts\verify.ps1 -Scope Changed -SkipE2E` | Home снова показывает одну цельную коммерческую карточку: title/description, exact compact prices, read-only period tiles и отдельный `View plans in Tribute` CTA. Admin использует тот же semantic period grid, явные status/visibility/Edit controls и progressive disclosure для legacy-дублей без скрытого удаления данных. Period tiles намеренно не выглядят выбранными, потому что документированного preselection contract нет. Tribute matrix: 155 passed, 1 ожидаемый desktop-only keyboard skip на 430x932, 320x568, iOS WebKit и desktop; Axe/overflow/console/network guards и light/dark screenshots проверены. Frontend lint/typecheck, 44 unit, build и changed gate с Ruff, 384 service-free backend tests и docs прошли. Standard dev перезапущен с сохранением данных; local/public frontend, health и ready вернули `200`, public debug — `404`. Реальные Tribute/Remnawave requests не выполнялись. |
| Tribute recoverable pending checkout | row-lock repository/service tests; full backend; frontend lint/type/unit/build; focused and full four-project Tribute Playwright; 320/430 light/dark visual review | `Check payment status` теперь показывает spinner, блокирует повторный запрос и сообщает, если подтверждение ещё не пришло. `Choose another option` через native dialog закрывает только owned local pending intent и сразу возвращает offers; failure оставляет безопасное waiting state. Поздний signed webhook после abandon подтверждается из `expired`, поэтому оплата не теряется. Subscription rule editor называет единый benefits profile для всех periods и объясняет, что Tribute `expires_at` задаёт срок. Ruff/format и 487 backend tests, 44 frontend unit, production build, 163 Tribute Playwright passed + 1 ожидаемый desktop keyboard skip; 320/430 light/dark screenshots просмотрены, overflow/Axe/console/network guards зелёные. Реальные Tribute/Remnawave requests не выполнялись. |
| Atomic commerce-rule deletion | PostgreSQL service + authenticated HTTP regressions; full backend; frontend lint/type/unit/build; focused and full four-project Tribute Playwright; light/dark visual review; `scripts\verify.ps1 -Scope Changed -SkipE2E`; standard dev restart | Delete rule теперь в одной DB-транзакции удаляет все связанные draft/published offers и сам rule, не обращаясь к Tribute/Remnawave и не меняя историю либо уже выданный доступ. Confirmation честно предупреждает про payment choices и pending matching; failure остаётся в модалке для retry, success обновляет rules/offers/Home cache. Найденный Axe contrast defect общего danger CTA исправлен существующими adaptive design tokens. Ruff, 489 backend, 44 frontend unit, production build и 171 Tribute Playwright passed + 1 ожидаемый desktop keyboard skip; changed gate с 386 service-free tests зелёный. 320/430, iOS WebKit и desktop light/dark screenshots просмотрены, Axe/overflow/console/network guards прошли. Standard Telegram-enabled dev перезапущен с сохранением данных; local/public frontend, health и ready вернули `200`, public debug — `404`, startup error markers отсутствуют. |
| Automation-managed access-profile validity | Alembic runtime INSERT/constraint gate; 68 focused и 493 full backend tests; 56 pinned Remnawave contracts; frontend lint/typecheck/44 unit/build; 107 mobile + 12 focused all-project Playwright; light/dark visual review; docs gate; standard dev restart | Access profile получил явный режим `automation`: дни и дата не хранятся, benefits переиспользуются, а exact expiry обязан предоставить payment rule или другая автоматизация. Режим исключён из registration default; backend отклоняет прямой выбор, перевод текущего default и повреждённую policy fail-closed. Admin editor показывает понятный hint/summary без фиктивного срока. Миграция `z5a6b7c8d9e0` прошла zero/previous-head, downgrade/re-upgrade, runtime insert и drift. 320/430 px, iOS WebKit и desktop light/dark screenshots просмотрены без overflow; smoke Axe/console/network guards зелёные. Standard Telegram-enabled dev применил новый head с сохранением данных; local/public frontend, health и ready вернули `200`, public debug — `404`, startup error markers отсутствуют. |
| Tribute provider-authored offer presentation | official Creator API/OpenAPI `1.0.0`; Apple HIG Lists/Layout; GOV.UK Summary list; shared frontend presenter; focused admin/Home four-project Playwright; frontend full gate | Flowvy больше не превращает provider period enum в названия услуг и не предлагает маркетинговое название периода. Название и описание одной offer-card задаёт оператор; общий `SubscriptionBillingList` на Home, в admin list и editor показывает только подтверждённые Tribute цену и нейтральное условие списания. CTA открывает Tribute, где пользователь делает реальный выбор. Focused admin/Home matrix прошла 8/8 на 430x932, 320x568, iOS WebKit и desktop; light/dark evidence просмотрены без overflow/Axe/console/network ошибок. Frontend lint/typecheck, 44 unit и production build прошли. |
| Sponsor-offer automation-rule relink | статический аудит admin edit locks; focused four-project Playwright; eight light/dark screenshots; `scripts\verify.ps1 -Scope Changed -SkipE2E` | Искусственная create-only блокировка rule select удалена. Существующий draft или published offer можно связать с другим rule; UI отправляет новый `commerceRuleId`, backend повторно валидирует и пересобирает published snapshot, начатые checkouts сохраняют прежние immutable facts. Focused matrix прошла 4/4 на 430x932, 320x568, iOS WebKit и desktop; light/dark screenshots просмотрены, Axe/overflow/console/network guards зелёные. В admin source больше нет `disabled`, зависящих только от существования entity. Changed gate прошёл Ruff, 387 service-free backend tests, frontend lint/typecheck/44 unit/build и docs. |
| Inline WYSIWYG formatted offer content | official Tiptap React fixed-menu/StarterKit/CharacterCount/Markdown contracts and WAI-ARIA toolbar pattern; 23 focused sponsor backend tests; 5 focused frontend unit tests; focused four-project Playwright; 109 mobile Playwright; `scripts\verify.ps1 -Scope Changed -SkipE2E` | Описания offer хранят ограниченный CommonMark в прежнем строковом поле, но автор работает с provider-neutral inline WYSIWYG. Один постоянный toolbar с bold/italic/strike/link/quote/lists расположен над editor surface для touch, keyboard и fine pointer; pointer heuristics, conditional trigger и selection-bound app popup отсутствуют. Native Cut/Copy/Paste/Format menu остаётся системным. Home/admin используют один безопасный renderer без raw HTML; 300-character limit считается по видимому тексту, source contract допускает до 2 000 символов для formatting syntax. Редактор загружается lazy только в admin form. Light/dark mobile/small-mobile/desktop evidence просмотрены; Axe/overflow/console/network guards зелёные. Fresh gates: 389 service-free backend, Ruff, frontend lint/typecheck/49 unit/build, 109/109 mobile и 4/4 focused all-project browser scenarios. Компоненты готовы к будущему Broadcast composer; его transport serializer пока не реализован. |
| macOS developer migration preparation | official PowerShell 7.6 platform variables; official Docker Desktop, uv and Cloudflare macOS/routing docs; `scripts\verify-tooling.ps1`; safe localhost lifecycle smoke; `scripts\verify.ps1 -Scope Changed`; `scripts\verify.ps1 -Scope Full` | Общий helper убирает Windows-only TCP/process/executable assumptions, сохраняет PID ownership checks и Docker volumes, а runbook задаёт Apple Silicon bootstrap и controlled named-Tunnel cutover с Windows `:80` на Mac `:4173`. Full Windows gate: migrations/drift, Ruff, 495 backend, 56 pinned Remnawave contracts, frontend lint/typecheck/49 unit/build, 109 mobile Playwright и docs passed. Реальные Telegram/Cloudflare/provider calls и внешние mutations не выполнялись; runtime acceptance на новом Mac остаётся обязательным. |
| Native Telegram editor bottom buttons | official Telegram viewport/BottomButton contract; locked SDK 3.11.8 source and types; open WebKit interactive-widget/VirtualKeyboard bugs; unit bridge lifecycle and color payloads; focused four-project keyboard and visual matrices; `scripts/verify.ps1 -Scope Changed`; standard dev restart | Покадровый разбор live iOS записи подтвердил два разрыва примерно по 0,5 с между keyboard и DOM footer. Поддерживаемые Telegram clients теперь получают один `MainButton`; дублирующий `Cancel` и неиспользуемая `SecondaryButton` branch удалены из access-profile, commerce-rule и sponsor-offer editors, а header close/`Escape` сохранены. Последующий live iOS acceptance подтвердил синхронное появление button и keyboard. Native action повторяет прежние adaptive footer colors; disabled primary сохраняет `is_active=false` и получает отдельную приглушённую палитру, а runtime theme change пересылает light/dark colors. Fresh gate: Ruff, 389 service-free backend, frontend lint/typecheck/53 unit/build, 110/110 mobile Playwright и docs; focused editor/keyboard and light/dark visual evidence прошли на 430x932, 320x568, iOS WebKit и desktop. Standard Telegram-enabled dev пересобран и перезапущен с сохранением volumes; local/public frontend и ready `200`, public debug `404`, startup error markers отсутствуют. |
| Dedicated settings native saves | locked SDK 3.11.8 MainButton bridge; focused unit and four-project Playwright; `scripts/verify.ps1 -Scope Changed`; browser fallback screenshots | Kuma, Beszel, Identity и Welcome получили один native Save в поддерживаемом Telegram client с disabled/loading updates, реальным `main_button_pressed`, modal suppression и route cleanup. Browser/старые clients сохраняют DOM Save, а section-scoped Tribute payment links намеренно остаётся DOM-only. Вложенные rule/offer delete confirmations теперь скрывают editor MainButton. Fresh gate: tooling, Ruff, 389 service-free backend, frontend lint/typecheck/70 unit/build, 114/114 mobile Playwright и docs прошли; focused bridge 8/8 прошёл на 430x932, 320x568, iOS WebKit и desktop Chromium. Browser fallback Beszel/Identity и scoped Tribute Save просмотрены в light/dark evidence. |
| Route-scoped tab navigation | exact-route unit contract; focused four-project keyboard matrix; deterministic light/dark evidence; `pwsh -File scripts/verify.ps1 -Scope Changed`; standard dev restart | TabBar и нижний blur теперь монтируются только на восьми top-level routes; user detail и вложенные Settings освобождают bottom safe area и используют Telegram BackButton. Users сохраняет основную вкладку, но настоящий input открывает на отдельном `/admin/users/search` task route уже без tab navigation. Focused keyboard matrix прошла 20/20 на 430x932, 320x568, iPhone/WebKit и desktop, включая direct-load focus и Back history; light/dark Users/search/Kuma evidence просмотрены без overflow или пустого tab-bar резерва. Changed gate прошёл Ruff, 389 service-free backend, frontend lint/typecheck/70 unit/build, 113/113 mobile Playwright и docs. Standard Telegram-enabled dev пересобран и перезапущен с сохранением volumes; local/public frontend, health и ready вернули `200`, public debug — `404`, production asset совпадает, `telegram_main_app_ready` подтверждён. Live Telegram iOS keyboard acceptance остаётся обязательным. |
| Layered Telegram Back navigation | official Telegram BackButton event contract; pinned TanStack Router/history source; exact native-event Playwright regressions; full frontend and Changed gates; standard dev restart | Native Back больше не запускает browser pop до dirty confirmation: верхний confirmation/editor потребляет событие первым, а settings/users detail route использует явный semantic parent. На primary tab открытая confirmation временно получает BackButton вместо закрытия Mini App. Точный Dashboard → Settings → Beszel → dirty → Back → backdrop → Back → Discard сценарий остаётся в Settings; modal/editor priority и mode Back/Forward покрыты отдельно. `beforeunload` активен только при dirty state. Frontend lint/typecheck, 70 unit, production build и 119/119 mobile Playwright прошли; Beszel light/dark screenshots просмотрены без visual/console/network regressions. Changed gate и Markdown links зелёные. Standard Telegram-enabled dev пересобран и перезапущен с сохранением volumes; local `5173`/`8001`/`4173` и public root/health/ready вернули `200`, public debug — `404`, `telegram_main_app_ready` подтверждён, backend error markers отсутствуют. |
| Explicit text-input IME actions | complete frontend text-control inventory; focused four-project keyboard/registration/Tribute matrices; formatted-editor light/dark review; `pwsh -File scripts/verify.ps1 -Scope Changed`; standard dev restart | Каждый существующий text input теперь задаёт осмысленный native hint: Users `Search` завершает поиск и снимает focus, последовательные поля используют `Next`, финальные — `Done`, Tribute amount — `Go` с preview, а textarea/Tiptap сохраняют multiline `Enter`. Общий handler ограничен текущей form/dialog surface, игнорирует IME composition и не использует global focus/viewport listeners, timers, geometry rewrites или Telegram keyboard API. Focused keyboard matrix прошла 20/20, связанные registration/Tribute сценарии — 16/16 на 430x932, 320x568, iOS WebKit и desktop; formatted editor просмотрен в light/dark. Changed gate прошёл Ruff, 389 service-free backend, frontend lint/typecheck/70 unit/build, 113/113 mobile Playwright и docs. Standard Telegram-enabled dev пересобран и перезапущен с сохранением volumes; local/public frontend, health и ready вернули `200`, public debug — `404`, production asset совпадает, `telegram_main_app_ready` подтверждён. Live Telegram iOS IME-label/action acceptance остаётся обязательным. |
## Следующее действие

Следующие live evidence зависят от внешнего события Tribute: фактический period-end
`cancelled_donation`, period-end subscription cancellation и последующее renewal. UI не имитирует
их до подписанного webhook, а Creator API не предоставляет ручную сверку будущего billing state.

Отдельно остаются безопасный Broadcast, live Remnawave 3.x, Kuma и первый подтверждённый удалённый
CI run.

Для route-scoped tab navigation и IME actions требуется live Telegram iOS acceptance: два цикла
focus/close на Kuma, `Next` между URL/Slug, `Done` на Slug и переходы Users → focused search →
keyboard `Search` → Cancel/Back должны подтвердить корректный focus и отсутствие позднего появления
TabBar над нативной клавиатурой при открытии и закрытии task surface.
