# Идемпотентный Tribute entitlement ledger и операторский журнал

Status: completed
Owner: Codex
Started: 2026-08-14
Updated: 2026-08-14

## Purpose

После завершения Flowvy сможет безопасно преобразовать документированную покупку цифрового товара
Tribute в долговечное решение о выдаче доступа, не повторяя grant при повторной доставке webhook.
Администратор увидит журнал обработки, сопоставленного пользователя, правило, рассчитанный срок,
результат и безопасную причину остановки. Недостаточно определённые события донатов и подписок не
получат access side effect и будут явно отмечены как требующие подтверждённого semantic identity.

## Current state

- `POST /api/webhooks/tribute` проверяет HMAC над raw body, размер, strict envelope, freshness и
  exact-body replay, затем хранит только нормализованные metadata в `tribute_webhook_events`.
- `commerce_rules` и backend preview уже описывают provider-neutral match, fixed/volume calculator,
  active access profile и extend/replace, но не исполняются.
- Локальная identity пользователя — Telegram ID. Локальная `subscriptions` связывает её с
  Remnawave numeric ID и optional legacy UUID.
- Remnawave client поддерживает обнаруженные 2.x/3.x поколения, но пока не имеет typed update-user
  операции для абсолютного `expireAt`.
- Официальный Tribute OpenAPI 1.0.0, проверенный 2026-08-14 по
  `https://tribute.tg/api/v1/openapi/ru`, прямо называет `new_digital_product.payload.purchase_id`
  уникальным ID покупки и ключом идемпотентности. `digital_product_refunded.purchase_id` ссылается
  на исходную покупку. Для subscription доступны `subscription_id`, `period_id`, `expires_at`, но
  документация не утверждает уникальность отдельного платежа; для donations есть только
  `donation_request_id`, который назван ID запроса на донат, а не транзакции.
- Официальная страница Tribute webhook, проверенная 2026-08-14 по Markdown endpoint,
  документирует HMAC-SHA256 и повторы примерно 24 часа: 5m, 15m, 30m, 1h, 2h, 4h, 8h, 8h.
- PostgreSQL 16 `SELECT FOR UPDATE` блокирует конкурирующих писателей одной строки до завершения
  транзакции; SQLAlchemy pinned 2.0.48 предоставляет `with_for_update()` через Core/ORM select.
- Remnawave tags `2.8.1` и `3.1.0`, проверенные в официальном GitHub repository 2026-08-14,
  принимают `PATCH /api/users`: 2.8.1 идентифицирует пользователя `uuid`, 3.1.0 — numeric `id`;
  обе версии принимают абсолютный будущий `expireAt`.
- W3C WAI forms guidance, проверенный 2026-08-14, требует ясного текстового feedback,
  программной связи ошибок с контекстом и доступного объявления динамического результата.

## Scope

Входит:

- строгие schemas для документированных Tribute event families без сохранения raw payload;
- append-only entitlement ledger с уникальным provider semantic key, rule/profile snapshots,
  исходной и целевой абсолютной expiry, статусами и безопасным operator reason;
- автоматический plan/execution только для `new_digital_product`, когда `purchase_id`, Telegram
  identity, enabled rule, active profile и существующий Remnawave user однозначны;
- компенсация `digital_product_refunded`, привязанная к исходному `purchase_id`, с пересчётом
  целевой expiry из ledger вместо слепого вычитания от текущей даты;
- durable outbox/retry boundary для Remnawave update и reconciliation после неопределённого timeout;
- admin-only read API и журнал на существующей Tribute Settings page с loading/empty/error/status
  states, локализованным copy и responsive/light/dark проверкой;
- deterministic backend, migration, frontend и Playwright tests; документация.

Не входит:

- автоматический access side effect для donations/subscriptions до появления официального
  уникального ID каждого оплаченного периода или контролируемого production fixture;
- email/anonymous identity linking, создание нового Flowvy/Remnawave пользователя из webhook;
- checkout, provider refund mutation, ручной retry/override и публикация callback URL в UI;
- любые реальные платежи или автоматические вызовы production-like provider в тестах.

## Acceptance

- Повтор и конкурентная обработка одного `purchase_id` создают одну ledger operation и не могут
  применить доступ дважды.
- Неизвестный/неактивный пользователь, отсутствующая subscription/provider identity, отсутствие
  подходящего enabled rule/profile и неподдержанная event family не изменяют доступ и имеют
  различимый безопасный статус в admin journal.
- Применение сохраняет rule/profile snapshot и вычисляет absolute target expiry под сериализующим
  lock; provider получает только documented version-specific identity и absolute future expiry.
- Timeout/error не помечает операцию выполненной; worker может безопасно reconcile/retry без
  повторного увеличения срока.
- Refund находит исходную покупку по `purchase_id`, один раз создаёт compensating entry и не
  повреждает более поздние независимые grants.
- Admin journal доступен только текущему active admin, не возвращает username/email/raw payload,
  signature/API key и объясняет состояния понятным текстом.
- Fresh focused/full checks, zero-to-head/upgrade/downgrade/model-drift и affected-route UI gates
  проходят.

## Approach

1. Зафиксировать provider event contracts и semantic-key matrix в typed schemas/tests.
2. Добавить линейную Alembic migration и ORM для ledger/outbox, включая unique constraints и
   ограниченный набор статусов.
3. В одной DB transaction после authenticated inbox insert построить immutable plan. Для событий,
   у которых нет доказанного semantic key, записать review-only ledger entry без side effect.
4. Worker забирает pending outbox строку через `FOR UPDATE SKIP LOCKED`, читает актуального
   Remnawave пользователя, отправляет абсолютный `expireAt`, затем повторно читает и фиксирует
   applied только при совпадении. Все locks берутся в одинаковом порядке; network I/O не держит
   user/ledger row lock.
5. Refund создаёт compensating operation по исходной покупке и пересчитывает желаемое состояние из
   non-refunded applied contributions; неоднозначность останавливается в review, а не угадывается.
6. Admin API отдаёт allow-listed view model с cursor/limit. Tribute UI переиспользует
   `SettingsPanel`, status/badge/feedback primitives и показывает компактный activity list.
7. Проверить failure matrix и обновить постоянные документы. После полного завершения перенести
   план в `plans/completed/`.

## Progress

- [x] 2026-08-14 02:36 +03:00 — проверены исходный git state, AGENTS, PLANS, project state,
  architecture, текущие webhook/commerce/access flows и pinned stack versions.
- [x] 2026-08-14 02:36 +03:00 — проверены Tribute OpenAPI 1.0.0, webhook Markdown и официальные
  Remnawave 2.8.1/3.1.0 update contracts; выявлена безопасная semantic-key граница.
- [x] 2026-08-14 03:15 +03:00 — добавлены typed provider schemas, ledger/outbox model и обратимая
  migration; disposable one-head/upgrade/downgrade/re-upgrade/drift gate прошёл.
- [x] 2026-08-14 03:15 +03:00 — реализованы planner, feature-gated worker,
  absolute-target reconciliation и refund replay; focused concurrency/failure tests прошли.
- [x] 2026-08-14 03:15 +03:00 — добавлены admin-only allow-listed journal API и Tribute Settings
  activity UI; loading/empty/error/retry/applied/review, Axe и overflow покрыты Playwright.
- [x] 2026-08-14 03:32 +03:00 — документация обновлена; fresh Full gate и affected all-project UI
  matrix прошли, evidence просмотрены, план закрыт.

## Surprises & Discoveries

- Поисковый индекс Tribute показывал укороченный retry schedule до 10 часов, но официальный
  `.md` endpoint страницы содержит текущий график примерно на 24 часа. Источником истины выбран
  непосредственно Markdown страницы.
- `purchase_id` документирован как idempotency identity только для digital products. Поля donation
  и subscription недостаточны, чтобы без догадки отличить provider retry от нового платежа.
- Tribute cancellation events не являются refund contract: отмена subscription/donation не даёт
  оснований отзывать уже оплаченный доступ. Они остаются audit-only до отдельной продуктовой
  политики и доказанного event identity.
- Applied refund более поздней покупки должен исключать её grant из последующего replay. Иначе
  возврат более ранней покупки повторно сохранил бы уже компенсированный вклад. Repository теперь
  выбирает только grants без applied refund child; отдельный regression проверяет этот порядок.
- Один partial unique processing index останавливает конфликт, но сам по себе не превращает
  simultaneous claim в штатный `no work`: проигравшая transaction получила бы `IntegrityError`.
  Claim теперь сначала берёт namespaced transaction advisory lock пользователя и повторно проверяет
  processing state; partial index остаётся последним DB guard.

## Decision Log

- 2026-08-14 — auto-execution разрешён только для digital-product purchase/refund; альтернативу
  хэшировать весь payload для donations/subscriptions отклонено, потому что exact-body dedupe не
  является semantic idempotency между разными доставками одного платежа.
- 2026-08-14 — целевое состояние provider хранится как absolute expiry и применяется через durable
  outbox/reconciliation; прямой provider call в webhook transaction отклонён из-за невозможности
  атомарно связать PostgreSQL commit и HTTP side effect.
- 2026-08-14 — неизвестная Telegram identity не создаётся автоматически: платёжный webhook не
  является доказательством согласия на регистрацию и не должен обходить registration policy.
- 2026-08-14 — executor доступен только через server-only feature gate с default `false`; Mini App
  показывает фактический read-only state, но не включает provider mutations.

## Verification

- `E:\mini-app\backend`: focused webhook/executor suite → 43 passed; commerce/provider/planner/
  executor/Remnawave selection → 59 passed; executor concurrency suite → 8 passed, включая
  одновременный claim двух операций одного пользователя без нарушения partial unique guard.
- `E:\mini-app`: `powershell -ExecutionPolicy Bypass -File scripts/verify-migrations.ps1` → один
  head, zero/previous-head upgrade, downgrade/re-upgrade и model drift прошли.
- `E:\mini-app\frontend`: lint/typecheck, 37 unit tests и production build прошли.
- `E:\mini-app\frontend`: Tribute all-project matrix → 52/52 на 430x932 Chromium, 320x568
  Chromium, iPhone/WebKit и desktop Chromium; loading/empty/populated/error/retry, Axe, overflow,
  console/network guards прошли. Mobile dark и desktop light activity evidence просмотрены.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5196; powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
  -Scope Full` → migrations/drift, 402 backend, 55 Remnawave contract, Ruff, frontend
  lint/typecheck/37 unit/build, 71 mobile browser и docs прошли.

## Recovery and rollback

Миграция имеет downgrade, который удаляет только новые ledger/outbox таблицы и добавленные inbox
columns. До provider execution feature gate остаётся выключенным по умолчанию; при сбое worker
останавливается без удаления записей, а pending/uncertain operations сохраняются для reconciliation.
Повторный запуск использует unique semantic key и absolute target, поэтому не увеличивает срок ещё
раз. Никакие rollback-команды не направляются на inferred или production-like database.

## Outcomes & Retrospective

Digital-product purchase/refund получили semantic idempotency по официальному `purchase_id`,
durable plan/outbox, absolute-target reconciliation и безопасную компенсацию без слепого вычитания.
Donation/subscription/cancellation остаются видимыми review-only decisions, а не скрыто
проигнорированными либо автоматически исполненными событиями. Admin видит allow-listed activity
journal и фактический `Planning only` state. Provider worker реализован, но server gate остаётся
выключенным по умолчанию и не проверялся live mutation.

Следующая сессия должна начинаться не с расширения event guesses, а с одного controlled
digital-product end-to-end fixture на отдельной provider identity. После него нужны operator
retry/resolve, metrics/alerts и production rollout/rollback. Donation/subscription auto-delivery
разрешается только после нового официального unique payment contract.
