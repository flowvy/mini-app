# Показывать Telegram username в админском списке пользователей

Status: completed
Owner: Пятница
Started: 2026-08-25
Updated: 2026-08-25

## Purpose

Администратор видит узнаваемый `@telegram_username` вместо технического Remnawave username
`tg_<telegram_id>`, при этом стабильная provider identity не меняется и остаётся доступной вторично.

## Current state

Подписанный Telegram `initData.user.username` уже сохраняется в локальном `users.username`.
RegistrationService намеренно создаёт Remnawave user с username `tg_<telegram_id>`. AdminUsersService
сейчас проецирует только Remnawave `username`, поэтому список и detail показывают техническое имя.

## Scope

Входит additive поле admin API, batch enrichment из локальной БД, отображение и поиск по Telegram
username, deterministic backend/frontend/UI tests и документация текущего состояния. Не входят
изменение Remnawave username, миграция данных, реальные Telegram/Remnawave вызовы и изменение auth.

## Acceptance

- При наличии локального Telegram username список и detail показывают `@username` основным именем,
  а Remnawave username остаётся видимым вторично.
- При отсутствии локального пользователя или username UI сохраняет прежний Remnawave fallback.
- Список не создаёт N+1 SQL queries и API остаётся обратно совместимым.
- Поиск на странице Users находит пользователя по Telegram и Remnawave username.
- Свежие backend, frontend, build и focused Playwright проверки проходят без новых Axe, console,
  network или overflow findings.

## Approach

Добавить bulk lookup локальных users по Telegram ID, обогатить `AdminUserResponse` nullable полем
`telegram_username`, сохранить `username` как provider field, затем централизовать frontend
presentation helper и применить его в row, detail hero, actions и client-side search.

## Progress

- [x] 2026-08-25 21:51 +03:00 — текущая Telegram → local user → Remnawave → admin UI цепочка прочитана; причина подтверждена.
- [x] 2026-08-25 21:56 +03:00 — backend contract добавлен с одним batch lookup; focused repository/service tests прошли 12/12.
- [x] 2026-08-25 21:57 +03:00 — frontend presentation, search, actions, fixtures и tests обновлены; lint/typecheck/111 unit/build зелёные.
- [x] 2026-08-25 22:06 +03:00 — four-project visual/Axe matrix, Changed и Full gates прошли; diff review завершён, план закрыт.

## Surprises & Discoveries

- Наблюдаемое `tg_<telegram_id>` приходит не из Telegram: admin BFF и UI показывают ровно Remnawave
  username, хотя локальная таблица уже хранит Telegram username отдельно.
- Первый Playwright assertion ошибочно ожидал отдельный exact text node для `tg_*` в list row;
  screenshot подтвердил правильную составную meta-строку, assertion исправлен без изменения UI.

## Decision Log

- 2026-08-25 — не переименовывать Remnawave user: Telegram username optional и изменяемый, тогда как
  текущая deterministic provider identity участвует в reconciliation.
- 2026-08-25 — расширить API nullable полем `telegramUsername`, сохранив существующее `username` как
  provider username для обратной совместимости и безопасного fallback.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/backend`: focused pytest + Ruff.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: lint, typecheck, unit tests и production build.
- `/Users/x_kit_/Documents/Projects/mini-app`: `pwsh ./scripts/verify.ps1 -Scope Changed`.
- UI: `/admin/users`, `/admin/users/search`, `/admin/users/1` в light/dark mobile и desktop;
  проверить Telegram/provider labels, search, overflow, Axe, console и unexpected network.

## Recovery and rollback

Изменение не пишет данные и не вызывает provider. Откат состоит в удалении additive API field,
bulk lookup и presentation helper; Remnawave и локальная БД остаются неизменными.

## Outcomes & Retrospective

Admin Users теперь показывает узнаваемый Telegram username, не разрушая deterministic Remnawave
identity. Additive API contract сохраняет fallback и избегает N+1. Focused Playwright прошёл 8/8,
связанные route/IME regressions 8/8; light/dark screenshots на 320/430/iOS/desktop просмотрены без
overflow или Axe findings. Changed прошёл 441 service-free backend, 111 unit и 224/224 mobile
Playwright; Full подтвердил migrations/drift, 562 backend, 56 contracts и те же frontend gates.
Реальные integrations и данные не изменялись; commit/push не выполнялись.
