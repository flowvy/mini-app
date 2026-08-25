# Telegram username на Home вместо provider identity

Status: completed
Owner: Пятница
Started: 2026-08-25
Updated: 2026-08-26

## Purpose

На Home активная подписка показывает узнаваемый `@telegram_username`, если Telegram передал
username, а не технический Remnawave identifier `tg_<telegram_id>`.

## Current state

Подписанный Telegram `initData` уже синхронизирует nullable username в локальную `users.username`.
Remnawave user намеренно создаётся со стабильным уникальным `tg_<telegram_id>`, а
`GET /api/me/subscription` сейчас проецирует этот provider username в поле `name`. `HeroCard`
показывает `subscription.name` без отдельной Telegram identity.

## Scope

Входит additive поле `telegramUsername` в subscription BFF response, отображение его на Home и
fallback к provider `name`. Не входят переименование Remnawave user, миграция данных и реальные
Telegram/Remnawave mutations.

## Acceptance

- Home показывает `@username`, когда локальная Telegram identity содержит username.
- Home показывает прежний provider `name`, когда Telegram username отсутствует.
- Provider create/reconciliation продолжает использовать `tg_<telegram_id>`.

## Approach

SubscriptionService прочитает уже существующего локального пользователя тем же repository,
добавит nullable username в typed response, а HeroCard выберет Telegram identity с provider
fallback. Regression tests проверят backend mapping/camelCase и оба UI-сценария.

## Progress

- [x] 2026-08-25 23:15 +03:00 — трассировка показала, что Home выводит Remnawave `name`, хотя
  Telegram username уже хранится локально.
- [x] 2026-08-25 23:43 +03:00 — реализован additive BFF/UI contract; backend mapping/route прошёл
  11/11, Home identity/fallback — 8/8 на четырёх Playwright projects.
- [x] 2026-08-26 00:00 +03:00 — Changed и Full gates прошли; полный Telegram-enabled dev
  пересобран, перезапущен и проверен по портам, HTTP, Docker и poller marker.

## Surprises & Discoveries

- Скрин относится к user-facing Home, тогда как предыдущее исправление обогащало только Admin Users.
- `tg_*` приходит из Remnawave и требуется для стабильной provider identity; Telegram parsing уже
  сохраняет настоящий username в локальную БД.

## Decision Log

- 2026-08-25 — не переименовывать Remnawave user: Telegram username optional и изменяемый, а
  provider username участвует в idempotent create/reconciliation.
- 2026-08-25 — расширить subscription response nullable полем вместо замены `name`, чтобы сохранить
  обратную совместимость и корректный fallback.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/backend`: focused pytest для subscription service/route.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: unit/type/lint и focused Playwright Home.
- `/Users/x_kit_/Documents/Projects/mini-app`: `pwsh ./scripts/verify.ps1 -Scope Changed`.
- Runtime: Home на mobile viewport показывает `@username`, endpoints и console/network остаются
  зелёными.

## Recovery and rollback

Изменение additive и не пишет внешние данные. Откат ограничен удалением нового response field и
возвратом HeroCard к `subscription.name`; Remnawave и локальные данные не меняются.

## Outcomes & Retrospective

Home теперь показывает `@telegram_username`, сохраняя `tg_<telegram_id>` только как fallback и не
меняя стабильную Remnawave identity. Focused light/dark screenshots на 430x932, 320x568, iOS WebKit
и desktop просмотрены без overflow/Axe findings. Changed подтвердил 442 service-free backend tests,
111 unit и 227/227 Playwright; Full подтвердил migration lifecycle/drift, 563 backend tests, 56
pinned Remnawave contracts и те же frontend gates. Стандартный dev работает с новым public Home
asset; внешние mutations, commit и push не выполнялись.
