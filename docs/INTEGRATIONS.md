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
но auth и остальные Bot API errors закрываются сразу. Только `has_main_web_app=true` и корректный bot
username разрешают выдать публичную referral-ссылку
`t.me/<bot>?start=ref_<compact-code>`. Проверенный статус и ссылка приходят в `GET /api/me/invite`;
frontend не угадывает username, `short_name` или тип Telegram-ссылки. Переход создаёт bot chat и
вызывает `/start ref_…`; бот присылает обычный neutral Welcome, но его кнопка ведёт на
`t.me/<bot>?startapp=ref_<compact-code>`. Если capability не подтверждена, share link не
публикуется, но personal code остаётся доступен для копирования и ручного ввода.

В локальном named-Tunnel режиме `scripts/dev-up.ps1 -EnableTelegram -NamedTunnelUrl
'https://<test-host>'` задаёт этот exact origin только запускаемому backend как `WEBAPP_URL` и
поднимает repo-owned safe preview на `127.0.0.1:80` в Windows или `127.0.0.1:4173` на macOS.
Cloudflare route и BotFather state остаются внешней явной конфигурацией; script их не создаёт и не
изменяет. При смене машины public hostname остаётся тем же, меняется только Cloudflare Service URL;
старый connector и Telegram polling останавливаются до запуска Mac origin.

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
успеха frontend обновляет Query cache без reload. Кнопка отправки оборачивает подтверждённую bot
deep link в официальный `t.me/share/url`; форматированный code остаётся в тексте для ручного ввода.
Обычный `/start` и referral `/start ref_…` показывают один и тот же Welcome. Payload проходит
строгую валидацию и влияет только на URL кнопки; registration mode, создание пользователя и ручной
invite остаются в Mini App.
Поля используют нативные HTML focus, form submit, `enterkeyhint` и IME semantics. Frontend не
вызывает `blur()`/`Telegram.WebApp.hideKeyboard()`, не вычисляет состояние клавиатуры из
`VisualViewport` и не переписывает геометрию shell/dialog при её открытии или закрытии. Telegram SDK
остаётся источником Telegram safe-area variables; браузер и WebView сами управляют перекрытием
layout viewport экранной клавиатурой.

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
Redis безопасный Welcome всё равно отправляется без дедупликации: этот handler больше не создаёт
пользователя и не вызывает provider. Это дополняет уникальный Telegram `update_id`: два сообщения
пользователя являются двумя корректными updates, а не повторной доставкой одного.

Primary evidence, проверено 2026-08-04, 2026-08-08, 2026-08-21 и 2026-08-22:

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
  bot chat и после Start вызывает `/start <parameter>`; Flowvy намеренно использует этот шаг, чтобы
  чат появился в списке до отдельного запуска Main Mini App кнопкой сообщения.
- [Telegram share links](https://core.telegram.org/api/links#share-links): `t.me/share/url` открывает
  выбор чата и принимает URL плюс редактируемый текст.
- [Telegram Mini Apps API](https://core.telegram.org/bots/webapps): `viewportHeight` обновляется
  недостаточно часто для плавной привязки нижнего UI, а `viewportStableHeight` меняется только после
  завершения жеста или анимации. Flowvy не привязывает shell или dialog к этим значениям.
- [Telegram Mini Apps BottomButton](https://core.telegram.org/bots/webapps#bottombutton), проверено
  2026-08-22: `MainButton` и Bot API 7.10+ `SecondaryButton` рисуются в нижнем интерфейсе самого
  Telegram. Flowvy fullscreen editors и выделенные Kuma/Beszel/Identity/Welcome settings task routes
  используют только `MainButton` для primary create/save action; section-scoped Tribute payment-link
  save остаётся DOM action внутри общего route. `SecondaryButton` не создаётся, потому что закрытие
  editor уже доступно через header close и `Escape`. Locked Telegram Apps SDK 3.11.8 проверяет
  capability `MainButton`; Flowvy намеренно не рисует DOM replacement для этих native primary
  actions. Если client bridge отсутствует или отвергает mount/update, fullscreen editor либо
  выделенный settings task остаётся без create/save action. Это fail-closed поведение позволяет
  отдельно подтвердить фактическую совместимость Swiftgram. Native action скрывается при открытом
  discard/delete confirmation и уничтожается при уходе с task. `color`, `text_color` и `is_active`
  передаются явно:
  native footer повторяет adaptive Flowvy tokens, а недоступный primary action визуально сохраняет
  прежнюю 40% disabled-палитру вместо активной Telegram-blue заливки.
- [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport): экранная
  клавиатура может уменьшать visual viewport без изменения layout viewport; эмуляция
  `device-fixed` через `resize`/`scroll` требует осторожности и может мерцать.
- [WebKit bug 265578](https://bugs.webkit.org/show_bug.cgi?id=265578), проверено 2026-08-21:
  `visualViewport.height` и `resize` на iOS могут обновляться только в конце анимации открытия или
  закрытия клавиатуры. Поэтому Flowvy не использует это событие для покадровой геометрии страницы.
- [WebKit bug 259770](https://bugs.webkit.org/show_bug.cgi?id=259770) и
  [WebKit bug 230225](https://bugs.webkit.org/show_bug.cgi?id=230225), проверено 2026-08-21:
  `interactive-widget=resizes-content` и VirtualKeyboard API остаются нереализованными. Поэтому
  web-owned fixed footer нельзя поддерживаемым CSS/JS contract синхронно вести за iOS keyboard.
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
  `done` обозначает завершение ввода, `search` — поиск; атрибут задаёт подпись action key, но не
  является командой приложению вручную снимать focus.
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

### Support notifications в private bot chat

Locked aiogram 3.26.0 отправляет fixed product-owned Support copy через существующий
`MessageSender`: новый request и user reply — каждому текущему active admin, support reply —
request owner. Notification запускается только после явного успешного PostgreSQL commit и остаётся
best effort: timeout или Bot API failure не меняет HTTP response и не откатывает Support mutation.
Fan-out ограничен пятью параллельными deliveries с десятисекундным timeout на recipient. Retry queue
и delivery analytics в MVP отсутствуют, поэтому process crash между commit и send может потерять
notification.

HTML dynamic values экранируются, message preview ограничен 1200 visible characters. Subject
и admin requester образуют одну bold heading строку с обычным Unicode `💬`; request/reply body
сначала проходит общую CommonMark → visible-text projection и помещается в обычный HTML
`<blockquote>`, а request/topic facts остаются в компактном metadata block. Поэтому editor source
маркеры вроде `**` не попадают в Telegram preview. Это всё ещё обычный `sendMessage`, а не Bot API
Rich Message, поэтому sender и fallback contract не расширяются. Telegram не получает
attachment filenames/bytes, signed R2 URL, device/subscription context или provider error. Кнопки
являются inline `web_app`: `Open` для admin и `Reply` для user. Их HTTPS URL указывает на
существующий exact route `/support/requests/<uuid>`; Mini App/BFF выполняют обычную fresh
authentication и owner/admin authorization. Без `WEBAPP_URL` текст отправляется без кнопки. Этот
же fail-safe применяется к non-HTTPS URL, URL с credentials, query или fragment. Service flow не
настраивается через operator Content/Settings. Совпадение Telegram ID support actor и request owner
не подавляет owner notification: это поддерживает проверяемый User/Admin mode одного администратора.

Primary evidence, проверено 2026-08-24:

- [Telegram Bot API `sendMessage`](https://core.telegram.org/bots/api#sendmessage): текст сообщения
  ограничен 1–4096 characters after entities parsing и поддерживает HTML parse mode.
- [Telegram Bot API formatting options](https://core.telegram.org/bots/api#formatting-options):
  обычный HTML parse mode поддерживает `<blockquote>`; динамические `<`, `>` и `&` должны быть
  заменены соответствующими HTML entities.
- [Telegram Bot API `InlineKeyboardButton`](https://core.telegram.org/bots/api#inlinekeyboardbutton):
  `web_app` принимает `WebAppInfo` и доступен в private chat между user и bot.

## Cloudflare R2 для Support attachments

Настройки backend: `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` и validated `SUPPORT_*` limits/retention. Все четыре R2 значения обязательны
вместе; при полном отсутствии text requests/replies остаются доступны, а upload intents получают
safe `503`. Mini App не принимает и не сохраняет credentials: `/admin/settings/support` показывает
только status, bucket, non-secret limits и read-only `HeadBucket` check.

Flowvy использует private Standard bucket без `r2.dev`/public custom domain и bucket-scoped Object
Read & Write token. BFF локально создаёт SigV4 presigned URL на fixed account S3 endpoint; direct
browser `PUT` включает подписанные `Content-Type` и `x-amz-checksum-sha256`. Перед присоединением к
сообщению BFF делает signed `HEAD` и требует exact SHA-256, byte size и content type. Имена object
генерируются сервером; original filename используется только в очищенной metadata и download
disposition. Download URL выдаётся owner или exact active admin на 60 секунд. Backend не загружает,
не читает и не распаковывает object bytes.

Browser PUT требует exact CORS origin Mini App и разрешённые `Content-Type` плюс
`x-amz-checksum-sha256`. R2 lifecycle нельзя использовать для точного правила «три дня после
Resolve»: provider expiry считает object age. Это правило и request expiry выполняет bounded Flowvy
worker; удаление PostgreSQL conversation происходит только после подтверждённого удаления R2
objects. Automated contract использует Boto3 signer, `httpx.MockTransport` и fake storage. Отдельно
авторизованный live dev smoke 2026-08-24 подтвердил private bucket, exact-origin CORS, presigned
PUT/HEAD/GET/DELETE и отсутствие test object после cleanup.

Primary evidence, проверено 2026-08-24:

- [R2 user-generated content architecture](https://developers.cloudflare.com/reference-architecture/diagrams/storage/storing-user-generated-content/): direct presigned upload отделяет file bytes от application server.
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/): GET/HEAD/PUT/DELETE, short expiry, signed content type, bearer-token и browser CORS semantics.
- [R2 S3 checksums](https://developers.cloudflare.com/r2/api/s3/api/): SHA-256 поддерживается S3-compatible API.
- [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/): credentials можно ограничить одним bucket и Object Read & Write.
- [R2 bucket CORS](https://developers.cloudflare.com/r2/buckets/cors/): browser origin, methods и sent headers должны быть явно allow-listed.
- [R2 bucket creation](https://developers.cloudflare.com/r2/buckets/create-buckets/): private default и bucket-name contract `a-z`, `0-9`, `-`, 3–63 characters.
- [R2 object lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/): deletion считается от object age и завершается асинхронно, поэтому это не resolved-at timer.

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
несовпадающий owner закрывает операцию. После этой проверки BFF публикует allow-listed device metadata:
`platform`, `osVersion`, `deviceModel`, `userAgent`, `requestIp`, `createdAt` и `updatedAt`.
`requestIp` — сохранённый Remnawave адрес запроса устройства, а не обещание текущего IP; nullable
metadata получает явный frontend fallback. Devices UI показывает название и monochrome glyph ОС из
`platform`, но не подменяет ОС значением `osVersion`. Контракт повторно сверён 2026-08-15 с official
2.8.1/3.1.0 schemas и [HWID documentation](https://docs.rw/features/hwid-device-limit/): кроме HWID,
идентифицирующие client headers optional. Метаданные не сохраняются Flowvy и не логируются.

Email endpoint в 2.x возвращает массив, потому что поле не уникально; Flowvy exact-фильтрует его и
останавливается при нескольких совпадениях. Все path parameters percent-encoded одним segment.
Timeout/network/non-2xx/malformed/envelope ошибки преобразуются в безопасные сообщения без raw
response body; production routes не возвращают `exc.detail`.

Dashboard больше не проксирует произвольный provider JSON. `GetStatsResponseDto` и
`GetBandwidthStatsResponseDto` проходят allow-list Pydantic projection; additive поля отбрасываются,
schema drift даёт degraded `null`, а повреждённый Redis cache удаляется и запрашивается заново.

Email и dashboard contract дополнительно сверены 2026-08-02:

- [Official 2.7.4 users controller](https://github.com/remnawave/backend/blob/2.7.4/src/modules/users/controllers/users.controller.ts)
  вызывает non-unique lookup и возвращает `data.map(...)`.
- [Official 2.7.4 email command](https://github.com/remnawave/backend/blob/2.7.4/libs/contract/commands/users/get-by/get-user-by-email.command.ts)
  фиксирует `response: z.array(ExtendedUsersSchema)`.
- [Official 2.8.1 HWID device schema](https://github.com/remnawave/backend/blob/2.8.1/libs/contract/models/hwid-user-device.schema.ts)
  фиксирует числовой `userId` и nullable `platform`, `osVersion`, `deviceModel`, `userAgent`,
  `requestIp` в device response, а также обязательные `createdAt`/`updatedAt`.
- [Official 3.1.0 HWID device schema](https://github.com/remnawave/backend/blob/3.1.0/libs/contract/models/hwid-user-device.schema.ts)
  сохраняет тот же используемый Flowvy metadata contract.
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
Flowvy BFF не подменяет этот provider identifier: Admin list/detail и user subscription response
отдельно добавляют nullable локальный `telegramUsername`, чтобы UI мог показывать изменяемое
`@username` основным именем. Admin оставляет `tg_<telegram_id>` вторично, а Home использует его
только как fallback. Batch lookup в Admin избегает N+1; user subscription читает одну уже
существующую local identity.
Registration default принимает только `duration`, `fixed` или `lifetime`, потому что Remnawave
create-user требует конкретный `expireAt`. Профиль с `automation` не хранит дни/дату, исключён из
default selector и отклоняется backend при прямом API-запросе. Если текущий default редактируется,
его нельзя перевести в `automation`, пока оператор не выберет другой registration profile.

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

Flowvy поддерживает два Creator-сценария Tribute: пожертвования и подписки. Интеграция не создаёт
платёж на стороне Tribute: администратор публикует provider-hosted ссылку, пользователь завершает
оплату в Tribute, а Flowvy меняет доступ только после аутентифицированного webhook.

### API access и административная настройка

`TRIBUTE_API_KEY` хранится только в server environment и никогда не возвращается frontend.
Fixed-origin client обращается к `https://tribute.tg/api/v1/subscriptions` с bounded timeout/body,
запрещёнными redirects и proxy environment. Кнопка проверки API и admin catalog выполняют только
read-only запрос подписок; платёж, отмена или provider mutation этим запросом не создаются.

Admin-only BFF отдаёт allow-listed subscription ID, название, валюту и периоды без API key и raw
provider response. Для каждой подписки администратор отдельно сохраняет HTTPS destination из
Tribute. Donation destination хранится в конкретном sponsor offer вместе с ожидаемыми суммой,
режимом one-time/recurring и периодом recurring-платежа. Для recurring donation Flowvy принимает
ровно `weekly`, `monthly`, `quarterly`, `halfyearly`, `yearly`. URL валидируется как absolute HTTPS без
credentials и fragment, но сервер не делает по нему исходящий запрос.

`commerce_rules` связывает donation или subscription с active access profile. Donation может
использовать fixed duration либо amount bands; вычисление идёт только в integer minor units.
Subscription всегда использует абсолютный подписанный `expires_at` и replace semantics. Preview
исполняет тот же calculator без сохранения и без provider mutation. Для benefits profile этих правил
рекомендуется `automation`: он хранит limits/status/tag/squads/provider options без локального срока;
target expiry всегда приходит из проверенного rule result и не превращает отсутствие даты в lifetime.

`sponsor_offers` отделяет пользовательское название, мотивационное описание и порядок от
платёжного правила. Draft не требует provider request. Публикация fail-closed проверяет enabled
rule, active profile, сохранённый subscription destination и актуальный subscription catalog либо
точные donation условия. Admin editor заранее помечает `Visible on Home` как `aria-disabled`, если
для выбранной subscription нет сохранённого destination, и указывает исправление в `Payment links`.
Backend повторяет проверку на случай гонки и возвращает стабильный
`tribute_subscription_destination_missing`; frontend локализует code, не разбирая English detail.
Снятие с
публикации не зависит от Tribute: snapshot очищается в SQL `NULL`, а редактируемые поля сохраняются;
повторная публикация снова проверяет provider facts и создаёт новый snapshot. Одна catalog
subscription представлена одним rule и одним опубликованным offer со всеми provider periods/prices;
несколько donation offers могут переиспользовать одно гибкое правило. Удаление rule атомарно удаляет
все связанные public/draft offers и сам rule без запроса к Tribute. Сохранённые checkout/payment и
entitlement snapshots не удаляются, уже выданный доступ не меняется; pending payment больше не
сопоставляется автоматически с удалённым правилом.

### Webhook, inbox и идемпотентность

`POST /api/webhooks/tribute` принимает ограниченный raw body, проверяет `trbt-signature` как
HMAC-SHA256 до JSON parsing, затем проверяет timestamp/freshness и strict schema поддерживаемого
события. `test_event` отвечает `200` без записи inbox. Поддерживаемые lifecycle events:

- donation: `new_donation`, `recurrent_donation`, `cancelled_donation`;
- subscription: `new_subscription`, `renewed_subscription`, `cancelled_subscription`.

Официальный webhook contract, повторно проверенный 2026-08-23, задаёт HMAC-SHA256 и retry примерно
на сутки: 5 минут, 15 минут, 30 минут, 1 час, 2 часа, 4 часа, 8 часов, 8 часов. Поэтому локальный
intent не считается окончательно потерянным только из-за возврата пользователя или истечения
30-минутного UI-ожидания.

Любое иное корректно подписанное имя события сохраняется только как нормализованная `ignored`
audit metadata. Оно не сопоставляет checkout, не создаёт entitlement operation и не вызывает
Remnawave. Raw payload, signature и Telegram username не сохраняются.

PostgreSQL `tribute_webhook_events` подавляет точные повторы по SHA-256 тела и удаляется bounded
retention worker после server-configured срока. Subscription semantic identity строится из
subscription/user/absolute expiry, поэтому повтор одного состояния не продлевает доступ второй раз.
Donation не содержит документированного уникального ID отдельного платежа: Flowvy использует
нормализованный fingerprint и автоматизирует identified donation только после полного
checkout/rule match. Anonymous donation всегда переводится в review.

Local `sponsor_checkouts` — 30-минутный intent, а не платёж. Donation webhook подтверждает его
только при совпадении Telegram user, family, mode, event time, signed amount/currency и recurring
period с immutable offer snapshot. Subscription дополнительно требует exact external item ID.
Несовпадение создаёт review без grant. Browser redirect и кнопка обновления статуса не подтверждают
оплату сами по себе; они только перечитывают server state.
При выборе другого опубликованного offer BFF под user row lock сначала проверяет новый destination и
paid-state guard, затем переводит прежний pending intent в `expired` и создаёт новый. Отдельный
confirm dialog и предварительный `DELETE` для переключения не нужны. Явная отмена в Home использует
`DELETE`, чтобы закрыть только текущий local intent и сразу убрать waiting state. Операция не
вызывает Tribute, не отменяет provider payment и не удаляет audit row. Matching signed event
перебирает совместимые `pending` и `expired` intents от новых к старым, поэтому позднее точное подтверждение прежнего
subscription item либо donation amount/currency/mode/period всё равно атрибутируется и обрабатывается.

### Entitlement planner и provider execution

После нового inbox insert planner в той же DB transaction создаёт максимум одну durable
`entitlement_operations` decision и не делает внешний HTTP call. Он требует существующего active
Flowvy user, однозначную локальную Remnawave identity, enabled exact rule и active profile. Нулевая
provider link допустима для первого платного доступа; неизвестный Telegram ID не создаёт local user
и не обходит registration/invite policy.

Provider worker запускается вместе с приложением. Он выбирает due rows через
`FOR UPDATE SKIP LOCKED`, не держит DB transaction во время HTTP, повторно проверяет identity и
применяет absolute target. Retry сверяет полный профиль и не продлевает доступ повторно.
Перед первым платным изменением `entitlement_baselines` фиксирует восстановимое базовое состояние;
после окончания последнего платного периода scheduled restore возвращает base profile либо
отключает account, созданный только платёжным grant.

Admin journal показывает только allow-listed поля и server-computed действия. Retry разрешён для
исчерпанной временной provider-ошибки; Resolve требует заметку и закрывает review без изменения
доступа. Каждое действие идемпотентно по request UUID и записывается в append-only audit.

### Пользовательские состояния

`GET /api/me/sponsor` не вызывает Tribute. Он возвращает одно доказанное состояние и допустимое
действие:

- без платного доступа — выбор опубликованного donation offer либо subscription offer со всеми
  доступными periods/prices;
- pending — primary-проверка server status, secondary-переход в текущую оплату и явная отмена
  local attempt; другой offer можно выбрать сразу, текущая карточка не дублируется в каталоге;
- applied one-time donation — точная дата и выбор любого опубликованного варианта продления;
- recurring donation — точная оплаченная дата и управление автодонатом в Tribute;
- active subscription — точная дата и управление подпиской в Tribute;
- provisioning/review — ожидание или обращение к администратору без повторной оплаты.

Tribute support подтвердила 2026-08-14: cancellation webhook recurring donation приходит в конце
уже оплаченного периода, а Creator API не позволяет вручную прочитать будущий billing state.
Поэтому до конца периода Flowvy показывает доступ активным и заранее объясняет момент обновления.
Для subscription другие subscription offers видны, но недоступны до окончания текущего периода;
кнопка управления остаётся provider-hosted. Creator API `1.0.0` возвращает `periods[]` с `periodId`,
`period` и `price`, но официальные API/publishing docs на 2026-08-15 документируют только одну
subscription link и не документируют URL-предвыбор `periodId`. Поэтому Flowvy показывает варианты
до перехода, а сам выбор периода пользователь завершает в Tribute.
Одна subscription automation выбирает один общий benefits profile для всех этих периодов. Profile
задаёт трафик, устройства, status, tag и squads, а Tribute `expires_at` задаёт фактический срок; его
локальная validity не используется. Режим profile `automation` делает это ограничение явным и не
требует вводить фиктивные дни/дату; такой профиль нельзя использовать для регистрации. Разные
benefits требуют отдельных subscriptions и rules.

Home показывает allow-listed часть текущего active benefits profile прямо в каждом offer: лимит
трафика и число устройств, включая `Unlimited` для provider-значений 0/null. После перехода в
Tribute pending state автоматически перечитывается при Telegram `visibility_changed` и browser
focus/visibility fallback. В pending state `Check payment status` является primary, а повторный
переход в Tribute и отмена local attempt — secondary. Успешная проверка без нового provider state и
успешная локальная отмена не создают отдельный notice; ошибки остаются явными. Redirect/return сам
по себе всё равно не считается оплатой. После applied state pending copy и альтернативы скрываются
до явного `Extend`/`Resume`.

UX contract не маскирует это ограничение под локальный выбор: Home группирует название, мотивацию и
все provider periods/prices в одной коммерческой карточке. Название и мотивацию задаёт оператор;
Flowvy не придумывает отдельные названия услуг для provider periods. Shared read-only billing list
показывает цену как главный факт, а нормализованный interval как вторичное условие списания;
единственный CTA открывает Tribute. Radio, checkmark, active tile и segmented control запрещены,
пока Flowvy не может передать реальный выбор провайдеру. Admin переиспользует тот же semantic
billing presenter как storefront preview; status, visibility и Edit остаются отдельными действиями. Legacy
дубли одного subscription сохраняются, но показываются свёрнуто после одной основной матрицы, чтобы
оператор мог явно отредактировать или удалить их без скрытой миграции данных.

Решение сверено 2026-08-15 с авторитетными UX-источниками:

- [Apple HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout) и
  [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)
  для группировки и честного selection affordance;
- [Baymard Plan Matrix](https://baymard.com/ecommerce-design-examples/plan-matrix) и
  [subscription-service research](https://baymard.com/blog/new-research-consumables-subscription-services)
  для видимых, сравнимых цен;
- [Carbon selectable tiles](https://carbondesignsystem.com/components/tile/usage/) для различения
  информационной и selectable tile;
- [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) для
  соответствия реальному provider flow, видимого статуса и предсказуемого следующего действия.

Все пользовательские сообщения используют настроенный branding app name. Фиксированное имя Flowvy
допустимо только в административном интерфейсе.

### Проверка и официальные источники

Локальный smoke `scripts/verify-tribute-entitlements.ps1` проверяет подписанный donation flow через
production FastAPI/Dishka/PostgreSQL boundary без реального Tribute или Remnawave. Backend contract
tests покрывают signature/freshness, strict schemas, exact duplicates, unsupported-event ignore,
checkout matching, planner, executor и restore. Deterministic Playwright matrix покрывает admin
rules/offers/activity и Home states без реальных платежей.

Контракт повторно сверялся 2026-08-23 с официальными материалами Tribute:

- [Webhook API](https://wiki.tribute.tg/for-content-creators/api-documentation/webhooks);
- [Subscriptions API 1.0.0](https://wiki.tribute.tg/for-content-creators/api-documentation/subscriptions);
- [Donations](https://wiki.tribute.tg/for-content-creators/donations);
- [Regular donations](https://wiki.tribute.tg/for-content-creators/donations/regular-donations);
- [Subscriptions](https://wiki.tribute.tg/for-content-creators/subscriptions);
- [Subscription publishing](https://wiki.tribute.tg/for-content-creators/subscriptions/subscription-publishing).

## Правила изменения контракта

1. Проследить route → service/client → schema → frontend type/hook/fixture.
2. Зафиксировать actual local/upstream version и primary evidence.
3. Покрыть success, auth failure, timeout, non-2xx, malformed JSON/schema drift и специфичные
   freshness/replay/ownership cases.
4. Проверить cache TTL/invalidation и degraded behavior.
5. Не логировать raw body/token/URL подписки; обновить этот документ и `PROJECT_STATE.md` только после
   свежих проверок.
