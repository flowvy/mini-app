# Детерминированный Tribute digital-product end-to-end fixture

Status: completed
Owner: Codex
Started: 2026-08-14
Updated: 2026-08-14

## Purpose

Добавить воспроизводимый development smoke, который доказывает полный безопасный путь цифрового
товара: подписанный Tribute purchase webhook создаёт одну durable grant operation, повторная
доставка не дублирует доступ, executor применяет абсолютный `expireAt` через fake Remnawave, а
подписанный refund создаёт и один раз применяет compensating operation.

## Current state

- Commit `bfe6706` содержит authenticated Tribute inbox, planner, entitlement ledger, feature-gated
  executor и admin activity journal.
- Официальная документация Tribute, проверенная 2026-08-14:
  `https://wiki.tribute.tg/ru/for-content-creators/digital-product/api-integration`, определяет
  `new_digital_product`, `digital_product_refunded` и требует связывать возврат с покупкой через
  `purchase_id`.
- Текущий локальный Remnawave client поддерживает зафиксированные контракты 2.8.1 и 3.1.0 и пишет
  абсолютный `expireAt`; fixture обязан подменять transport/provider и не обращаться в сеть.

## Scope

Входит:

- один PostgreSQL-backed end-to-end test через реальный webhook route/service/repository/planner;
- fake Remnawave с наблюдаемым absolute-expiry state;
- purchase, exact-body duplicate, executor apply, refund, refund duplicate и compensation apply;
- узкая development-команда smoke, если она может переиспользовать pytest без отдельной логики;
- актуализация testing/integration/project-state документации.

Не входит:

- настоящий Tribute checkout/refund API;
- запросы к реальной Remnawave identity;
- включение `TRIBUTE_ENTITLEMENT_EXECUTION_ENABLED` в runtime;
- operator retry/resolve UI и production rollout.

## Acceptance

- Fixture отправляет валидные HMAC-signed payloads официальной формы через HTTP boundary.
- После duplicate purchase существует ровно один grant и provider update выполнен один раз.
- Grant использует заранее рассчитанный абсолютный target и синхронизирует local subscription.
- Refund по тому же `purchase_id` создаёт ровно одну compensation operation; duplicate refund не
  повторяет provider update; итоговый provider/local expiry равен исходному значению.
- Никакие secret/raw webhook values не попадают в assertions, docs или артефакты.
- Focused smoke и fresh change-aware/full gate проходят.

## Approach

1. Собрать test-only FastAPI app с production Tribute router и Dishka request dependencies,
   PostgreSQL session и fake Remnawave state.
2. Создать active Flowvy user, linked subscription, active access profile и exact digital-product
   commerce rule.
3. Провести purchase/duplicate → executor → refund/duplicate → executor и проверить ledger,
   provider/local expiry и количество provider mutations.
4. Добавить узкий PowerShell smoke wrapper только как thin pytest entry point, без дублирования
   fixture logic.
5. Обновить документацию и выполнить свежие проверки.

## Progress

- [x] 2026-08-14 — официальный Tribute digital-product/refund contract повторно проверен.
- [x] 2026-08-14 — production-boundary fixture и thin development smoke добавлены; focused run
  прошёл 1/1.
- [x] 2026-08-14 — документация обновлена; Changed и Full gates прошли.

## Surprises & Discoveries

- Production FastAPI/Dishka boundary можно безопасно тестировать через отдельный app container,
  общую disposable PostgreSQL fixture и явное закрытие container после HTTP requests; lifespan и
  реальные provider clients для этого не запускаются.

## Decision Log

- 2026-08-14 — fixture использует fake Remnawave и disposable test PostgreSQL. `go дальше` не
  является разрешением на внешнюю provider mutation, а deterministic smoke даёт повторяемое
  доказательство без риска для реального доступа.

## Verification

- `E:\mini-app\backend`: focused pytest для нового fixture → purchase/duplicate/refund chain passed.
- `E:\mini-app`: thin Tribute smoke command → тот же fixture passed.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5197; scripts/verify.ps1 -Scope Changed` → Ruff, 332 service-free
  backend, frontend lint/typecheck, 37 unit, production build и docs passed.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5198; scripts/verify.ps1 -Scope Full` → migrations/drift,
  403 backend, 55 Remnawave contract, Ruff, frontend lint/typecheck, 37 unit, production build,
  71 browser scenarios и docs passed.

## Recovery and rollback

Fixture работает только с общей disposable test database и fake provider. Он не меняет runtime
configuration. Откат — удалить test/wrapper и связанные документальные утверждения; provider/data
recovery не требуется.

## Outcomes & Retrospective

Детерминированный smoke теперь доказывает весь automatic digital-product path на HTTP/transaction/
executor границах без внешней сети. Он переиспользует production route и services, а thin script не
дублирует бизнес-логику. Runtime executor остался выключенным; live purchase/refund и operator
retry/resolve flow остаются отдельными явно управляемыми этапами.
