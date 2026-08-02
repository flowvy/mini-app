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
`X-Telegram-Bot-Api-Secret-Token`. Без настроенного webhook route не регистрируется.

Primary evidence, проверено 2026-08-02:

- [Telegram Mini Apps API](https://core.telegram.org/bots/webapps): `hideKeyboard()` доступен
  с Bot API 9.1 и скрывает активную экранную клавиатуру.
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

## Remnawave

Настройки: `REMNAWAVE_URL`, `REMNAWAVE_API_TOKEN`, `REMNAWAVE_WEBHOOK_SECRET`. Shared async httpx
client имеет timeout 10 секунд; при непустом URL startup вызывает `/api/auth/status` и останавливает
приложение, если ping неуспешен.

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

## Правила изменения контракта

1. Проследить route → service/client → schema → frontend type/hook/fixture.
2. Зафиксировать actual local/upstream version и primary evidence.
3. Покрыть success, auth failure, timeout, non-2xx, malformed JSON/schema drift и специфичные
   freshness/replay/ownership cases.
4. Проверить cache TTL/invalidation и degraded behavior.
5. Не логировать raw body/token/URL подписки; обновить этот документ и `PROJECT_STATE.md` только после
   свежих проверок.
