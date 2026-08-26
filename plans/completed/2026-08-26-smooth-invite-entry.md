# Smooth Telegram invite entry

Status: completed
Owner: Codex
Started: 2026-08-26
Updated: 2026-08-26

## Purpose

Пользователь, открывший Main Mini App по валидной invite-ссылке, должен увидеть один стабильный
фирменный launch state, а затем уже готовую Home вместо последовательности onboarding form → Home
skeleton → Home.

## Current state

`AuthGuard` сначала показывает structural `LaunchSkeleton`. После `GET /api/onboarding` компонент
`OnboardingScreen` запускает `POST /api/onboarding/redeem-launch` из effect, но на один render уже
показывает ручную форму. Успешная mutation немедленно публикует `currentUser`; Home затем отдельно
запрашивает subscription и показывает полноэкранный skeleton.

## Scope

Входит frontend launch/onboarding presentation, прогрев обязательных Home-данных, deterministic
tests, visual/accessibility verification, локальный purge точного dev user `8146492478`, production
build и полный стандартный dev restart. Backend registration contract не меняется. External provider
data не удаляется: повторяется существующая local PostgreSQL/Redis purge boundary.

## Acceptance

- Валидный server-confirmed launch invite не показывает ручную invite/open-registration форму.
- Обычные auth check и onboarding status сохраняют быстрый structural `LaunchSkeleton`.
- Только после server-confirmed launch invite auto-redeem и Home warm-up используют один branded
  transition.
- Home открывается только после завершения initial subscription query; `404` остаётся валидным
  состоянием отсутствующей subscription.
- Ошибка auto-redeem раскрывает существующую ручную форму с actionable feedback.
- Light/dark, 430x932, 320x568, iOS WebKit и desktop не имеют новых overflow, Axe, console или
  network findings; reduced motion поддержан.
- Exact local user `8146492478` и его local dependents/Redis keys отсутствуют после purge.
- Production build свежий; стандартный Telegram-enabled dev отвечает локально и публично,
  public debug закрыт, PostgreSQL/Redis healthy, bot polling ready.

## Approach

Добавить переиспользуемый `EntryTransition` на semantic tokens. Скрывать onboarding form сразу после
server-confirmed `launchInviteAvailable`, а не после старта effect. Вынести subscription query options
и дождаться prefetch в mutation success callback до публикации `currentUser`. Расширить registration
Playwright delayed-state scenarios и проверить все failure paths. После code verification выполнить
точечный local PostgreSQL/Redis purge, затем lifecycle restart через tracked scripts.

## Progress

- [x] 2026-08-26 — Прослежен текущий auth → onboarding → redeem → Home query flow и подтверждена
  причина трёх последовательных экранов.
- [x] 2026-08-26 — Реализован branded transition, server-confirmed form suppression и Home
  subscription warm-up с корректным empty `404` state.
- [x] 2026-08-26 — Focused registration прошёл 72/72 на четырёх проектах; Full gate прошёл
  migrations/drift, 570 backend, 56 contracts, 111 unit и 230/230 mobile Playwright.
- [x] 2026-08-26 — Exact local dev user удалён; PostgreSQL dependents и Redis keys/fields
  подтверждены нулями до и после restart.
- [x] 2026-08-26 — Production build пересобран; standard dev runtime и public named origin
  полностью подтверждены.

## Surprises & Discoveries

- `redeem-launch` уже возвращает полный `UserResponse`; backend/API change не нужен.
- TanStack prefetch не предотвращает mount refetch при `staleTime: 0`, а cached `404` остаётся error;
  поэтому empty subscription нормализована в `null` и получила короткое freshness window.
- Первый Changed smoke зафиксировал два stale/timing test expectations; после их исправления focused
  повтор прошёл 2/2, а свежий Full — 230/230 browser scenarios.

## Decision Log

- 2026-08-26 — Не добавлять optimistic success state: доступ считается созданным только после
  успешного server mutation.
- 2026-08-26 — Блокировать переход только initial subscription query; Sponsor/Invite сохраняют
  собственные progressive skeleton states и не должны увеличивать launch latency.
- 2026-08-26 — Purge ограничен local PostgreSQL/Redis по ранее принятой границе; внешний Remnawave
  не затрагивается без отдельного точного разрешения.
- 2026-08-26 — Не добавлять route opacity reveal: launch surface исчезает только после готовности
  Home, а прежний no-opacity route contract сохраняет стабильный contrast.

## Verification

- `frontend`: focused `registration.spec.ts`, lint, typecheck, unit tests, production build.
- Repository root: `pwsh ./scripts/verify.ps1 -Scope Changed`, затем Full при доступных services.
- UI: delayed auto-redeem/subscription, failure fallback, light/dark и четыре configured projects;
  Axe, overflow, reduced motion, console/network guards.
- Runtime: tracked `dev-down.ps1`, canonical `dev-up.ps1 -SkipInstall -EnableTelegram
  -NamedTunnelUrl 'https://dev-app.flowvy.io'`, затем listener/HTTP/container/log verification.

## Recovery and rollback

Frontend change откатывается удалением transition component и возвратом sync `finish`. Purge
необратим для локальной строки пользователя, поэтому до write проверяются exact ID и dependents;
volumes целиком не удаляются. Dev scripts останавливают только tracked Flowvy processes.

## Outcomes & Retrospective

Пользователь с валидным server-confirmed Main Mini App invite больше не видит ручную registration
форму и последующий Home skeleton. Обычная загрузка сохраняет прежний быстрый structural skeleton,
а branded transition покрывает только подтверждённые auto-redeem и subscription warm-up; invalid
invite сохраняет actionable manual fallback. Full repository gate и
четырёхпроектная registration matrix зелёные. Exact local test user удалён без внешнего provider
вызова. Standard Telegram-enabled dev пересобран, запущен в retained session и подтверждён локально
и публично; production asset identity совпадает.
