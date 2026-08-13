# Защищённый Tribute webhook inbox без выдачи доступа

Status: completed
Owner: Codex
Started: 2026-08-14
Updated: 2026-08-14

## Purpose

Flowvy принимает и аутентифицирует Tribute webhook, атомарно подавляет повторные доставки и хранит
минимальное нормализованное событие для будущего reconciliation. Новый endpoint работает строго в
observe-only режиме: ни commerce rule, ни пользователь, ни Remnawave не изменяются.

## Current state

Коммит `b63a6ba` содержит server-only `TRIBUTE_API_KEY`, fixed-origin read-only API check и
provider-neutral `commerce_rules` с CRUD/preview. Executor отсутствует. UI намеренно не показывает
callback URL. Старый внешний receiver остаётся вне Flowvy и не меняется этой задачей.

Официальный Tribute webhook contract, проверенный 2026-08-14:

- https://wiki.tribute.tg/ru/api-dokumentaciya/vebkhuki.md — `trbt-signature`, HMAC-SHA256 от raw
  body, envelope `name/created_at/sent_at/payload`, exponential retries примерно 24 часа:
  5m/15m/30m/1h/2h/4h/8h/8h;
- https://wiki.tribute.tg/ru/for-content-creators/digital-product/api-integration —
  `telegram_user_id`, `purchase_id`, `transaction_id`, product/refund examples и обязанность
  идемпотентной обработки.

Документация не фиксирует encoding подписи, отдельный timestamp header или универсальный event ID.
Это неизвестное нельзя маскировать предположением при включении side effects.

## Scope

Входит отдельный публичный FastAPI route, raw-body authentication/limits, strict envelope,
freshness/sanity, нормализация поддерживаемых commerce events, PostgreSQL inbox, atomic exact-delivery
dedupe, retention-ready timestamps, миграция, deterministic HTTP/repository tests и документация.

Не входят entitlement executor, rule matching, создание пользователя, Remnawave mutation, checkout,
refund API call, admin event journal, публикация callback URL и изменение текущего Tribute webhook.

## Acceptance

- Endpoint fail-closed при отсутствии key/signature, использует constant-time HMAC comparison и не
  парсит/не логирует raw payload до успешной подписи.
- Oversized, malformed, stale/future и schema-invalid requests получают стабильные безопасные
  ответы; неизвестные поля не становятся доверенными автоматически.
- Повтор идентичного signed body создаёт одну durable запись и возвращает успешный idempotent ответ;
  конкурентный duplicate подавляется уникальным DB constraint.
- Inbox не хранит raw body, signature или username и не вызывает commerce/access/provider services.
- Fresh migration verification, focused/full backend tests, Ruff и repository gate проходят.

## Approach

1. Проследить существующий Remnawave webhook route/service/repository/model/migration/test flow и
   переиспользовать его проверенные primitives только там, где контракты совпадают.
2. Ввести Tribute envelope schemas и verifier/normalizer. Exact raw-body SHA-256 будет delivery
   identity fallback; provider transaction/purchase identifiers сохраняются отдельно для будущего
   semantic reconciliation, но не включают executor.
3. Добавить `tribute_webhook_events` и repository insert-on-conflict внутри request transaction.
4. Зарегистрировать route без UI callback, покрыть auth/size/schema/time/replay/concurrency и
   отсутствие side effects.
5. Выполнить миграционные/backend/repository проверки и обновить постоянные документы следующими
   точными этапами executor.

## Progress

- [x] 2026-08-14 01:43 +03:00 — завершённый admin/rule-builder slice и граница observe-only
  receiver зафиксированы в `PROJECT_STATE`, `INTEGRATIONS` и `SECURITY` до изменения кода.
- [x] 2026-08-14 01:47 +03:00 — исследован локальный webhook persistence/security pattern;
  вынесены общие bounded-body и HMAC/SHA-256 primitives без смешения provider contracts.
- [x] 2026-08-14 01:53 +03:00 — реализованы route, verifier, strict envelope, normalizer и dedicated
  inbox model/repository/service без commerce/user/Remnawave dependencies.
- [x] 2026-08-14 01:57 +03:00 — добавлена обратимая миграция, HTTP failure/replay tests,
  конкурентный PostgreSQL duplicate и bounded retention coverage.
- [x] 2026-08-14 02:05 +03:00 — focused/migration/full backend gates и итоговый Full repository
  gate зелёные; постоянная документация обновлена, план перенесён в completed.

## Surprises & Discoveries

- Tribute подписывает raw body тем же API key и документирует retries примерно 24 часа, но не публикует
  универсальный event ID или отдельный timestamp header.
- После реализации оператор подтвердил наличие штатного действия отправки тестового webhook-
  запроса в интерфейсе Tribute. Оно позволяет проверить ingress без платежа; его payload/signature
  остаются неизвестными до фактической контролируемой доставки.
- Официальный OpenAPI endpoint `https://tribute.tg/api/v1/openapi/ru` дважды не отдал полный
  83-KiB document за 60/120 секунд (получено 21 839 bytes). Реализация не должна делать неизвестные
  payload-поля обязательными или считать их достаточными для entitlement execution.
- Существующий Remnawave receiver дал переиспользуемые primitives для ограниченного чтения body и
  constant-time HMAC, но Tribute не имеет отдельного timestamp header и не должен разделять с ним
  persistence/service graph.

## Decision Log

- 2026-08-14 — receiver остаётся observe-only; exact body hash безопасно подавляет одинаковые
  deliveries, но недостаточен как основание для необратимого entitlement side effect.
- 2026-08-14 — callback URL и переключение Tribute не входят в slice, поэтому действующий внешний
  webhook остаётся без изменений.
- 2026-08-14 — default ingress limits: 64 KiB body, 25 часов max age для документированного
  примерно 24-часового retry schedule, 5 минут future tolerance и 90 дней retention.
- 2026-08-14 — verifier принимает 64-символьный hexadecimal HMAC-SHA256 digest, но это не считается
  live-совместимостью: официальная документация не фиксирует encoding, поэтому callback остаётся
  скрыт до controlled delivery или официального уточнения.
- 2026-08-14 — неизвестный syntactically safe event сохраняется со статусом `ignored`; exact-body
  SHA-256 подавляет только идентичные deliveries и не заменяет semantic entitlement ledger.

## Verification

- `E:\mini-app\backend`: `uv run ruff format --check .` — 153 files formatted;
  `uv run ruff check .` — passed; focused webhook/repository suite — 50 passed; полный suite
  затем повторён итоговым repository gate.
- `E:\mini-app`: `scripts\verify-migrations.ps1` — one head, zero/previous-head upgrade,
  downgrade/re-upgrade и model drift passed; `PLAYWRIGHT_PORT=5321;
  scripts\verify.ps1 -Scope Full` — 376 backend, 53 Remnawave contract, Ruff, 37 frontend unit,
  lint/typecheck/build, 69 mobile Chromium E2E и docs passed.
- Реальный Tribute/Telegram/Remnawave не вызывается; подписи строятся локальными fixtures.

## Recovery and rollback

До публикации callback входящих production deliveries нет. Миграция должна иметь безопасный
downgrade, удаляющий только новую пустую/observe-only таблицу. Route/model/service удаляются без
изменения существующих commerce rules или access state.

## Outcomes & Retrospective

Observe-only ingress доказан локальными HMAC fixtures и disposable PostgreSQL без обращения к
реальному Tribute. Минимальная запись, exact/concurrent replay, strict transport/schema/time
failure paths и retention покрыты. Архитектурная граница сохранена: receiver не читает правила и
не выдаёт доступ. До активации остаётся контролируемо подтвердить encoding подписи и реальные
payload shapes, затем отдельным планом реализовать semantic ledger/executor.
