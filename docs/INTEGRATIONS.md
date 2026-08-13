# Интеграции Flowvy

Внешний контракт может измениться независимо от репозитория. Перед правкой используйте repo skill
`flowvy-integration`: установите локальную версию/snapshot, проверьте primary official source,
зафиксируйте URL/version/date и добавьте deterministic tests. Ни один автоматический тест не должен
обращаться к production.

## Telegram Mini App и Bot API

Настройки backend: `BOT_TOKEN`, `WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`, `WEBAPP_URL`,
`ADMIN_TELEGRAM_IDS`, `INIT_DATA_TTL`.
Frontend получает raw init data через Telegram Apps SDK и отправляет
`Authorization: tma <raw_init_data>`.
Flowvy использует один Telegram product contract — Main Mini App. Она должна быть включена у
целевого бота через `@BotFather` → `/mybots` → bot → **Bot Settings** → **Configure Mini App** →
**Enable Mini App** и указывать на постоянный публичный HTTPS URL. При startup backend
вызывает официальный `getMe`; для timeout/network/Telegram 5xx разрешён один ограниченный повтор,
но auth и остальные Bot API errors закрываются сразу. Только `has_main_web_app=true` и корректный bot username разрешают
выдать ссылку `t.me/<bot>?startapp=ref_<compact-code>`. Проверенный статус и ссылка приходят в
`GET /api/me/invite`; frontend не угадывает username, `short_name` или тип Telegram-ссылки. Если
capability не подтверждена, share link не публикуется, но personal code остаётся доступен для
копирования и ручного ввода.

В локальном named-Tunnel режиме `scripts/dev-up.ps1 -EnableTelegram -NamedTunnelUrl
'https://<test-host>'` задаёт этот exact origin только запускаемому backend как `WEBAPP_URL` и
поднимает repo-owned safe preview на `127.0.0.1:80`. Cloudflare route и BotFather state остаются
внешней явной конфигурацией; script их не создаёт и не изменяет.

Нативную ширину, позицию и drag-area окна Mini App контролирует клиент Telegram, не frontend.
Адаптер Flowvy распознаёт официальный platform value `tdesktop` и не отправляет этому клиенту
`expand()` или `requestFullscreen()`. Если mounted viewport уже сообщает fullscreen, адаптер один
раз вызывает документированный `exitFullscreen()`, чтобы вернуться в оконную панель. Это узкий
обход открытого Windows multi-monitor bug Telegram Desktop: приложение не пытается имитировать
исправление через CSS и не меняет существующее mobile viewport/fullscreen поведение.
Telegram Desktop 7.0.6 сам задаёт начальный inner size панели `384x694` logical px, но включает
resize для всех восьми границ. Пользователь может увеличить оконную панель; Mini Apps API не даёт
Flowvy задать другой стартовый desktop-размер.

При открытии Main Mini App Telegram помещает payload в signed raw `initData` как `start_param` и
дублирует его в client GET parameter `tgWebAppStartParam`. Flowvy не доверяет client-копии: `GET
/api/onboarding` сообщает только наличие валидного server-side payload, а `POST
/api/onboarding/redeem-launch` не принимает code в body и извлекает его из уже проверенного
`WebAppInitData.start_param`. Ручной ввод остаётся отдельным `POST /api/onboarding/redeem`. После
успеха frontend обновляет Query cache без reload. Кнопка отправки оборачивает подтверждённую Main
Mini App URL в официальный `t.me/share/url`; форматированный code остаётся в тексте для ручного
ввода. Bot `?start=` не используется как referral transport и обычный `/start` не разбирает
реферальный payload.
Однострочные поля используют standard `enterkeyhint` и при Enter вызывают
`Telegram.WebApp.hideKeyboard()` с DOM `blur()` fallback. IME composition не прерывается,
а `textarea` сохраняет обычный перенос строки.

Backend отказывает при пустом token, проверяет signature, TTL, слишком будущий `auth_date`, user и
active-state. Admin дополнительно требует текущий allow-list и сохранённую роль. Сбой Redis activity
write не отменяет уже подтверждённую Telegram-аутентификацию.

Admin welcome-media принимает JPEG/PNG/WebP/GIF/MP4 с единым лимитом 10 MiB. FastAPI уже хранит
multipart file как spooled upload; Flowvy до обращения к Bot API сканирует фактические bytes
ограниченными chunks и затем передаёт этот же файл в aiogram по 64 KiB. Полная вторая копия в памяти
не создаётся, ложному multipart `size` не доверяем. Filename очищается от path/control characters,
пустой/oversized файл не отправляется, raw provider error не возвращается. Неудачное удаление
временного сообщения не отменяет уже полученный пригодный `file_id`.

Если задан `WEBHOOK_URL`, конфигурация атомарно требует bot token и секрет формата Telegram.
Регистрация передаёт `secret_token`, а `POST /webhook` до разбора JSON сравнивает
`X-Telegram-Bot-Api-Secret-Token`. Без `WEBHOOK_URL` route не регистрируется: локальный dev с
непустым `BOT_TOKEN` удаляет прежний webhook и получает updates через long polling. Production
должен использовать webhook; polling предназначен для одного локального процесса test bot.

Telegram хранит ещё не полученные updates до 24 часов, поэтому после сетевого разрыва несколько
отдельных `/start` могут прийти одним batch и выполняться параллельно. Flowvy объединяет такие
одновременные попытки одной Telegram identity через Redis lease: атомарный `SET NX EX 120`,
случайный token и token-checked Lua finish. После стабильного ответа остаётся cooldown 5 секунд;
после временной ошибки lease удаляется, чтобы следующий осознанный retry не блокировался. При сбое
Redis бот fail closed возвращает временную ошибку. Это дополняет уникальный Telegram `update_id`:
два сообщения пользователя являются двумя корректными updates, а не повторной доставкой одного.

Primary evidence, проверено 2026-08-04 и 2026-08-08:

- [Telegram Main Mini App](https://core.telegram.org/bots/webapps#launching-the-main-mini-app): её
  настраивают через `@BotFather` (`/mybots` → bot → Bot Settings → Configure Mini App → Enable Mini
  App); `t.me/<bot>?startapp=<parameter>` открывает приложение и передаёт parameter как
  `start_param`/`tgWebAppStartParam`.
- [Telegram deep-link client contract](https://core.telegram.org/api/links#main-mini-app-links): при
  отсутствии Main Mini App клиент обязан обработать `?startapp` как обычную username-ссылку;
  Direct Mini App является отдельным contract с обязательным `/<short_name>`.
- [Telegram Mini App init data validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
  raw `initData` проверяется на backend; `initDataUnsafe` и client launch params нельзя использовать
  как доказательство identity или invite attribution.
- [Telegram Bot API `User`](https://core.telegram.org/bots/api#user): `has_main_web_app` возвращается
  методом `getMe` и является проверяемой capability. Locked aiogram 3.26.0 содержит это поле, а
  `WebAppInitData.start_param`; locked Telegram Apps SDK 3.11.8 остаётся только transport raw
  `initData`, не источником решения.
- [Telegram bot deep linking](https://core.telegram.org/api/links#bot-links): `?start=` открывает
  bot chat и лишь после отдельного нажатия Start вызывает `/start <parameter>`, поэтому не является
  one-tap Main Mini App flow Flowvy.
- [Telegram share links](https://core.telegram.org/api/links#share-links): `t.me/share/url` открывает
  выбор чата и принимает URL плюс редактируемый текст.
- [Telegram Mini Apps API](https://core.telegram.org/bots/webapps): `hideKeyboard()` доступен
  с Bot API 9.1 и скрывает активную экранную клавиатуру.
- [Telegram Mini Apps API](https://core.telegram.org/bots/webapps): `expand()` изменяет доступную
  высоту, а `requestFullscreen()` и `exitFullscreen()` являются отдельными Bot API 8.0+ командами;
  API не определяет управление координатами или drag-area нативного desktop-окна.
- [Telegram Desktop issue #30963](https://github.com/telegramdesktop/tdesktop/issues/30963),
  проверено 2026-08-08: открытый Windows multi-monitor bug в fullscreen сохраняет старую точку
  привязки панели, из-за чего она выходит за правый/нижний край и получает смещённый input.
- [Telegram Desktop v7.0.6 WebView launch source](https://github.com/telegramdesktop/tdesktop/blob/fccb2672b05f7b788708e39a7b482e50ebdea510/Telegram/SourceFiles/inline_bots/bot_attach_web_view.cpp#L1266-L1287)
  и [fullscreen event handler](https://github.com/telegramdesktop/tdesktop/blob/fccb2672b05f7b788708e39a7b482e50ebdea510/Telegram/SourceFiles/ui/chat/attach/attach_bot_webview.cpp#L2316-L2335),
  проверено 2026-08-08: клиент передаёт platform `tdesktop`, обрабатывает request/exit fullscreen и
  не содержит обработчика `web_app_expand`.
- [Telegram Desktop v7.0.6 panel size](https://github.com/telegramdesktop/tdesktop/blob/fccb2672b05f7b788708e39a7b482e50ebdea510/Telegram/SourceFiles/payments/ui/payments.style#L143)
  и [locked `lib_ui` resize implementation](https://github.com/desktop-app/lib_ui/blob/632ae6ac4e1750900bbb2f40241b2e60eea00cef/ui/widgets/separate_panel.cpp#L1350-L1373),
  проверено 2026-08-08: начальный inner size равен `384x694`, а оконный режим создаёт resize-зоны
  на четырёх границах и четырёх углах.
- [HTML `enterkeyhint`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint):
  `done` обозначает завершение ввода/закрытие IME, `search` — поиск.
- [Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook): `secret_token`
  имеет длину 1–256 и алфавит `A-Z a-z 0-9 _ -`; Telegram присылает его в одноимённом secret header.
- [aiogram 3.26 — setWebhook](https://docs.aiogram.dev/en/v3.26.0/api/methods/set_webhook.html):
  установленная locked версия поддерживает аргумент `secret_token`.
- [Telegram Bot API — Sending files](https://core.telegram.org/bots/api#sending-files),
  [sendPhoto](https://core.telegram.org/bots/api#sendphoto) и
  [sendAnimation](https://core.telegram.org/bots/api#sendanimation), проверено 2026-08-02:
  multipart `InputFile`, текущий photo limit 10 MB и animation limit 50 MB. Flowvy намеренно
  применяет меньший общий предел 10 MiB.
- [Telegram Bot API — Getting updates](https://core.telegram.org/bots/api#getting-updates),
  проверено 2026-08-04: incoming updates хранятся до 24 часов, `update_id` уникален, а `getUpdates`
  возвращает массив накопленных updates.
- [Redis `SET`](https://redis.io/docs/latest/commands/set/) и
  [официальный lock pattern](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/),
  проверено 2026-08-04: `NX` атомарно запрещает второй claim, TTL обеспечивает recovery, а
  случайный token с compare-and-delete Lua не позволяет старому обработчику снять чужой lease.

## Remnawave

Настройки: `REMNAWAVE_URL`, `REMNAWAVE_API_TOKEN`, `REMNAWAVE_WEBHOOK_SECRET`. Shared async httpx
client имеет timeout 10 секунд; при непустом URL startup вызывает `/api/auth/status` и останавливает
приложение, если ping неуспешен.

Терминологическая граница сверена 2026-08-11 с первичными источниками: официальный
[Remnawave README на commit `a39e153`](https://github.com/remnawave/panel/blob/a39e153c663cccd9b11357fd171016f778429cb9/README.md)
описывает панель как средство управления прокси поверх Xray-core, а официальный
[Xray-core README на commit `bc6e966`](https://github.com/XTLS/Xray-core/blob/bc6e966af890d0ef481501ec171321ec802c6857/README.md)
перечисляет Remnawave среди web panels. Поэтому собственный UI и документация Flowvy называют
выдаваемый этой интеграцией доступ Xray-прокси или просто Remnawave-доступом, но не подменяют его
другим классом технологии. Произвольные operator-owned названия бренда, мониторов и инцидентов
передаются как данные и не переписываются во время выполнения.

Flowvy поддерживает Remnawave 2.7/2.8 и 3.0/3.1 через одну version-aware границу. При первом
version-sensitive запросе client читает `/api/system/metadata`, принимает только major `2` или `3`
и кэширует major на время жизни приложения. Неизвестный будущий major и malformed version закрывают
операцию безопасной ошибкой; ID одного поколения никогда не подставляется в route/body другого.

Используемые категории API:

- user lookup и subscription info;
- HWID device list/delete/delete-all;
- admin list/detail/search/actions/delete;
- external squads, system metadata/stats/bandwidth;
- signed event webhook на `/api/webhooks/remnawave`.

Subscription/devices mapping частично сохраняется в PostgreSQL. Dashboard кэшируется 30 секунд,
external squads — 300 секунд. Валидный webhook проверяется до JSON parsing: HMAC по исходным bytes,
обязательный `X-Remnawave-Timestamp`, точное совпадение header с timestamp внутри подписанного body,
timezone и окно свежести. Remnawave не даёт delivery/event ID, поэтому Flowvy вычисляет SHA-256
исходного body и атомарно принимает такой delivery один раз. Повтор отвечает `200`, но не выполняет
cache side effect повторно.

Raw `data` не сохраняется: оно может содержать email, subscription URL и protocol credentials. В
БД остаются только digest, scope, event, provider timestamp и receive time. Legacy `data` удаляется
миграцией, timestamps становятся timezone-aware, metadata старше 30 дней удаляется ограниченными
пакетами. Любое user/HWID событие инвалидирует dashboard cache, node event — Pulse cache.

`api-remnawave.json` сообщает `Remnawave API v2.7.4` / `2.7.4`, но URL получения и дата snapshot в
истории не зафиксированы. Поэтому snapshot остаётся legacy locked envelope contract и не считается
текущим OpenAPI. Контракты 2.8.1, 3.0.0 и 3.1.0 сверены 2026-08-02 с официальными exact tags:

- `2.8.1` — `ba51868149362d0b9ac0e23133d0532176ccb5a2`;
- `3.0.0` — `0f8b639b6c5b194c1f81bf574dab1026d0efcb7c`;
- `3.1.0` — `c7495492ce62f43332e9fb7dd66b9f97a799a73e`.

User status contract повторно сверён 2026-08-08 по official exact tag
[2.8.1](https://github.com/remnawave/backend/blob/2.8.1/libs/contract/constants/users/status/status.constant.ts):
provider возвращает только `ACTIVE`, `DISABLED`, `LIMITED`, `EXPIRED`. Outbound create/access
profile принимает ровно эти четыре значения. Inbound user/subscription/admin/dashboard mapping не
публикует произвольный provider-текст: известные коды сохраняются, отсутствующий, malformed или
будущий код нормализуется в BFF-only `UNKNOWN`, а неизвестные dashboard counters суммируются в
`UNKNOWN`. Frontend локализует код по контексту и не предлагает enable/disable, пока status
неизвестен; это исключает ошибочную mutation из предположения «всё, что не ACTIVE, надо включить».

Официальный [переход на 3.0](https://f.docs.rw/releases/v300) и
[API diff 3.0 → 3.1](https://f.docs.rw/t/topic/354/6) подтверждают ключевую границу: с 3.0 user
responses больше не содержат `uuid`, user/HWID paths и bodies используют числовой `userId`, а
Telegram/email lookup выполняется через cursor-paginated `/api/users/stream`. Flowvy exact-фильтрует
все страницы, ограничивает pagination, отклоняет повторный/нечисловой cursor и неоднозначный
результат. В 3.1 используемые Flowvy контракты меняются только аддитивно: node responses/webhooks и
subscription request history получают дополнительные поля, которые allow-list модели игнорируют.

Внутри BFF и admin frontend стабильной provider identity теперь служит числовой `id`. Legacy UUID
nullable и используется только для 2.x route/body. PostgreSQL хранит оба значения: миграция добавляет
уникальный nullable `remnawave_user_id`, сохраняет старый UUID и безопасно связывает однозначную
legacy-запись при первом ответе 3.x. Конфликт двух provider identities не объединяется молча.

Фактически настроенная dev-панель 2026-08-02 всё ещё сообщила версию `2.8.1`; read-only probes
подтвердили subscription, dashboard, список пользователей и HWID devices. Ни один probe не изменял
пользователя, устройства или настройки. Delivery/config contract отдельно сверён с первичными
источниками:

- [Remnawave Receiving webhooks](https://docs.rw/features/webhooks/) документирует
  `X-Remnawave-Signature`, `X-Remnawave-Timestamp`, ISO 8601 body timestamp и отсутствие event ID.
- [Official backend tag 2.7.4: sender](https://github.com/remnawave/backend/blob/2.7.4/src/queue/notifications/webhook-logger/webhook-logger.processor.ts)
  подписывает сериализованный body и отправляет timestamp header из того же job payload.
- [Official backend tag 2.7.4: producer](https://github.com/remnawave/backend/blob/2.7.4/src/integration-modules/notifications/webhook-module/events/webhook.events.ts)
  создаёт один ISO timestamp и передаёт его одновременно в body и header job.
- [Official backend tag 2.7.4: config schema](https://github.com/remnawave/backend/blob/2.7.4/src/common/config/app-config/config.schema.ts)
  требует для `WEBHOOK_SECRET_HEADER` минимум 32 символа и строго alphanumeric alphabet.

Device service перед чтением/удалением всегда заново подтверждает provider owner. HWID response в
2.7.4 связывает устройство через `userUuid`, а 2.8.1/3.x — через числовой `userId`; Flowvy принимает
официальную форму текущего ответа и сверяет её с только что найденным пользователем. Отсутствующий или
несовпадающий owner закрывает операцию. Email endpoint в 2.x возвращает массив, потому что поле не
уникально; Flowvy exact-фильтрует его и останавливается при нескольких совпадениях. Все path
parameters percent-encoded одним segment. Timeout/network/non-2xx/malformed/envelope ошибки
преобразуются в безопасные сообщения без raw response body; production routes не возвращают
`exc.detail`.

Dashboard больше не проксирует произвольный provider JSON. `GetStatsResponseDto` и
`GetBandwidthStatsResponseDto` проходят allow-list Pydantic projection; additive поля отбрасываются,
schema drift даёт degraded `null`, а повреждённый Redis cache удаляется и запрашивается заново.

Email и dashboard contract дополнительно сверены 2026-08-02:

- [Official 2.7.4 users controller](https://github.com/remnawave/backend/blob/2.7.4/src/modules/users/controllers/users.controller.ts)
  вызывает non-unique lookup и возвращает `data.map(...)`.
- [Official 2.7.4 email command](https://github.com/remnawave/backend/blob/2.7.4/libs/contract/commands/users/get-by/get-user-by-email.command.ts)
  фиксирует `response: z.array(ExtendedUsersSchema)`.
- [Official 2.8.1 HWID device schema](https://github.com/remnawave/backend/blob/2.8.1/libs/contract/models/hwid-user-device.schema.ts)
  фиксирует числовой `userId` в device response.
- [Official 2.8.1 device-list command](https://github.com/remnawave/backend/blob/2.8.1/libs/contract/commands/hwid/get-user-hwid-devices.command.ts)
  фиксирует envelope `total` + `devices`; проверен exact tag commit
  `ba51868149362d0b9ac0e23133d0532176ccb5a2`.

`scripts/verify-contracts.ps1` проверяет legacy JSON и deterministic client fixtures для
2.8.1/3.0.0/3.1.0, но не заменяет read-only сверку с конкретной установленной панелью. Webhook
success/auth/freshness/schema/size/replay, concurrent deduplication, retention, previous-head
migration, client transport/envelope/version/pagination/identity, email array и dashboard projections
покрыты локально.

### Регистрация и начальный Remnawave-доступ

Flowvy создаёт provider user только когда оператор назначил общий registration access profile.
Без профиля создаётся только локальный Telegram user. Для каждого нового provider user используется
детерминированный уникальный username `tg_<telegram_id>`, а protocol credentials, short UUID и
subscription identity генерирует сама Remnawave; Flowvy их не переиспользует между пользователями.

До применения open/invite policy local miss проверяется exact read-only lookup по `telegramId`.
Существующий provider-only user импортируется в локальные user/invite/subscription без attribution и
без применения default profile: его status, expiry, limits, tag и squads в Remnawave не изменяются.
Provider miss означает действительно нового пользователя; transport, contract или ambiguity error
fail closed возвращает временную недоступность и не запускает invite redemption/create-user.
Exact read-only lookup повторяется не более одного раза с задержкой 200 мс только когда client явно
классифицировал timeout, connection failure либо upstream HTTP `502/503/504` как transient.
Auth/permission, ambiguity и malformed/schema errors автоматически не повторяются. Create-user
по-прежнему не retry-ится: после неопределённого результата разрешён только read-only reconciliation.

Create-user body зафиксирован по official exact tags
[2.8.1](https://github.com/remnawave/backend/blob/2.8.1/libs/contract/commands/users/create-user.command.ts),
[3.0.0](https://github.com/remnawave/backend/blob/3.0.0/libs/contract/commands/users/create-user.command.ts)
и [3.1.0](https://github.com/remnawave/backend/blob/3.1.0/libs/contract/commands/users/create-user.command.ts).
Во всех трёх используемая Flowvy часть стабильна: обязательны `username` и `expireAt`; поддерживаются
`status`, `trafficLimitBytes`, `trafficLimitStrategy`, `description`, uppercase `tag` до 16 символов,
`telegramId`, `hwidDeviceLimit`, `activeInternalSquads` и `externalSquadUuid`. `0` traffic означает
безлимит. Lifetime — продуктовая абстракция Flowvy, которая отправляет `2099-12-31T23:59:59Z`, потому
что upstream всё равно требует `expireAt`.

Перед сохранением профиля squad UUID сверяются с live allow-listed ответами
`GET /api/internal-squads` и `GET /api/external-squads`. При регистрации сначала выполняется exact
lookup по Telegram ID. Единственный найденный provider user принимается как уже созданный результат
предыдущей попытки; неоднозначный ответ client отклоняет. Ошибка/timeout create не приводит к слепому
повтору: для `502/504` выполняется reconciliation lookup, после чего локальная subscription
записывается только для подтверждённого provider user.

User tag для access profile не вводится произвольно: BFF читает provider-owned список через
`GET /api/users/tags`, возвращает frontend только нормализованные строки и перед сохранением повторно
проверяет изменённый tag по live allow-list. Контракт `response.tags: string[]` зафиксирован по
official exact tags
[2.8.1](https://github.com/remnawave/backend/blob/2.8.1/libs/contract/commands/users/tags/get-all-tags.command.ts),
[3.0.0](https://github.com/remnawave/backend/blob/3.0.0/libs/contract/commands/users/tags/get-users-tags.command.ts)
и [3.1.0](https://github.com/remnawave/backend/blob/3.1.0/libs/contract/commands/users/tags/get-users-tags.command.ts),
проверено 2026-08-02. Ошибка каталога блокирует только новый/изменённый tag; profile без tag или с
неизменённым уже сохранённым tag не получает лишнюю зависимость от provider availability.

## Pulse: Uptime Kuma или Beszel

Singleton `provider_settings` хранит выбранный `pulse_provider`: `disabled`, `kuma` или `beszel`.
Там же лежат public Kuma URL/slug и Beszel Hub URL. Admin API меняет источник, открывает отдельные
экраны настройки и выполняет connection test. Pulse service нормализует выбранный источник в один
стабильный `/api/pulse` contract и кэширует результат в Redis на 60 секунд. Смена источника или его
URL/slug сразу удаляет старый cache.

`POST /api/admin/settings/{kuma|beszel}/test` проверяет URL/slug из текущего несохранённого черновика:
request проходит те же normalizer и transport policy, но не меняет `provider_settings` и не трогает
Pulse cache. Legacy `GET` test routes продолжают проверять уже сохранённую конфигурацию.

### Uptime Kuma

Flowvy получает public status page/heartbeat data и агрегирует groups/monitors/incidents.

Environment secret для Kuma сейчас не используется: интеграция рассчитана на public status page.
Public target обязан быть origin-only HTTPS URL без credentials/path/query/fragment, slug — одним
строгим path segment. Перед каждым запросом Flowvy разрешает все A/AAAA адреса, отклоняет весь ответ,
если хотя бы один IP не public, и подключается к уже проверенному IP с исходными `Host` и TLS SNI.
Это закрывает не только прямой private/loopback/link-local/metadata target, но и mixed DNS/DNS
rebinding. Redirect и proxy environment отключены, тело читается streaming до заданного лимита,
upstream body/URL не попадает в публичную ошибку.

Для Docker/LAN можно операторским env `KUMA_ALLOWED_PRIVATE_ORIGINS` разрешить только точный origin
`scheme://host:port`; wildcard/CIDR не поддерживаются. Исключение применяется к origin целиком, но
link-local, multicast и unspecified адреса запрещены всегда. `KUMA_MAX_RESPONSE_BYTES` по умолчанию
равен 1 MiB. При включении Pulse target проходит раннюю DNS/policy validation, а при каждом test/Pulse
request проверяется заново. Admin connection test использует тот же безопасный client.

Parser валидирует используемый response contract. Kuma 2.x `incidents` и поддерживаемый 1.x
`incident: object | null` нормализуются в один список. Итоговый статус теперь различает all-down,
mixed-down, pending/unknown, maintenance и empty monitor set; неизвестное/неполное состояние не
выдаётся как healthy.

Primary evidence, проверено 2026-08-02; реальная версия настроенной панели пока не установлена:

- [Uptime Kuma Status Page](https://github.com/louislam/uptime-kuma/wiki/Status-Page) подтверждает,
  что status page публична и кэшируется upstream.
- [Official release 2.3.2](https://github.com/louislam/uptime-kuma/releases/tag/2.3.2) — текущий
  зафиксированный reference tag.
- [2.3.2 status-page router](https://github.com/louislam/uptime-kuma/blob/2.3.2/server/routers/status-page-router.js)
  определяет `/api/status-page/:slug`, `/api/status-page/heartbeat/:slug`, последние 100 heartbeat и
  uptime key `<monitorId>_24`.
- [2.3.2 status-page model](https://github.com/louislam/uptime-kuma/blob/2.3.2/server/model/status_page.js)
  возвращает `incidents`, `publicGroupList` и `maintenanceList`.
- [1.23.16 status-page model](https://github.com/louislam/uptime-kuma/blob/1.23.16/server/model/status_page.js)
  зафиксирован как legacy compatibility contract с `incident`.
- [HTTPX redirects](https://www.python-httpx.org/quickstart/#redirection-and-history) и
  [environment variables](https://www.python-httpx.org/environment_variables/) подтверждают
  поведение redirect/proxy; Flowvy задаёт его явно и покрывает pinned transport тестом на locked
  HTTPX 0.28.1/httpcore 1.0.9.

Детерминированный suite покрывает URL/slug smuggling, IPv4/IPv6 private classes, mixed DNS, exact
private allow-list, pinned Host/SNI, redirect, timeout/connect, non-2xx без утечки тела, size limit,
malformed/schema drift, Kuma 1.x/2.x incidents, cache eviction и Pulse statuses. В локальной БД Kuma
выключена, URL/slug отсутствуют, поэтому live target contract пока объективно не проверен.

### Beszel

Flowvy зафиксирован на официальном Beszel `v0.18.7`, exact commit
`6e3fd90834309213aca32f2ff5fb0b027661c39a`. Beszel предупреждает, что API может меняться даже в
minor releases, поэтому смена версии требует повторной сверки contract и fixtures.

Hub URL хранится в `provider_settings`, но `BESZEL_EMAIL` и `BESZEL_PASSWORD` читаются только из
server environment. Admin/frontend получают лишь `beszelCredentialsConfigured`; credential, auth
token и raw provider body не записываются в БД, Redis или response. Для Flowvy следует создать
отдельного пользователя Beszel с ролью `readonly` и выдать ему только нужные systems.

Read-only flow использует PocketBase API:

- `POST /api/collections/users/auth-with-password` с `identity`/`password` получает auth token;
- `GET /api/collections/systems/records` читает `id`, `name`, `status`, `created`;
- `GET /api/collections/system_stats/records` читает только `system` и `created`, отдельно для
  native `1m` и `20m` samples.

Статусы `up`, `down`, `paused`, `pending` становятся соответственно `up`, `down`, `maintenance`,
`pending`. Для каждого system Pulse строит 40 минут истории из минутных samples; до времени создания
system ячейки считаются pending, отсутствие ожидаемого sample — down, последняя ячейка сверяется с
current status. Uptime за 24 часа считается по native 20-minute samples и creation-aware
denominator. Beszel не предоставляет совместимый incident contract, поэтому `incidents` остаётся
пустым, а systems входят в одну группу `Systems`.

Beszel использует ту же transport-защиту, что Kuma: origin-only URL, HTTPS для public target,
повторная проверка всех A/AAAA адресов, DNS pinning с исходными Host/SNI, redirects/proxy off,
streaming body limit и безопасные ошибки. Docker/LAN origin разрешается только точным значением в
`BESZEL_ALLOWED_PRIVATE_ORIGINS`; wildcard/CIDR нет. `BESZEL_MAX_RESPONSE_BYTES` по умолчанию 1 MiB.
Количество systems, records и страниц ограничено до загрузки полного ответа.

Primary evidence, проверено 2026-08-02:

- [Beszel REST API](https://beszel.dev/guide/rest-api) описывает PocketBase API, auth и предупреждает
  о возможных изменениях API в minor releases.
- [Beszel user accounts](https://beszel.dev/guide/user-accounts) описывает роли и доступ к systems.
- [PocketBase auth-with-password](https://pocketbase.io/docs/api-records/#auth-with-password)
  фиксирует auth endpoint, request fields и raw `Authorization` token.
- [Beszel v0.18.7 types](https://github.com/henrygd/beszel/blob/v0.18.7/internal/site/src/types.d.ts)
  фиксируют system statuses и `system_stats` resolutions.
- [Beszel v0.18.7 collection rules](https://github.com/henrygd/beszel/blob/v0.18.7/internal/hub/collections.go)
  разрешают read-only пользователю чтение назначенных systems/stats и запрещают запись.
- [Beszel v0.18.7 record retention](https://github.com/henrygd/beszel/blob/v0.18.7/internal/records/records.go)
  подтверждает агрегацию и 24-часовое хранение `20m` records.

Детерминированный suite покрывает auth success/failure, отсутствие credential до network call,
status/schema drift, pagination bounds, malformed data, timeout, redirect, non-2xx, oversized body,
SSRF/mixed DNS, DNS pinning, draft test без persistence, provider selection/cache и Pulse
history/status mapping. Draft read-only test с локальными server credentials прошёл
2026-08-02 через public dev BFF без сохранения. После ручной активации Beszel
публичный `GET /api/pulse` вернул `200`, `operational`, 1 group и 7 monitors;
Hub URL и credentials в артефакты/логи не выводились.

## Tribute: первый платёжный provider

Текущий реализованный scope — admin configuration, безопасная проверка server-side API key и
observe-only webhook inbox. Ни один из этих flows не исполняет commerce rule и не меняет доступ.
Секрет задаётся как `TRIBUTE_API_KEY`, хранится в environment и никогда не возвращается frontend,
БД или Redis. `POST /api/admin/settings/tribute/test` через fixed-origin client выполняет один
`GET https://tribute.tg/api/v1/products?page=1&size=1`. Это read-only API check, а не тестовый
платёж: он не создаёт order, subscription, donation, purchase или refund. Client не следует
redirects, игнорирует proxy environment, имеет конечный timeout, ограничивает response body и
валидирует JSON до success.

Admin Settings выделяет Payments отдельно от взаимоисключающего Pulse provider selector. Tribute
экран показывает credential presence, API-check state и provider-neutral access automation для:

- subscriptions: `new_subscription`, `renewed_subscription`, `cancelled_subscription`; типы
  `regular`, `gift`, `trial`, причём gift/trial при продлении становятся regular;
- digital products: `new_digital_product`, `digital_product_refunded`; `purchase_id` связывает
  возврат с исходной покупкой;
- donations: `new_donation`, `recurrent_donation`, `cancelled_donation`.

Automation rule состоит из source match, duration calculator и internal entitlement action:

- source: `donation`, `subscription` или `digital_product`; donation дополнительно различает
  one-time/recurring, subscription/product требуют точный external item ID;
- calculator: постоянное число дней либо volume amount bands. Выбирается максимальный порог,
  подходящий к amount, и его ratio применяется ко всей сумме через integer minor units;
- action: active access profile, `extend`/`replace`, priority и enabled state. Calculated duration
  переопределяет default validity profile, остальные provider/access limits переиспользуются;
- preview вызывает backend calculator с draft и amount, но ничего не сохраняет и не выполняет.

Правила не содержат встроенной бизнес-схемы. Например, bands `500 RUB / 30 days` и
`3500 RUB / 365 days` дают 30, 60, 365 и 417 дней для 500, 1000, 3500 и 4000 RUB, но это только
admin-authored/test fixture. Repository не seed-ит такие суммы.

Flowvy принимает подписанный envelope на `POST /api/webhooks/tribute`, но намеренно не публикует
этот callback URL в UI. Endpoint доступен только при непустом `TRIBUTE_API_KEY`, требует точный
`application/json` и `trbt-signature`, ограничивает raw body 64 KiB, проверяет подпись до JSON parse,
принимает `sent_at` не старше 25 часов с допуском 5 минут в будущее и строго валидирует
`name/created_at/sent_at/payload`. Webhook contract использует HMAC-SHA256 от raw body тем же API
key. Актуальный
официальный Markdown 2026-08-14 документирует exponential retries примерно 24 часа:
5m/15m/30m/1h/2h/4h/8h/8h, но не даёт event ID для subscription/donation и не описывает
encoding подписи, key scopes/rotation или отдельный timestamp header. Текущий verifier принимает
64-символьный hexadecimal SHA-256 digest без учёта регистра. Это необходимо подтвердить реальной
контролируемой доставкой или официальным уточнением до переключения callback; наличие endpoint само
по себе не является разрешением менять действующий webhook.

PostgreSQL inbox хранит SHA-256 точного raw body как `delivery_key`, event family/status, provider
timestamps и только допустимые нормализованные Telegram/payment/item identifiers, сумму в integer
minor units, валюту и payment mode. Raw body, signature и username не сохраняются. Одинаковые и
конкурентные exact deliveries атомарно подавляются уникальным DB constraint; поддерживаемые события
получают статус `observed`, неизвестные безопасные event names — `ignored`. Retention удаляет записи
пакетно через 90 дней. Параметры границы задаются server-only переменными
`TRIBUTE_WEBHOOK_MAX_AGE_SECONDS`, `TRIBUTE_WEBHOOK_FUTURE_TOLERANCE_SECONDS`,
`TRIBUTE_WEBHOOK_MAX_BODY_BYTES` и `TRIBUTE_WEBHOOK_RETENTION_DAYS`.

Exact-body dedupe не является semantic payment idempotency: повторно сформированный provider event
может иметь другой body, а один transaction/purchase identifier ещё не описан для всех event family.
Поэтому inbox не зависит от commerce/user/Remnawave services и не выполняет entitlement side
effect. Identity reconciliation, semantic idempotency key для каждого event family, rule/profile
snapshot, абсолютный target expiry и refund compensation остаются отдельным executor slice.

У Tribute не найден официальный sandbox, test hostname/credential или health endpoint. При этом
операторский интерфейс Tribute содержит действие отправки тестового webhook-запроса; его фактические
signature encoding и payload shape ещё не приняты Flowvy и потому не считаются частью доказанного
контракта. OpenAPI указывает только production origin. Автотесты используют MockTransport и
Playwright fixtures; реальный платёж или self-payment не нужны как smoke. Live API check и штатную
тестовую доставку может инициировать только оператор явно настроенной интеграции.

Provider-neutral rule design дополнительно сверялся 2026-08-13 с primary Stripe pricing/
entitlements документацией: provider prices не являются internal entitlements, а volume и graduated
tiers должны различаться явно. Flowvy реализует только volume semantics, нужную текущему UX, и не
называет её graduated:

- https://docs.stripe.com/products-prices/pricing-models
- https://docs.stripe.com/subscriptions/pricing-models/tiered-pricing
- https://docs.stripe.com/billing/entitlements

Primary evidence, повторно проверено 2026-08-14: русская Wiki revision `CMk0YDiolSYBsE89s7Fs`,
generated 2026-08-04; ранее прочитанный OpenAPI `3.1.0`, Tribute API `1.0.0`, единственный server
`https://tribute.tg/api/v1`.

- [Tribute API authorization](https://wiki.tribute.tg/ru/api-dokumentaciya) — создание key и
  обязательный header `Api-Key`.
- [Tribute products API](https://wiki.tribute.tg/ru/api-dokumentaciya/tovary) — read-only list/detail,
  product types/statuses и Stars-only API refund restriction.
- [Tribute subscriptions API](https://wiki.tribute.tg/ru/api-dokumentaciya/podpiski) — read-only
  subscription/period catalog; публичного CRUD offers нет.
- [Tribute webhooks](https://wiki.tribute.tg/ru/api-dokumentaciya/vebkhuki) — signature, envelope,
  retry и перечисленные lifecycle events.
- [Digital-product integration](https://wiki.tribute.tg/ru/for-content-creators/digital-product/api-integration)
  — payment links, Telegram identity caveat, access grant и refund flow.
- [Donation request](https://wiki.tribute.tg/ru/for-content-creators/donations/donation-request) и
  [regular donations](https://wiki.tribute.tg/ru/for-content-creators/donations/regulyarnye-donaty)
  — one-off/recurring/anonymous behavior; публичного donation catalog endpoint нет.
- [Canonical Russian OpenAPI](https://tribute.tg/api/v1/openapi/ru) — ранее зафиксированные
  required/optional поля и enum differences; 2026-08-14 endpoint дважды не отдал полный документ
  за 60/120 секунд, поэтому неизвестные webhook payload fields не стали обязательными.

## Правила изменения контракта

1. Проследить route → service/client → schema → frontend type/hook/fixture.
2. Зафиксировать actual local/upstream version и primary evidence.
3. Покрыть success, auth failure, timeout, non-2xx, malformed JSON/schema drift и специфичные
   freshness/replay/ownership cases.
4. Проверить cache TTL/invalidation и degraded behavior.
5. Не логировать raw body/token/URL подписки; обновить этот документ и `PROJECT_STATE.md` только после
   свежих проверок.
