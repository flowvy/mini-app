# Надёжный MVP и проверенные внешние границы

Status: completed
Owner: Codex
Started: 2026-08-02
Updated: 2026-08-02

## Purpose

Закрыть известные P1-риски Flowvy так, чтобы webhook и server-side интеграции нельзя было безопасно
обойти повтором или подменой адреса, ошибки провайдеров не ломали пользовательские ответы, загрузки
не принимали файл целиком до проверки лимита, а основные состояния интерфейса имели воспроизводимое
browser-доказательство. После локальных тестов безопасно проверить доступные реальные интеграции из
локальной конфигурации без публикации секретов и без изменяющих внешнее состояние вызовов.

## Current state

- P0 auth/admin/device/Telegram webhook границы закрыты и прошли полный локальный gate 2026-08-01.
- Remnawave webhook проверяет HMAC, но повторно обрабатывает тот же payload, хранит raw payload без
  срока хранения и записывает aware timestamp в колонку без timezone.
- Kuma target не защищён от SSRF, media upload проверяет размер после полного чтения.
- Pulse и некоторые Remnawave/provider error ветки не совпадают с сохранённым контрактом.
- Playwright покрывает несколько success/placeholder сценариев, но не полную error/mutation/permission
  матрицу. Удалённый CI и реальные Telegram/Remnawave/Kuma ещё не подтверждены.
- Пользователь разрешил читать локальные `.env` и выполнять проектные работы; секреты и реальные
  идентификаторы не должны попадать в вывод, документы, тестовые артефакты или Git.

## Scope

Входит: Remnawave webhook, его модель/миграция/retention; Kuma URL validation; streaming media limit;
provider/Pulse parsing и error mapping; metrics/readiness только если они логически независимы и
могут быть закрыты без расширения продукта; UI state coverage; безопасные read-only live probes;
документация и полный локальный gate.

Не входит: production deployment, отправка broadcast реальным пользователям, изменяющие Remnawave
операции, удаление устройств, запись настроек в реальный Kuma, ротация секретов и публикация PR без
отдельной необходимости. Support/Broadcast feature implementation оценивается отдельно после
надёжности существующих потоков, потому что продуктовый контракт для них не зафиксирован.

## Acceptance

- Повтор, просроченное/некорректное событие и неверная подпись Remnawave не приводят к обработке;
  сохранённые данные минимальны, timezone корректен, retention имеет исполняемый путь.
- Kuma target по умолчанию не может указывать на loopback/private/link-local/metadata или делать
  redirect; явно разрешённый dev target проверяется точным allow-list правилом.
- Media upload прекращается при превышении лимита, не удерживая произвольный файл целиком в памяти.
- Pulse и Remnawave response/error варианты зафиксированы детерминированными contract tests и дают
  безопасные HTTP/UI состояния.
- Изменённые UI состояния проходят lint, typecheck, unit/build и Playwright на обязательных проектах
  без console/network/axe ошибок; визуальная проверка приложена там, где меняется отображение.
- Каждый этап имеет свежий focused test и соответствующий полный gate; финальный `Full` gate зелёный.
- Реальные интеграции проверены только безопасными read-only probes либо явно отмечены как
  непроверенные с точной причиной. Ни один секрет не выведен и не сохранён в Git.

## Approach

1. Изолированно исследовать официальный Remnawave webhook contract и локальный snapshot, затем
   реализовать freshness/replay/idempotency/redaction/retention и линейную Alembic migration. Закрыть
   focused webhook tests, полный backend suite, migration verifier и Remnawave contract gate.
2. Отдельно закрыть server-side boundary Kuma, затем streaming upload и provider/Pulse contracts.
   После каждой границы запустить её focused tests; после этапа — полный backend suite.
3. Исправить middleware/readiness и другие оставшиеся P1 backend факты, если исследование подтвердит
   текущий дефект. Завершить backend full/migration/contract gates.
4. Построить недостающую UI state matrix для затронутых потоков, добавить deterministic fixtures и
   browser scenarios. Пройти frontend gates, все Playwright projects и ручную визуальную проверку.
5. Прочитать локальную конфигурацию с redaction, определить точные dev targets и выполнить только
   read-only health/contract probes. Проверить доступность удалённого CI без публикации изменений.
6. Выполнить финальный full gate, обновить canonical docs и перенести этот план в `plans/completed/`.

## Progress

- [x] 2026-08-02 00:29 +03:00 — с явного разрешения восстановлен
  `frontend/src/components/ui/action-btn.module.css`, удалён `RADIUS_AUDIT.md`; оба пути чисты в Git.
- [x] 2026-08-02 00:44 +03:00 — Remnawave webhook сверён с official docs/tag 2.7.4;
  freshness/header equality/size/replay, raw-data removal, timezone migration и bounded retention
  реализованы. Focused 29 service-free + 3 PostgreSQL tests, full 106 pytest, previous-head
  migration/downgrade/re-upgrade/drift и 8 client contract tests пройдены.
- [x] 2026-08-02 — Kuma/Pulse boundary закрыта по official 2.3.2 и совместимому 1.23.16 contract:
  DNS validation+pinning, exact private-origin allow-list, no redirects/proxies, streaming response
  limit, typed parser, safe errors/cache и fail-safe overall status. 56 focused и 136 service-free
  backend tests прошли; live версия панели пока неизвестна.
- [x] 2026-08-02 — welcome-media валидируется до Telegram и streaming-передаётся из исходного
  spooled upload без второго полного buffer; filename/errors безопасны. Remnawave email array,
  encoded path segments, transport/envelope errors и allow-listed dashboard projections закрыты.
  11 media + 23 provider/dashboard focused tests и полный backend suite 185/185 прошли.
- [x] 2026-08-02 — Metrics больше не читает ещё не установленный request container, Redis failure
  best-effort, daily keys имеют TTL; last-seen staging crash/concurrency-safe. Добавлен `/api/ready`,
  dev-up ждёт PostgreSQL+Redis. 13 focused и полный backend suite 197/197 прошли.
- [x] 2026-08-02 — UI state matrix расширена до 52 сценариев на четырёх проектах: auth/role,
  subscription, devices mutations, Pulse, dashboard/users/settings, keyboard focus, axe, overflow и
  visual evidence. `pnpm verify` и `pnpm test:e2e:all` прошли.
- [x] 2026-08-02 — dev-up запущен с явной Compose DB и без реального Telegram. Read-only Remnawave
  2.8.1 probes и live browser smoke прошли; HWID `userId` compatibility добавлена. Kuma target в
  локальной БД отсутствует, Telegram test flow не запускался. Safe Quick Tunnel и полный локальный
  gate прошли; remote CI остаётся внешним follow-up.

## Surprises & Discoveries

- Provider не присылает event/delivery ID. Official tag 2.7.4 повторно отправляет один и тот же
  сериализованный job payload, поэтому SHA-256 signed raw body является устойчивым dedup key.
- Local OpenAPI описывает envelope и body timestamp, но не delivery headers. Headers и равенство
  header/body подтверждены отдельно official docs и source tag 2.7.4.
- Legacy webhook `data` содержит protocol credentials и subscription URL, хотя текущим handlers оно
  не нужно; безопаснее удалить колонку и миграцией очистить уже сохранённое содержимое.
- Uptime Kuma 2.3.2 возвращает `incidents: []`, а 1.23.16 — `incident: object | null`; прежний
  `incident.list` не соответствовал ни одной ветке. Один down monitor ранее всегда давал `partial`,
  поэтому состояние all-down было недостижимо.
- Remnawave 2.7.4 email lookup намеренно non-unique и возвращает array, тогда как Flowvy ожидал
  object. Dotted username также ошибочно классифицировался как email до исправления dispatch.
- Starlette применяет `MetricsMiddleware` снаружи добавленного раньше Dishka middleware, поэтому
  request state до `call_next` действительно не содержит request container. APP-scope Redis теперь
  публикуется lifespan-ом явно, а middleware не участвует в readiness до завершения startup.
- Process-level `DATABASE_URL` в Codex session перекрывал `backend/.env` и указывал не на Flowvy.
  `dev-up.ps1` теперь всегда передаёт child-процессу точные Compose PostgreSQL/Redis URLs и
  восстанавливает окружение вызывающей сессии.
- Порт 8000 занят сторонним JONSBO monitor; фактический Flowvy backend штатно слушает 8001.
- Remnawave 2.8.1 заменил `userUuid` на числовой `userId` в HWID response, хотя delete commands всё
  ещё принимают UUID. Flowvy поддерживает оба response contract и сохраняет fail-closed ownership.

## Decision Log

- 2026-08-02 — работа разбита по внешним границам, а не по слоям приложения: это позволяет после
  каждого этапа получить законченное проверяемое свойство и не смешивать Remnawave и Kuma контракты.
- 2026-08-02 — `.env` разрешено читать, но все диагностические команды выводят только наличие,
  тип target и redacted metadata. Карт-бланш не используется для внешних изменяющих операций без
  точного продуктового target.
- 2026-08-02 — replay identity равен SHA-256 exact raw body, потому что официальный контракт не даёт
  event ID, а Remnawave retry использует сохранённую сериализованную строку. Unique constraint и
  PostgreSQL `ON CONFLICT DO NOTHING` закрывают concurrent race.
- 2026-08-02 — raw `data` не редактируется по blacklist, а полностью не сохраняется: текущим cache
  handlers нужны только scope/event, а allow-list хранения надёжнее при расширении provider schema.
- 2026-08-02 — naive timestamps в legacy `webhook_events` при миграции интерпретируются как UTC:
  provider 2.7.4 создаёт UTC ISO timestamps, а проект до production не развёрнут. Удалённые raw data
  намеренно не восстанавливаются downgrade и могут оставаться только в будущих backup/WAL policy.
- 2026-08-02 — private Kuma доступ разрешается только operator-controlled exact origin, а не host,
  wildcard или CIDR. Проверка выполняется на каждом request, соединение pin-ится к проверенному IP,
  исходный hostname сохраняется только в Host/SNI; HTTPX proxy environment и keep-alive отключены.
- 2026-08-02 — общий media limit оставлен 10 MiB: он соответствует текущему Telegram sendPhoto и
  консервативнее sendAnimation. Проверяется фактический spooled stream до provider side effect;
  aiogram затем читает тот же объект chunks, поэтому полный bytes buffer удалён.
- 2026-08-02 — health разделён: liveness никогда не зависит от внешних сервисов, readiness проверяет
  только обязательные PostgreSQL/Redis. Provider availability остаётся degraded feature state, а не
  причиной вынимать весь BFF из балансировки.
- 2026-08-02 — локальный dev-up по умолчанию очищает Telegram token/webhook variables только для
  child-процессов. Реальный bot допускается лишь явным `-EnableTelegram`; live-smoke остаётся
  read-only и отдельным от детерминированного CI suite.

## Verification

- `E:\mini-app\backend`: focused `uv run --frozen pytest -q <tests>` после каждой backend границы.
- `E:\mini-app`: `powershell -ExecutionPolicy Bypass -File scripts/verify-migrations.ps1` после schema.
- `E:\mini-app`: `powershell -ExecutionPolicy Bypass -File scripts/verify-contracts.ps1` после
  Remnawave/provider contract изменений.
- `E:\mini-app`: `powershell -ExecutionPolicy Bypass -File scripts/verify.ps1 -Scope Full` перед
  завершением; ожидается нулевой exit code всех выбранных gates.
- `E:\mini-app\frontend`: `pnpm test:e2e:all` для полной browser матрицы; ручная проверка маршрутов,
  ролей и viewports из `flowvy-ui-verify` state matrix.

## Recovery and rollback

Каждая schema migration имеет downgrade и сначала проверяется на disposable PostgreSQL. Реальная
локальная БД не мигрируется до вывода redacted target и подтверждения, что это dev instance. Изменения
внешних систем в live probes запрещены; поэтому recovery для них не требуется. Кодовые этапы можно
откатывать отдельными точными patch по границе без затрагивания остальных пользовательских файлов.

## Outcomes & Retrospective

P1 security/reliability границы, UI state matrix, Remnawave 2.8.1 compatibility, живой read-only BFF
и безопасный Quick Tunnel подтверждены. Финальные результаты: 202 backend tests, 9 frontend unit,
52 browser scenarios, production build, migrations/contracts/docs и tunnel status matrix. Не
подтверждены только внешние контуры, которых нет в локальной конфигурации: Kuma URL/slug, отдельный
Telegram test bot и первый remote GitHub CI run.
