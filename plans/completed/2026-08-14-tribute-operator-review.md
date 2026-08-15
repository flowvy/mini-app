# Аудируемый operator retry/resolve flow для Tribute

Status: completed
Owner: Codex
Started: 2026-08-14
Updated: 2026-08-14

## Purpose

Дать администратору безопасный способ обработать `Needs review` operation: поставить только
доказанно transient provider failure в очередь ещё одной попытки либо завершить review без
изменения доступа с обязательной причиной. Каждое действие должно оставлять append-only audit
record и быть идемпотентным при повторе HTTP-запроса.

## Current state

- Commit `bfe6706` добавил durable entitlement ledger/executor и сквозную provider fixture.
- Activity journal сейчас read-only и показывает allow-listed status/reason, но не даёт оператору
  закрыть очередь.
- Executor выключен по умолчанию; `review` никогда не исполняется автоматически.
- `entitlement_operations.operator_note` существует, но не даёт отдельного неизменяемого audit
  trail, actor identity или idempotency key и потому не будет единственным источником действий.

## Authoritative guidance

- PostgreSQL current `SELECT ... FOR UPDATE` блокирует конкурентные изменения строки до конца
  transaction: `https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS`.
- OWASP Logging Cheat Sheet требует отдельного хронологического audit trail, достаточного для
  восстановления последовательности attributable transactions:
  `https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html`.
- W3C WAI G199 рекомендует явно и последовательно сообщать результат submit/mutation через status
  feedback: `https://www.w3.org/WAI/WCAG21/Techniques/general/G199`.
- WAI-ARIA Authoring Practices для modal dialog требует удерживать focus внутри и возвращать его к
  trigger после закрытия: `https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/`.

## Scope

Входит:

- append-only `entitlement_operation_actions` с actor, request UUID, previous state, action, note и
  timestamp;
- новый terminal status `resolved`, отличающий операторское завершение от provider cancellation;
- атомарный admin endpoint для `retry`/`resolve` с row lock и request-id idempotency;
- server-computed `availableActions` и allow-listed last action в journal response;
- reuse `SettingsStatusRow`, `ActionBtn`, `ConfirmDialog`, `FormFieldTextarea`, `InlineFeedback`;
- action success/error, confirm/cancel, required note, focus return, loading, no-overflow и mock API
  coverage;
- migration, backend/frontend/docs verification.

Не входит:

- ручное изменение срока/профиля/Telegram identity;
- retry для identity mismatch, provider rejection, state conflict или неподтверждённых
  donation/subscription semantics;
- включение runtime executor или live provider call;
- bulk actions, alerts/metrics и production rollout.

## Acceptance

- Только `review/provider_unavailable` предлагает `retry`; любой `review` можно `resolve` без access
  mutation. Eligibility вычисляет backend.
- `resolve` требует 1–500 символов operator note; `retry` не принимает скрытую произвольную note.
- Повтор того же request UUID возвращает тот же результат и не создаёт второй action; конкурентное
  другое действие видит актуальный locked state и получает conflict.
- Audit row сохраняет actor и previous status/reason, но API не раскрывает provider payload,
  transaction ID или snapshots.
- UI явно подтверждает результат, сохраняет dialog при ошибке, блокирует повторный submit во время
  mutation и возвращает focus после закрытия.
- Миграции, focused backend, frontend, Playwright affected matrix и fresh Full gate проходят.

## Approach

1. Добавить линейную Alembic migration, ORM model/repository и typed action contracts.
2. Расширить entitlement service атомарным action state machine и idempotent request handling.
3. Добавить admin/debug routes и contract/concurrency tests.
4. Расширить journal UI существующими design-system components и deterministic Playwright states.
5. Обновить постоянную документацию, проверить visual evidence и закрыть план.

## Progress

- [x] 2026-08-14 — текущий flow и authoritative PostgreSQL/OWASP/W3C guidance изучены.
- [x] 2026-08-14 — migration/backend state machine реализованы и покрыты.
- [x] 2026-08-14 — admin UX и deterministic browser states реализованы и просмотрены.
- [x] 2026-08-14 — docs и свежие gates завершены.

## Surprises & Discoveries

- Общий locale не содержал `common.cancel`; новый dialog-сценарий поймал literal translation key.
  Подпись добавлена в shared locale вместо Tribute-specific дубликата.
- Shared `ConfirmDialog` растягивался на всю высоту из-за fixed `inset` без content-sized height.
  Общий modal переведён на `height: fit-content`, bounded viewport height и scrollable body; 12
  light/dark screenshot states подтверждают компактную геометрию на 320/430/1280 px.
- Mobile WebKit следует touch-поведению Safari и не оставляет DOM focus на tapped button; возврат
  focus детерминированно проверяется в keyboard-capable Chromium, а WebKit сохраняет закрытие,
  trap, Axe и отсутствие overflow.

## Decision Log

- 2026-08-14 — resolve означает «закрыть без изменения доступа», а не ручной grant/revoke. Без
  документированной payment identity или согласованного provider state UI не предлагает опасный
  override.
- 2026-08-14 — retry разрешён только для `provider_unavailable`; остальные review reason требуют
  расследования и могут быть лишь явно resolved.
- 2026-08-14 — append-only action table выбран вместо одного mutable `operator_note`, чтобы
  сохранить actor, previous state и повторяемую последовательность действий.

## Verification

- `E:\mini-app\backend`: 32 focused action/service/route/concurrency tests passed; focused Ruff
  passed.
- `E:\mini-app\frontend`: Tribute Playwright all-project matrix 60/60 passed; visual evidence test
  passed and 12 screenshots were inspected in light/dark at 320/430/1280 px.
- `E:\mini-app`: fresh `PLAYWRIGHT_PORT=5202; scripts/verify.ps1 -Scope Full` passed one-head,
  upgrade/downgrade/re-upgrade/drift, 410 backend, 55 Remnawave contract, Ruff, frontend
  lint/typecheck, 37 unit, production build, 74 mobile browser and docs checks.

## Recovery and rollback

Migration downgrade удаляет только новую action table и возвращает status constraint к прежнему
набору после проверки отсутствия `resolved` rows. До release rollback безопасен через downgrade на
disposable DB; после реальных resolved rows production rollback требует сначала сохранить/перевести
audit data и не должен выполняться автоматически.

## Outcomes & Retrospective

Admin journal теперь является управляемой review queue без опасного manual grant. Backend владеет
eligibility, конкурентной state machine и audit attribution; UI показывает только разрешённые
решения, повторяет idempotency key после неопределённой ошибки и явно сообщает terminal result.
Resolve не меняет provider access, retry не делает network call в admin request, executor default
не изменён. Следующий независимый slice — alerts/metrics и production rollout/rollback runbook.
