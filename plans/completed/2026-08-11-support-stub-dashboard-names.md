# Удаление внешней Support-настройки и точные названия подсистем дашборда

Status: completed
Owner: Codex
Started: 2026-08-11
Updated: 2026-08-11

## Purpose

Вернуть Support к честной заглушке будущей встроенной поддержки и убрать ошибочную возможность
настроить внешнюю ссылку. В административном интерфейсе называть источники метрик по фактическим
системам: Remnawave и Flowvy Mini-App вместо неоднозначных generic access и Bot.

## Current state

Текущий незакоммиченный diff добавил четыре Support-поля в `provider_settings`, публичный `/api/me`,
admin settings, frontend branding и отдельную миграцию `m3n4o5p6q7r8`. Миграция уже применена к
локальной dev-БД, но ещё не опубликована. `/support` сейчас выводит внешнюю provider-owned ссылку.
Dashboard использует неоднозначные generic access/Bot locale-значения во вкладках, заголовках ошибок
и секции настроек.

## Scope

Входит удаление четырёх Support-полей из модели/API/frontend/fixtures/tests/docs, безопасный откат
только локальной dev-БД до предыдущей ревизии перед удалением незакоммиченной миграции, возврат
`/support` к локализованной заглушке и замена связанных видимых названий dashboard/settings.

Не входит реализация встроенного чата поддержки, изменение общей терминологии доступа или
переименование provider/API-полей, которые действительно описывают Telegram-бот или Remnawave-доступ.

## Acceptance

- В admin branding нет Support-полей, а API и схема БД их не содержат.
- `/support` сообщает только, что встроенная поддержка ещё не реализована, без внешнего действия.
- Вкладки и связанные системные подписи показывают Remnawave и Flowvy Mini-App.
- Locale catalog не содержит удалённых неиспользуемых ключей и frontend не содержит видимого hardcode.
- Свежие migration/backend/frontend/UI проверки проходят.

## Approach

Сначала остановить опубликованный dev-контур и откатить точную локальную Flowvy-БД с
`m3n4o5p6q7r8` до `l2m3n4o5p6q7`. Затем удалить ещё не опубликованную миграцию и Support-контракт,
обновить locale/UI/tests/docs, проверить diff и запустить change-aware, migration и UI gates.

## Progress

- [x] 2026-08-11 03:30 +03:00 — прослежены Support model/API/frontend/test/docs и все видимые
  dashboard generic access/Bot labels.
- [x] 2026-08-11 03:33 +03:00 — локальная dev-БД безопасно возвращена с `m3n4o5p6q7r8`
  к опубликованной head `l2m3n4o5p6q7` до удаления незакоммиченной migration.
- [x] 2026-08-11 03:39 +03:00 — Support-контракт удалён, а `/support` возвращён к локализованной
  заглушке будущего встроенного flow.
- [x] 2026-08-11 03:41 +03:00 — locale namespaces и видимые dashboard/settings labels обновлены на
  Remnawave и Flowvy Mini-App; прежний generic access copy на этом этапе сохранён.
- [x] 2026-08-11 03:46 +03:00 — full gate, focused 40-case all-project matrix и визуальный просмотр
  завершены.

## Surprises & Discoveries

- Support migration не опубликована и существует только в рабочем дереве; добавлять поверх неё
  компенсирующую миграцию означало бы сохранять ненужную историю ещё не выпущенной функции.

## Decision Log

- 2026-08-11 — Support остаётся продуктовой вкладкой будущей встроенной поддержки; внешний URL и
  operator-owned Support copy удаляются полностью.
- 2026-08-11 — Remnawave/Flowvy Mini-App меняются во всём связанном видимом copy, но общие access
  labels и реальные bot/provider data contracts на этом этапе не переименовываются.
- 2026-08-11 — последующей терминологической проверкой подтверждено, что Remnawave управляет
  Xray-прокси; сохранённые generic access labels исправлены отдельным изменением.

## Verification

- `E:\mini-app`: `scripts/verify-migrations.ps1` → один head, zero/head, downgrade/re-upgrade и drift.
- `E:\mini-app\backend`: focused provider settings tests и выбранный полный gate → passed.
- `E:\mini-app\frontend`: `pnpm verify` → lint/type/unit/build passed.
- `E:\mini-app\frontend`: focused Playwright `/support`, `/admin/dashboard`, `/admin/settings` на
  mobile и desktop, light/dark, без console/network/overflow/a11y ошибок.
- `E:\mini-app`: `scripts/verify.ps1 -Scope Full` → итоговый свежий gate passed.

## Recovery and rollback

Откат выполняется только против явно заданной локальной БД
`postgresql+asyncpg://flowvy:flowvy_dev@127.0.0.1:5432/flowvy`. Перед удалением migration-файла
проверяется текущая Alembic revision. Репозиторные процессы останавливаются штатными `dev-down` и
`tunnel-down`; пользовательские изменения не сбрасываются.

## Outcomes & Retrospective

Support больше не является внешней operator-настройкой: API/ORM/types/fixtures не содержат его
полей, а отдельный negative contract test защищает эту границу. Маршрут остаётся доступным и честно
сообщает о будущем in-app flow. Dashboard и секция настроек используют точные product/provider names.
Миграционный verifier, 315 backend tests, 53 Remnawave contracts, 32 frontend unit tests, production
build, 50 mobile smoke и 40 focused all-project scenarios прошли; light/dark mobile/desktop evidence
проверено вручную.
