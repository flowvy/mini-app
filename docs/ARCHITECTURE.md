# Архитектура Flowvy

Документ описывает устойчивые границы текущего кода. Точный статус реализации и известные риски —
в [`PROJECT_STATE.md`](PROJECT_STATE.md); локальный запуск — в
[`DEV_ENVIRONMENT.md`](DEV_ENVIRONMENT.md).

## Общая схема

```text
Telegram Mini App / Browser
            |
            | HTTPS / Authorization: tma <initData>
            v
React + TanStack Router/Query (:5173 в dev)
            |
            | /api/*
            v
FastAPI BFF + aiogram webhook/polling (:8001)
       |             |              |
       v             v              v
 PostgreSQL        Redis        External HTTP
 local state    cache/metrics   Remnawave, Kuma/Beszel,
                                Tribute, Telegram Bot API
```

Frontend не обращается к Remnawave, Kuma, Beszel, Tribute, PostgreSQL или Redis напрямую. FastAPI формирует
ответы под конкретные экраны, проверяет Telegram identity и скрывает особенности внешних API.

## Доверенные границы

1. **Telegram Mini App input** — недоверенный до проверки подписи и `auth_date` по bot token.
2. **Frontend role/mode** — только отображение. Решение о доступе всегда принимает backend.
3. **Remnawave/Kuma/Beszel/Tribute и webhooks** — внешние данные: нужны timeout, schema validation,
   безопасная ошибка, проверка подписи и защита от повторов там, где есть side effect.
4. **PostgreSQL** — локальная долговременная запись. Изменяется приложением и Alembic migrations.
5. **Redis** — временные cache/metrics/activity данные; потеря Redis не должна менять права доступа.
6. **Debug routes** — намеренно обходят Telegram auth и допустимы только на изолированном localhost.

## Backend

### Сборка приложения и lifecycle

`flowvy.api.factory:create_app` создаёт FastAPI, Dishka container, middleware и routers. Lifespan:

- создаёт bot/dispatcher; при полном webhook-конфиге регистрирует callback, иначе для локальной
  разработки удаляет устаревший webhook и запускает long polling;
- проверяет доступность Remnawave при непустом `REMNAWAVE_URL`;
- запускает периодический сбор метрик через Redis и PostgreSQL;
- при остановке завершает задачу и закрывает bot/container.

Точка входа `python -m flowvy` запускает Uvicorn на `0.0.0.0:8001`; reload зависит от `DEBUG`.

### Слои

- `api/routes/` — HTTP input/output, зависимости аутентификации и перевод известных ошибок в HTTP.
- `services/` — orchestration и BFF-агрегация для экранов.
- `repositories/` — повторяемая работа с локальными SQLAlchemy models.
- `schemas/` — Pydantic contracts backend/frontend и адаптация внешних ответов.
- `models/` — локальная схема PostgreSQL.
- `di.py`, `di_bff.py`, `di_dashboard.py`, `di_webhooks.py`, `di_bot.py` — Dishka wiring.

APP scope используется для Settings, engine/session factory, Redis, shared httpx client, Remnawave,
Kuma, отдельных proxy-free Beszel/Tribute clients и bot. SQLAlchemy session и большинство BFF services имеют
REQUEST scope; provider commits или rollbacks транзакцию после обработки запроса.

### HTTP-потоки

Пользовательские маршруты:

- `GET /api/me` — проверка initData и чтение существующего пользователя; exact provider-only
  Remnawave match импортирует локально без изменения provider, а полностью неизвестного пользователя
  не создаёт и возвращает стабильный `registration_required`/`invite_required` code.
- `GET /api/onboarding`, `POST /api/onboarding/register|redeem|redeem-launch` — явная открытая
  регистрация, ручной invite code либо Main Mini App invite из проверенного Telegram
  `initData.start_param`. Launch-mutation не принимает code в body. `GET /api/me/invite` отдаёт
  собственный код, счётчик и referral URL только при подтверждённой capability бота.
- `GET /api/me/subscription` — Remnawave user/subscription и upsert локальной subscription.
- `GET/DELETE /api/me/devices...` — свежее сопоставление Telegram user с числовым Remnawave user ID,
  optional legacy UUID и HWID devices.
- `GET /api/pulse` — нормализованный статус выбранного Kuma/Beszel provider, если Pulse включён.

Admin routes под `/api/admin` повторно получают текущего локального пользователя и проверяют его
роль. Они отдают dashboard, полный/постраничный список пользователей, detail/actions и provider,
branding/welcome/localized Content settings. `POST /api/admin/settings/tribute/test` выполняет только фиксированный
read-only запрос subscriptions с server-side key; ключ в response не входит.
`/api/admin/registration` управляет режимом, access profiles и live squad options. Admin Broadcast
API в текущем коде отсутствует.

Access profile хранит provider benefits и явную политику срока. `duration`, `fixed` и `lifetime`
могут быть registration default и дают Remnawave обязательный `expireAt`. `automation` не хранит
дни или дату: целевой срок обязан предоставить payment rule либо другая автоматизация. Такой профиль
исключён из registration default на UI и повторно отклоняется backend, чтобы новый пользователь не
получил неявный либо бессрочный доступ.

Служебные маршруты:

- `GET /api/health` — liveness процесса без обращения к зависимостям.
- `GET /api/ready` — readiness PostgreSQL и Redis с коротким timeout и безопасным `503`.
- `POST /api/webhooks/remnawave` — HMAC-проверка, сохранение события и cache invalidation.
- `POST /webhook` — передача Telegram update в aiogram dispatcher.
- `/api/debug/*` и `/api/debug/admin/*` — локальные auth-bypass версии части потоков; каждый handler
  вызывает debug guard.

### Authentication и authorization

Frontend отправляет raw Telegram init data как `Authorization: tma <value>`. Backend использует
aiogram validation с `BOT_TOKEN`, проверяет TTL и наличие пользователя. После успешной проверки
время активности записывается в Redis hash.

При Telegram-enabled startup backend вызывает Bot API `getMe` и кэширует только username и
`has_main_web_app`. Публичная ссылка приглашения имеет формат
`t.me/<bot>?start=ref_<code>` и выдаётся только при `has_main_web_app=true`: она открывает чат и
передаёт payload обычному `/start`. Бот отправляет neutral Welcome, а его referral-aware кнопка
ведёт на `t.me/<bot>?startapp=ref_<code>`. Только этот второй переход переносит code в signed Main
Mini App `start_param`. Client launch parameter и `initDataUnsafe` не участвуют в attribution:
auto-redeem извлекает код только из уже HMAC-проверенного raw `initData`. Если capability нельзя
подтвердить, система не подменяет flow Direct Mini App-ссылкой.

При `GET /api/me` локальная запись синхронизируется, если уже существует. После local miss выполняется
exact Remnawave lookup по Telegram ID: provider-only user импортируется в local user/invite/subscription
без referral attribution, default profile и provider mutation. Provider miss продолжает обычный
onboarding, а lookup error fail closed возвращает временную недоступность. Второе исключение — первый
bootstrap identity из `ADMIN_TELEGRAM_IDS`, чтобы владелец не заблокировал сам себя invite-only
режимом. Обычная регистрация полностью нового пользователя всегда является отдельной mutation. Admin
dependency доверяет только текущему backend allow-list и локальной записи, не client mode.

Invite redemption ограничивается по Telegram ID через Redis и fail-closed при его недоступности.
В PostgreSQL берётся transaction-scoped advisory lock на Telegram ID: повторный запрос одной identity
не создаёт дубль, а один пользовательский код может зарегистрировать разных людей. Если provisioning Remnawave успел выполниться перед
timeout, повторный exact lookup завершает локальную запись без создания дубля.

### Данные и кэш

PostgreSQL хранит пользователей, подписки, access profiles, commerce rules, Tribute inbox,
entitlement operations и одноразовые referral conversions, один публичный invite code на
пользователя, прямую attribution в `users.invited_by_id`, singleton provider settings, историю bot
metrics и принятые Remnawave webhook events. Код не является authentication credential; доступ
задаёт общий registration profile. Код
хранится в БД, потому что владелец может посмотреть и переслать его снова. Alembic migrations
образуют одну линейную цепочку.

Redis используется для:

- `dashboard:remnawave` — Remnawave dashboard, TTL 30 секунд;
- `pulse:data` — provider-neutral Pulse aggregation, TTL 60 секунд;
- `external_squads` — имена squads, TTL 300 секунд;
- request counters и `bot:last_seen` до периодической записи activity в PostgreSQL;
- часовое окно попыток invite redemption;
- Telegram media `file_id` cache в message sender.

Subscription и devices для отдельного пользователя читаются из Remnawave без общего response cache;
локальная subscription хранит числовой provider ID, optional legacy UUID, status, expiry и device
limit для последующих запросов.

## Внешние интеграции

### Remnawave

`RemnawaveClient` — async wrapper поверх shared `httpx.AsyncClient` с timeout 10 секунд. Он скрывает
`response` envelope и преобразует часть ответов в Pydantic schemas. Поддерживаются lookup
пользователя, subscription info, HWID devices, admin user actions, metadata, external squads и
dashboard statistics.

Для version-sensitive операций client один раз читает metadata и поддерживает две ветки: 2.x с
legacy user UUID/lookup endpoints и 3.0/3.1 с числовым `userId` и filtered user stream. BFF/admin
использует числовой ID независимо от upstream generation; неизвестный major закрывается ошибкой.

`docs/api-remnawave.json` — reference snapshot, а не гарантированно актуальный контракт. Любое
изменение интеграции требует сверки с primary source/фактической версией панели и contract tests.

### Pulse providers

`provider_settings.pulse_provider` выбирает `disabled`, `kuma` или `beszel`. Kuma URL/public
status-page slug и Beszel Hub URL меняются через admin settings. Pulse service получает данные
выбранного client, переводит их в общий groups/monitors/heartbeats/incidents contract и кэширует в
Redis. При выключенной или неполной настройке `/api/pulse` возвращает `404`.

Kuma использует публичный status-page contract. Beszel авторизуется серверными
`BESZEL_EMAIL`/`BESZEL_PASSWORD`, читает назначенные systems и `1m`/`20m` system stats; секреты не
входят в settings API или БД. Оба client используют origin-only policy, DNS validation/pinning,
redirect/proxy запрет, ограниченное тело и безопасное error mapping. Private Docker/LAN origins
требуют отдельного точного allow-list для каждого provider.

### Tribute payments и durable entitlement pipeline

Tribute integration включает admin configuration, проверку API access, authenticated webhook inbox,
durable planner/ledger, операторский журнал и выключенный по умолчанию provider executor. Секрет
`TRIBUTE_API_KEY` хранится только в server environment. Fixed-origin client обращается только к
документированному read-only `https://tribute.tg/api/v1/subscriptions`, запрещает redirects/proxy
environment, ограничивает timeout/body и валидирует provider schema. Connection check и admin
catalog читают только subscription/period catalog. Ни платёж, ни возврат, ни provider mutation этим
запросом не создаются.

Frontend выделяет Payments в отдельную Settings section и показывает credential presence,
read-only API check, persisted payment destinations, automation rules, user-facing sponsor offers
и последние allow-listed ledger operations.
Admin-only BFF catalog нормализует subscriptions без API key или raw provider body; редактор
выбирает точный `subscription_id` по названию и provider price, сохраняя совместимость с
отсутствующим в текущем каталоге ID существующего правила. Так как subscriptions API не возвращает
URL, singleton `provider_settings` хранит JSONB mapping
`subscription_id → destination`. Donation destination и ожидаемая сумма принадлежат конкретному
`sponsor_offer`, чтобы один публичный тариф всегда вёл по одной ссылке. Admin API принимает только
нормализованный absolute HTTPS без credentials/fragment; URL не fetch-ится сервером. Mapping
отсутствующего в текущем каталоге ID
сохраняется до явного удаления, поэтому временный provider/catalog сбой не стирает настройку.
Rule сопоставляет provider/source conditions с внутренним access profile, но не является provider
тарифом. Donation использует `fixed` или `volume`: `fixed` задаёт постоянное число дней, а `volume`
выбирает максимальный подходящий
порог и целочисленно вычисляет `floor(amount_minor * unit_days / unit_amount_minor)` для всей суммы.
Calculated days явно задают срок grant независимо от validity выбранного access profile;
traffic/device/squad/tag/provider options переиспользуются. Для таких правил профиль можно хранить с
`validity_mode=automation`, чтобы не показывать фиктивные дни или дату. `extend` означает будущую платную базу
`max(now, latest_uncompensated_paid_expiry)`, а не registration/base expiry; `replace` — `now`.
Subscription не вычисляет duration по amount:
`provider_expiry` всегда берёт абсолютный подписанный Tribute `expires_at` и `replace` semantics.
Один выбранный benefits profile применяется ко всем периодам одной provider subscription: он задаёт
traffic/device/squad/tag/provider options, а его local validity игнорируется. Поэтому профиль можно
явно сохранить как `automation`: без локальных дней/даты и без ложного обещания срока. Разные преимущества
требуют отдельных provider subscriptions и отдельных rules, а не period-specific профилей внутри
одного rule.

PostgreSQL `commerce_rules` хранит provider-neutral match/action columns и schema-validated JSONB
calculator payload. Admin-only CRUD повторно проверяет active access profile. Draft preview
выполняет тот же backend calculator, не сохраняет rule и не изменяет пользователя. Frontend вводит
major currency units, но wire/storage используют integer minor units; floating-point не участвует
в entitlement calculation.

`sponsor_offers` является отдельным provider-neutral presentation layer поверх одного
`commerce_rule`: title/description/order не дублируют payment calculation. Description является
настраиваемым мотивационным текстом конкретного варианта на Home; системные pending/active/review
сообщения остаются server-state copy и не маскируют факты оплаты. Скрытый draft можно
сохранить без provider request. Снятие с публикации переводит immutable snapshot в SQL `NULL`,
не запрашивает provider и сохраняет редактируемые поля; следующая публикация всегда строит новый
проверенный snapshot. Admin может связать существующий offer с другим совместимым rule: update
повторно валидирует destination/profile/provider facts и для опубликованного offer атомарно заменяет
его snapshot. Уже начатые checkouts сохраняют прежние immutable offer/rule facts, поэтому relink
влияет только на последующие платёжные попытки. Публикация fail-closed требует enabled rule и active access profile;
subscription повторно проверяется по Creator catalog, а checkout URL и provider-confirmed prices
сохраняются immutable JSONB snapshot. Одна provider subscription представлена одним rule и одним
опубликованным offer, который содержит все документированные catalog periods. Donation
дополнительно требует собственную HTTPS destination, ожидаемые minor-unit сумму и payment mode, а
для recurring — точный provider period. Сумма обязана дать access через
канонический calculator, а mode согласоваться с linked rule; правило `any` разрешает офферу выбрать
ровно один публичный режим.
Несколько публичных offers могут переиспользовать один гибкий rule. Удаление rule в одной
request-scoped транзакции сначала удаляет все связанные presentation offers, затем сам rule.
История payment/checkouts и entitlement snapshots остаётся, уже выданный доступ не отзывается;
pending payment после такого административного решения больше не получает автоматический match.

Administrator-authored offer description хранится как ограниченный CommonMark source, а не HTML и
не provider-specific Telegram MarkdownV2. Backend нормализует только line endings и сохраняет
абзацы и списки. Общий frontend `FormattedTextEditor` использует pinned Tiptap 3.30.1. При touch
selection остаётся native iOS/Telegram menu для Cut/Copy/Paste/Format, а приложение не добавляет
второй контекстный popup. Один фиксированный toolbar Tiptap постоянно расположен над editor surface
на touch, keyboard и fine-pointer устройствах. Он следует WAI-ARIA toolbar pattern: имеет accessible
name, `aria-controls`, roving tab stop и arrow/Home/End navigation. Форматирование сразу видно в
contenteditable без отдельного preview.
Editor ограничивает
300 видимых символов; API допускает до 2 000 source-символов, чтобы CommonMark markers не уменьшали
полезный лимит. Общий `FormattedText` выполняет allow-listed semantic render без raw HTML. Контракт
включает paragraph/line break, bold, italic, strikethrough, link, quote и ordered/unordered list;
изображения, headings, tables и arbitrary HTML не входят. Тот же content layer предназначен
будущему Broadcast, а Telegram delivery позже обязан преобразовывать CommonMark AST в entities/HTML
на server boundary, не пересылать source как MarkdownV2.

Authenticated `GET /api/me/sponsor` не вызывает Tribute и возвращает единое server-computed
состояние доступа/оплаты, допустимое primary action, точные paid/base expiry, pending checkout и
только published ready offers. `POST /api/me/sponsor/checkouts` сериализует active local user,
записывает один 30-minute local `sponsor_checkouts` intent с immutable offer snapshot и возвращает
provider-hosted URL. Повтор того же offer переиспользует intent, другой offer получает conflict.

Provider-wide referral benefits настраиваются в той же Payments route двумя независимыми
переключателями. Inviter reward требует фиксированное число дней и active `automation` access
profile. После первой Tribute grant operation приглашённого, которая действительно перешла в
`applied`, executor один раз фиксирует `referral_conversions` по unique invitee и создаёт отдельную
`provider=flowvy`, `event_name=referral_reward`, `extend` grant operation пригласившему с immutable
profile snapshot. Повтор webhook, renewal и последующие donation не создают вторую конверсию;
выключенная либо невалидная на момент первой оплаты конфигурация также записывается как terminal
decision без отложенной награды.

Welcome discount доступен только приглашённому active user без прежней applied Tribute grant и
только для одного выбранного published ready subscription offer. Flowvy хранит готовый общий
absolute HTTPS promo link Tribute как opaque destination и введённый оператором процент 1–99:
backend подменяет destination и фиксирует процент до создания immutable checkout snapshot. Home
получает `welcomeDiscount` и `welcomeDiscountPercent` только для eligible offer, зачёркивает
provider price и рассчитывает ориентировочную first-payment price в minor units. Обычный URL и цена
остаются для остальных пользователей и offers. Flowvy не создаёт и не валидирует promo code и не
обещает персональность ссылки; фактические validity, activation limit, minimum EUR 1, non-stacking и
финальная checkout price принадлежат Tribute. За соответствие введённого процента promo code
отвечает оператор.

Authenticated `DELETE /api/me/sponsor/checkouts/{id}` под row lock переводит только принадлежащий
пользователю pending intent в существующий terminal `expired`; это идемпотентное локальное действие
не обращается к Tribute и не утверждает отмену платежа. Поздний matching signed event по-прежнему
может подтвердить такой intent, поэтому гонка между возвратом пользователя и webhook не теряет
доказанную оплату.
Donation webhook подтверждает intent по единственному pending/expired intent того же Telegram user,
event family/payment mode, времени не раньше intent и точным фактическим amount/currency/mode/period
из frozen offer snapshot. Документированный `donation_request_id` сохраняется как provider fact, но не
сравнивается с opaque `startapp`-ссылкой: Creator contract не даёт Flowvy их mapping. Для
subscription exact provider item ID остаётся обязательным. Несовпавший donation intent закрывается
и создаёт review без grant; совпавший intent передаёт planner точный `commerce_rule_id` оффера, а
расчёт использует только signed payment fields. Этот POST не создаёт платёж у Tribute и не
подтверждает доступ.

Для `review` backend сам вычисляет допустимые operator actions. Только terminal
`provider_unavailable` можно вернуть в `retry`; любую review operation можно закрыть как
`resolved` с обязательной заметкой, причём resolve не меняет provider access. Admin mutation
блокирует operation через `SELECT ... FOR UPDATE`, сериализует client request UUID transaction-level
advisory lock и в той же transaction пишет append-only `entitlement_operation_actions` с actor и
предыдущим состоянием. Повтор того же request UUID возвращает уже записанный результат; иной
payload или устаревшее действие получает conflict. Activity projection показывает только
server-computed actions и последнюю безопасную audit-запись без actor identity и внутренних
snapshots.

`POST /api/webhooks/tribute` проверяет HMAC-SHA256 над ограниченным raw body до strict JSON parsing,
freshness и timestamp consistency. PostgreSQL `tribute_webhook_events` атомарно подавляет точные
повторы по SHA-256 body и хранит только нормализованные metadata, subscription `expires_at` и
donation anonymity без raw payload/signature/username;
неизвестный безопасный event записывается как `ignored`. Общий retention worker пакетно удаляет
inbox после server-configured 90 дней. После нового inbox insert положительный payment event сначала
сопоставляется с newest compatible pending/expired checkout, затем planner в той же DB transaction
создаёт одну `entitlement_operations` decision: это durable outbox write без внешнего HTTP call.
Subscription требует Telegram user, event family, exact external item и payment mode; donation
использует bounded user/family/time/amount/currency/mode/period contract выше. Checkout
становится `confirmed` только при полном совпадении, а Home показывает `provisioning` до applied provider operation либо
`attention` при review. Если provider operation уже applied, а связь checkout отсутствует после
прерванного старого delivery path, `GET /api/me/sponsor` повторяет тот же fail-closed match только по
сохранённому authenticated event и восстанавливает связь без Tribute/Remnawave request. Browser
redirect/return не участвует в подтверждении.

Subscription start/renewal вычисляет semantic state из subscription/user/absolute `expires_at`: повтор одного
состояния не добавляет дни, cancellation не трактуется как refund. Recurring donation lifecycle
вычисляется из нормализованных `period` и событий `new_donation`/`recurrent_donation`/
`cancelled_donation`; первый и повторный платежи создают обычные duration grants, а отмена —
идемпотентный resolved audit без provider mutation. Identified donation получает derived SHA-256
fingerprint из нормализованных документированных полей и планируется только после полного
checkout/rule match; anonymous/missing identity или неоднозначный match остаются review.

Текущее billing-состояние generic recurring donation нельзя перепроверить через Creator read API.
Поэтому активный grant от такого платежа имеет отдельный sponsor-state
`recurring_donation_active`: Home подтверждает оплаченный доступ до точной даты и отправляет
пользователя управлять автодонатом в Tribute, но не утверждает, что следующее списание включено.
Поддержка Tribute подтвердила 2026-08-14, что `cancelled_donation` приходит только в конце текущего
оплаченного периода и Creator API не даёт read-state fallback. Поэтому до конца периода UI остаётся
одинаковым и после пользовательской отмены; видимая нейтральная строка заранее объясняет это
ограничение. Period-end cancellation переводит donation сразу в `recurring_expired`/base-access
flow. `recurring_cancelled_active` и обещание известного subscription billing state применяются
только к subscription contract.
Planner требует существующего active Flowvy user, не более одной локальной
Remnawave link, enabled exact rule и active profile, после чего сохраняет immutable rule/profile
snapshots. Нулевая link допустима для первого paid grant; неизвестный Telegram ID по-прежнему не
создаёт local user и не обходит registration/invite policy.

Отдельная lifespan task всегда забирает due rows через `FOR UPDATE SKIP LOCKED`, но не держит DB
transaction во время Remnawave HTTP. Перед mutation она
сверяет live provider/Telegram identity, сохраняет absolute target expiry и применяет version-aware
`PATCH /api/users`. Если link ещё нет, exact Telegram lookup сначала исключает существующий/
неоднозначный provider account, после чего documented `POST /api/users` создаёт первый paid access;
неопределённый create timeout повторно проверяется только чтением, без слепого второго create.
Retry reconciles полный запрошенный profile и target, поэтому не продлевает доступ второй раз.

Перед первым paid mutation `entitlement_baselines` один раз фиксирует restorable registration/base
state: provider identity, полный allow-listed access profile и expiry либо доказанное отсутствие
access. Paid profile становится временным overlay даже поверх lifetime base; duration считается
только от paid sources. После каждого applied grant/refund старая будущая restore-operation
отменяется, а новая ставится на effective paid expiry. В срок она восстанавливает полный base
profile либо переводит созданный только для оплаты account в `DISABLED`. Новая pending paid
operation того же пользователя имеет приоритет над due restore. Refund пересчитывает оставшиеся
uncompensated paid sources и тем же механизмом восстанавливает base. Нереставрируемый provider
status, внешний state conflict или неполная история переводятся в review. Одновременно исполняется
не более одной операции пользователя.

Отдельный подписанный `test_event` ping проходит strict test schema, возвращает `200` и не пишет
inbox; его 64-hex signature contract подтверждён controlled delivery 2026-08-14. Callback URL в UI
намеренно отсутствует. Автоматизацию включает и выключает enabled-состояние конкретного commerce
rule; видимость payment choice независимо управляется published-состоянием sponsor offer.

Home storefront реализован поверх Creator-hosted destinations. Subscription offer до перехода
показывает все period/price из immutable Creator snapshot как нейтральный read-only список
платёжных фактов: provider price является главным значением, а нормализованный billing interval —
вторичной подписью. Flowvy не создаёт локальные названия периодов или отдельных планов и открывает
одну provider-hosted ссылку отдельным CTA. Строки не имитируют локальный выбор, который невозможно
передать Tribute. Admin использует тот же billing presenter; legacy дубли одной subscription
сворачиваются после одной основной preview card, но не удаляются и не объединяются скрыто.
Официальные Creator API и publishing docs на 2026-08-15 не документируют URL-параметр для
предварительного выбора `periodId`, поэтому выбор периода завершается в Tribute. Subscription access
использует absolute `expires_at`, donation — configured donation destination с обязательным
same-account/non-anonymous warning. Если signed donation имеет
recurring `period`, Home связывает active/expired состояние с применённым grant. One-time active
получает `Extend`; active subscription — `Manage in Tribute`; active recurring donation — точную
дату, `Manage auto-donation in Tribute` и provider-timing note. Donation cancellation недоступна как
отдельное paid-period состояние и после period-end event предлагает resume;
pending/provisioning/review блокируют повторную оплату. Admission policy не
обходится: endpoint требует уже существующего active local user. `Check payment status` обновляет
server sponsor state, показывает progress и явный unchanged/error result, а после него invalidates
Home subscription query. Если пользователь вернулся без оплаты, подтверждённое локальное действие
`Choose another option` закрывает только pending redirect intent и сразу возвращает published offers;
one-time active скрывает
pending controls и предлагает `Extend`, который раскрывает все опубликованные donation и
subscription варианты. Сердце является индикатором: accent только при активном sponsor
term, invite count остаётся нейтральным. Все user-facing упоминания приложения берут настроенный
branding app name; Flowvy остаётся фиксированным именем только на административных поверхностях.

Creator webhook не документирует failed-charge/retry event и next-charge state, поэтому storefront
их не угадывает. Он показывает только доказанные Creator facts. Неподдерживаемые подписанные Tribute
events сохраняются как `ignored` audit metadata и не создают checkout match, entitlement operation
или provider mutation. Identified donation автоматизируется только при полном безопасном match;
anonymous donation всегда review-only. Полная state matrix и rollout находятся в
`plans/completed/2026-08-15-tribute-donation-subscription-only.md`.

### Webhooks и Telegram bot

Remnawave webhook доступен только при непустом shared secret. Валидное событие сохраняется в
PostgreSQL и инвалидирует dashboard/Pulse cache по scope/event. Tribute webhook синхронно выполняет
только inbox/ledger writes; Remnawave side effect отделён durable outbox worker. Для обоих
contracts signature, freshness, replay, idempotency, payload size и retention проверяются до/после
сохранения в соответствующей границе.

Aiogram dispatcher обрабатывает только универсальный `/start`: независимо от registration mode и
наличия local user он отправляет один localized Welcome с optional global photo/animation и не
регистрирует пользователя в чате. Строгий `ref_` payload меняет только destination кнопки с
обычного `web_app` на Main Mini App `startapp`; видимый content остаётся тем же. Welcome использует
явный `ParseMode.HTML`, server allow-list Telegram markup/attributes и caption-safe лимит 1 024
видимых символа; при ошибке сохранённого media sender повторяет безопасный text-only вариант.
Custom emoji хранит обязательный fallback emoji и numeric `emoji-id`. Ручной invite code вводится
только в Mini App onboarding. В production Telegram webhook живёт в том же FastAPI process; при
пустом `WEBHOOK_URL` dev-процесс использует polling. Отдельного worker сейчас нет.

## Frontend

`App` собирает `QueryClientProvider`, `AuthGuard`, общий `BackNavigationProvider` и TanStack
`RouterProvider`. Route-aware `ModeProvider` живёт внутри app shell, где доступен router location.

- `lib/api.ts` добавляет Telegram init data и является общим fetch wrapper.
- `hooks/` описывают query/mutation lifecycles и переключаются на debug endpoints в mock mode.
- `components/content/` содержит provider-neutral CommonMark editor/renderer для offer и Mini App
  descriptions, Telegram HTML WYSIWYG с allow-listed serializer и route-specific capability для
  custom emoji, а также reusable collapsed template disclosure/copy control. Persisted
  CommonMark/Telegram HTML не зависит от React editor implementation.
- `/me`, admin settings и Pulse живут в едином TanStack Query cache. Успешная settings mutation
  сразу обновляет settings/user cache, заново проверяет `/me` и сбрасывает
  старый Pulse response при смене provider-конфигурации.
  Решение следует official TanStack Query v5 guidance для
  [mutation response updates](https://tanstack.com/query/latest/docs/framework/react/guides/updates-from-mutation-responses)
  и [related-query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations),
  проверено 2026-08-02.
- `contexts/mode-context.tsx` хранит user/admin presentation mode и синхронизирует его с URL при
  direct navigation и browser Back/Forward.
- `components/` содержит feature и reusable UI; страницы остаются composition boundary.
- `styles/tokens.css` хранит runtime-копию color/effect values из authoritative
  `flowvy_desktop/src/styles/tokens.css`; CSS Modules назначают те же semantic roles, а Telegram
  theme/safe-area интеграция сохраняет Mini App runtime behavior. Единственное принятое локальное
  исключение — общая faux-glass surface floating Header и TabBar. Политика и известный contrast tradeoff зафиксированы в
  [`decisions/0004-desktop-color-parity.md`](decisions/0004-desktop-color-parity.md).
- App shell не вычисляет состояние клавиатуры и не переписывает геометрию из `VisualViewport`.
  Web-owned tab navigation монтируется только на точных top-level tab routes; detail/settings task
  routes используют Telegram BackButton. На primary route стандартный CSS focus contract скрывает
  TabBar и нижний blur, пока `:read-write` control сфокусирован на primary touch interaction
  `(hover: none) and (pointer: coarse)`. После blur Telegram-режим сохраняет hidden state, только
  если SDK `viewportStableHeight` уменьшился относительно focus baseline, и снимает его на следующем
  изменившем высоту stable viewport state. Поэтому открытие не ждёт позднего `viewportChanged`,
  закрытие не показывает navigation в keyboard-sized viewport, desktop fine-pointer не затронут,
  а browser/hardware-keyboard path без уменьшения viewport завершается сразу. Таймеры и
  `VisualViewport` geometry не используются.
- Telegram BackButton сначала передаёт событие верхнему confirmation/editor слою. Если overlay не
  открыт, detail route заменяется явным semantic parent route (`settings/*` → `settings`,
  `users/*` → `users`), поэтому dirty confirmation открывается до изменения browser history.
- `i18n/locales/en.json` — единственный текущий locale resource и источник product-owned UI-copy.
  Frontend статически обнаруживает все `locales/*.json`, выбирает поддерживаемую locale из browser
  languages и отправляет её как `Accept-Language`; добавление `ru.json` автоматически добавит Russian
  в language selectors. Operator-owned identity, welcome и semantic service voice приходят через
  typed branding/settings locale-map contract; public API разрешает только одну locale с
  exact/base/default/English fallback. Bot использует отдельный packaged product catalog и Telegram
  `language_code`. Admin settings получают backend-computed variable capabilities по semantic field,
  поэтому `{{appName}}` и field-specific `{{code}}` не дублируются hardcode в UI; legacy
  `{{app_name}}` продолжает приниматься, но не рекламируется. Provider facts остаются typed runtime
  data. Полная граница описана в
  [`decisions/0002-ui-copy-and-provider-owned-content.md`](decisions/0002-ui-copy-and-provider-owned-content.md).
- Page-level load/auth/forbidden/not-found состояния используют единый `ErrorState`; inline mutation
  errors берут безопасный текст из locale, а raw provider/backend `message` не отображается.

До появления local user `AuthGuard` показывает отдельный onboarding без app navigation. Успешная
mutation сразу кладёт полученного user в общий TanStack Query cache, поэтому вход не требует reload.
Для launch invite frontend получает от backend только boolean о наличии корректного signed
`start_param` и вызывает no-body mutation в open и invite-only mode; сам код из URL/SDK frontend не
читает и не пересылает. Валидный launch invite сохраняет referral attribution до обычной open
registration.

Пользовательские URL: `/`, `/devices`, `/pulse`, `/support`. Support Quick Answers читаются из
отдельных PostgreSQL `support_articles`: authenticated user получает только published resolved locale
по `/api/support/articles`, а active admin создаёт, редактирует, упорядочивает и удаляет typed
localized articles через `/support/manage/answers`. Редактор показывает явный lifecycle:
`draft` публикуется, `published` можно снять с публикации или архивировать, `archived` сначала
восстанавливается в `draft`; повторная публикация неизменённой published статьи не является
действием. Удаление требует destructive confirmation, backend отвечает пустым `204`, после чего
Article UUID окончательно перестаёт разрешаться. До удаления UUID остаётся стабильным deep-link;
topic и status являются структурными enum, title/summary/body — operator-owned CommonMark content
без raw HTML и migration seeds.

Обращения, сообщения и attachment intents хранятся в `support_requests`, `support_messages` и
`support_attachments`. Пользователь видит только собственные обращения; exact active admin из
локальной роли и `ADMIN_TELEGRAM_IDS` видит общую очередь. Обе роли могут Resolve/Reopen, а новый
reply снимает `resolved` и продлевает request expiry на 90 дней от последней активности. Text-only
flow не зависит от object storage. При полной env-конфигурации Cloudflare R2 BFF выдаёт
checksum-bound presigned `PUT` на server-generated opaque key; после upload BFF через signed `HEAD`
сверяет SHA-256, byte size и content type до привязки к сообщению. Bucket остаётся private, download
требует fresh owner/admin authorization и возвращает минутный presigned `GET`. ZIP не извлекается и
не читается. Bounded worker удаляет pending objects, вложения через три дня после текущего Resolve и
все objects до удаления 90-дневной переписки; provider failure сохраняет DB reference для retry.
R2 credentials существуют только в server env, а `/admin/settings/support` показывает read-only
status, limits и connectivity check.

Создание обращения и ответ пользователя после успешного PostgreSQL commit отправляют fixed
product-owned Telegram notification каждому текущему active admin из пересечения локальной роли и
`ADMIN_TELEGRAM_IDS`. Ответ support после commit уведомляет только владельца обращения. Тексты не
настраиваются в Mini App: общий formatted-text contract проецирует CommonMark последнего message в
видимый текст без source-маркеров, после чего Telegram получает HTML-escaped subject, ограниченный
`<blockquote>` preview, request number/topic и только количество attachments. Admin, отвечающий на
собственное обращение через Admin mode, не исключается из owner notification. Filenames, signed URL
и Support context не отправляются. Inline `web_app` кнопки `Open` и `Reply` ведут прямо на
`/support/requests/:id`, где BFF заново проверяет owner/admin authorization. Delivery выполняется
best effort с per-recipient timeout и isolation: сбой Telegram не откатывает уже сохранённый reply и
не мешает другим admins. Manual Resolve/Reopen остаётся silent; reply-driven Reopen использует
обычное reply notification.

Admin Broadcast
сохраняет product-owned `ComingSoon` без provider settings, operator content или external action. Admin URL:
`/admin/dashboard`, `/admin/users`, `/admin/users/search`, `/admin/users/$userId`, `/admin/broadcast`, `/admin/settings` и
отдельные Kuma, Beszel, Tribute, branding, welcome, localized Content и registration/access subroutes.

## Автоматизация разработки

`scripts/bootstrap.ps1` устанавливает locked Python/Node dependencies. Общий `scripts/common.ps1`
выбирает Windows/macOS process, TCP и executable contracts; `dev-up.ps1` и `dev-down.ps1` управляют
локальными процессами и Compose services с проверенными PID/start-time и log artifacts под
`.artifacts/`. `scripts/verify.ps1` выбирает backend, frontend, docs и UI gates по diff либо запускает
полный контур; специализированные scripts проверяют Alembic, Remnawave snapshot/client tests и
локальные Markdown links. Named Tunnel сохраняет один public hostname, но platform-local preview
слушает `80` на Windows и непривилегированный `4173` на macOS.

Frontend имеет Vitest unit seed и Playwright mock state matrix. Browser suite запускает только Vite,
перехватывает каждый `/api/*` request и проверяет critical user/admin routes, роли, ошибки, mutations,
accessibility и visual evidence без Telegram, backend, PostgreSQL, Redis, Remnawave, Kuma, Beszel или Tribute.
Отдельный live-smoke читает настроенный provider через уже запущенный локальный BFF и не входит в CI.

GitHub Actions повторяет locked install, backend lint/tests/migrations с disposable PostgreSQL/Redis
и frontend lint/typecheck/unit/build/Chromium smoke. CI не выполняет deployment.

## Runtime и deployment

В dev PostgreSQL/Redis работают в Compose, а backend/frontend — локальными процессами с reload/HMR.
Vite проксирует `/api` и `/webhook` на `:8001`. Production image, reverse proxy, TLS, secret
management, observability, backup/restore и deployment pipeline в репозитории пока не определены;
имеющийся GitHub workflow является только validation CI.
