# Совместимость Flowvy с Remnawave 2.8 и 3.x

Status: completed
Owner: Codex
Started: 2026-08-02
Updated: 2026-08-02

## Purpose

Сохранить работу Flowvy с текущей dev-панелью Remnawave 2.8.1 и подготовить тот же BFF к переходу
на 3.0/3.1, где пользователь больше не имеет UUID, поисковые endpoints заменены stream-фильтрами,
а user/HWID маршруты и тела запросов используют числовой `userId`.

## Current state

- Живая dev-панель сообщает 2.8.1 и прошла read-only smoke.
- Локальный OpenAPI snapshot остаётся 2.7.4.
- Flowvy уже читает числовой provider `id`, но внутренние схемы, admin routes и destructive client
  calls всё ещё во многих местах требуют `uuid`.
- Официальные release notes 3.0/3.1 предоставлены пользователем; exact source tags будут сверены до
  реализации.

## Scope

Входит: все используемые Flowvy user lookup/detail/list/action/delete, subscription, HWID,
dashboard и webhook contracts; version detection; dual-version deterministic tests; read-only smoke
на 2.8.1; документация.

Не входит: обновление реальной панели, изменяющие live-запросы, миграция production данных,
использование новых 3.x продуктовых возможностей, которые Flowvy сейчас не показывает.

## Acceptance

- Клиент выбирает документированный 2.8 или 3.x endpoint/body по подтверждённой версии панели.
- Внутренняя identity допускает legacy UUID, но не требует его от 3.x user response.
- Ownership и admin actions остаются fail-closed и никогда не подставляют один тип ID вместо другого.
- Детерминированные tests покрывают обе ветки и 3.1 additive fields.
- Полный локальный gate и read-only smoke на текущей 2.8.1 проходят.

## Approach

1. Сверить release notes и exact official tags 2.8.1/3.0.0/3.1.0.
2. Построить route → client → schema → service → frontend карту всех используемых вызовов.
3. Ввести одну version-aware boundary внутри Remnawave client и минимально расширить internal DTO.
4. Добавить fixtures/tests для трёх версий, затем пройти focused и полный gate.
5. Обновить canonical docs и закрыть план.

## Progress

- [x] 2026-08-02 — official 3.0 release note подтвердил удаление user UUID, переход путей/тел HWID
  и actions на `userId`, удаление lookup по Telegram/email/tag и переход на cursor stream.
- [x] 2026-08-02 — official 3.1 note подтверждает additive node `id`, SRR history/webhook fields.
- [x] Сверить exact source/OpenAPI и завершить карту Flowvy calls.
- [x] Реализовать dual compatibility и tests.
- [x] Пройти live/full verification и обновить документы.

## Surprises & Discoveries

- URL `/releases/v300` сейчас ведёт на общий topic Remnawave Panel v3.1.0; post 1 содержит 3.0
  migration guide, post 2 — полный API diff 2.8.1→3.0.0, post 6 — diff 3.0.0→3.1.0.

## Decision Log

- 2026-08-02 — сохраняем dual 2.8/3.x compatibility: реальная dev-панель ещё 2.8.1, поэтому
  одномоментная замена UUID на ID сломала бы проверенный текущий контур.
- 2026-08-02 — никаких live mutations: delete/actions проверяются только contract tests.

## Verification

- `E:\mini-app\backend`: focused Remnawave/service/route tests, затем полный pytest + Ruff.
- `E:\mini-app`: `scripts/verify-contracts.ps1`, `scripts/verify-migrations.ps1`,
  `scripts/verify.ps1 -Scope Full`.
- `E:\mini-app\frontend`: применимые unit/build/Playwright gates при изменении API projections.
- Live: только subscription/devices/dashboard/users/settings reads через dev-up на 2.8.1.

## Recovery and rollback

Изменения ограничиваются version-aware client/schema/service boundary и тестами; миграция внешней
панели не выполняется. При ошибке ветки можно откатить отдельным patch без изменения БД или provider.

## Outcomes & Retrospective

- Flowvy использует числовой provider ID во внутреннем BFF/admin contract, но сохраняет optional
  legacy UUID для реальной панели 2.8.1.
- Client выбирает lookup/path/body по major из metadata, поддерживает 2.x и 3.0/3.1 и fail-closed
  останавливается на неизвестном major или неоднозначной identity.
- PostgreSQL migration сохраняет старые UUID и добавляет nullable unique numeric ID; previous-head,
  downgrade/re-upgrade и model drift доказаны на disposable database.
- Deterministic suite покрывает 2.8.1/3.0.0/3.1.0, UI использует numeric routes, а read-only live smoke
  подтверждает обратную совместимость с установленной 2.8.1.
- Живой 3.x smoke остаётся внешним следующим шагом после обновления dev-панели; до этого 3.x
  доказан official exact-tag contracts и локальными fixtures, а не утверждением о live target.
