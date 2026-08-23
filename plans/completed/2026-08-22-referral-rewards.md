# Реферальные дни и welcome-скидка Tribute

Status: completed
Owner: Пятница
Started: 2026-08-22
Updated: 2026-08-22

## Purpose

Flowvy превращает существующую invite attribution в одноуровневую реферальную систему. После первой
успешно применённой оплаты приглашённого пригласивший один раз получает настроенное число дней
Remnawave-доступа. Независимо от этого приглашённый новичок может открыть выбранную subscription
через официальный общий promo link Tribute.

## Current state

- `users.invited_by_id` фиксирует прямого пригласившего при регистрации, но отдельной конверсии и
  награды нет.
- Tribute webhook создаёт durable `entitlement_operations`; executor помечает оплату `applied`
  только после успешного Remnawave reconciliation.
- `sponsor_checkouts` сохраняет immutable offer snapshot и возвращает его destination. Redirect сам
  по себе не доказывает оплату.
- `provider_settings` хранит provider-wide payment destinations, а admin Payments route уже владеет
  Tribute checkout configuration.
- Official Tribute documentation, checked 2026-08-22:
  `https://wiki.tribute.tg/for-content-creators/subscriptions/promo-codes-for-subscriptions` — promo
  создаётся вручную, direct link заранее применяет его, скидка действует только на первую оплату
  subscription, имеет срок и лимит активаций и не складывается с first-period discount.
- Official Telegram Mini Apps documentation, checked 2026-08-22:
  `https://core.telegram.org/bots/webapps` — `openTelegramLink(url)` открывает Telegram link внутри
  Telegram и не закрывает Mini App на Bot API 7.0+.

## Scope

Входит:

- provider-wide настройка двух независимых benefits: referral days и welcome discount;
- условные поля только внутри существующего Payments route;
- один durable conversion/reward на приглашённого после его первой applied Tribute grant;
- reward grant пригласившему через существующий ledger/executor;
- backend-selected promo destination для подходящего приглашённого и выбранного subscription offer;
- Home badge/copy без вычисления цены скидки внутри Flowvy;
- миграция, backend/frontend contracts, deterministic tests и документация.

Не входит:

- проценты, кошелёк, несколько уровней, вывод денег, clawback и reward за регистрацию;
- создание, чтение либо проверка promo codes через Tribute API;
- персональные или одноразовые promo links;
- promo для donations;
- защита общего Tribute promo link от пересылки.

## Acceptance

- Admin независимо включает days, welcome discount либо оба benefits; выключенные benefits не
  требуют скрытых обязательных полей.
- Days требуют положительное число и active automation access profile; discount требует published
  ready subscription offer и абсолютный HTTPS promo link.
- Только первая applied Tribute payment grant приглашённого создаёт conversion. Replay, renewal,
  повторный donation и concurrent processing не создают вторую награду.
- Reward operation использует frozen configured profile, `extend` и фиксированные days; Remnawave
  mutation остаётся в существующем idempotent executor.
- Promo destination выбирается backend только для active invited user без предыдущей applied Tribute
  payment и только для configured subscription offer; обычный checkout URL сохраняется во всех
  остальных случаях.
- Flowvy сообщает только `Welcome discount`; Tribute остаётся источником фактической применимости и
  цены.
- Backend, migrations, frontend gates и affected Playwright scenarios проходят свежо.

## Approach

1. Добавить provider settings и durable referral conversion/reward table с явными constraints,
   immutable source/reward links и unique invitee conversion.
2. Валидировать referral configuration backend-ом и отдать typed admin contract.
3. При атомарном переходе внешней payment grant в `applied` создать conversion и, если days включены,
   отдельную `flowvy` grant operation пригласившему с frozen profile snapshot.
4. При построении state/checkout вычислять welcome eligibility только из local durable facts;
   подменять destination до сохранения checkout snapshot, не менять опубликованный offer snapshot.
5. Добавить компактную conditional admin section и badge/help copy на существующую Home offer card.
6. Обновить deterministic backend/frontend/UI coverage и постоянную документацию, затем пройти
   change-aware и full gates.

## Progress

- [x] 2026-08-22 20:09 +03:00 — исходная ветка чистая; invite, sponsor checkout, webhook ledger,
  executor, settings и official Tribute/Telegram contracts трассированы.
- [x] 2026-08-22 20:36 +03:00 — migration/models/repositories и backend contracts реализованы.
- [x] 2026-08-22 20:36 +03:00 — reward orchestration и promo checkout eligibility реализованы.
- [x] 2026-08-22 20:36 +03:00 — conditional admin/Home UI и deterministic browser fixtures реализованы.
- [x] 2026-08-22 20:36 +03:00 — Changed/Full gates, focused browser matrix, visual review и diff
  review завершены.

## Surprises & Discoveries

- Tribute Creator docs не описывают API создания/валидации promo codes. Flowvy хранит официальный
  готовый direct link как opaque destination и не конструирует его query parameters.
- Donation identifier не нужен для reward idempotency: conversion привязан к invitee и первой
  успешно применённой local operation, а не к повторяемому provider donation request ID.
- Full Playwright сохранил прежний `Payment activity` heading: referral reward получил отдельную
  allow-listed строку внутри знакомого журнала без переименования существующей UI section.

## Decision Log

- 2026-08-22 — скидка позиционируется как общий `Welcome discount`, не персональная реферальная
  награда; общий link можно переслать.
- 2026-08-22 — reward создаётся после `applied`, а не после webhook insert или checkout redirect;
  это исключает награду за payment, который ушёл в review либо не применился в Remnawave.
- 2026-08-22 — provider выбирает reward access profile только при включённых days. Frozen snapshot
  не зависит от будущего редактирования профиля и не копирует tier приглашённого неявно.
- 2026-08-22 — исходное решение не показывать рассчитанную цену superseded планом
  `2026-08-22-welcome-discount-price-presentation.md`: Home показывает явно оценочную first-payment
  цену, а Tribute остаётся authority для validity, activation limit, minimum price и non-stacking
  rules на checkout.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/backend`: focused referral/settings/sponsor/executor
  pytest → 85 passed; full backend → 530 passed; pinned Remnawave contracts → 56 passed.
- `/Users/x_kit_/Documents/Projects/mini-app`: migration verifier → one head, fresh/previous-head,
  downgrade/re-upgrade and model drift passed for `f1a2b3c4d5e6`.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: lint, typecheck, 77 unit tests and production
  build passed.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: focused `tests/e2e/tribute.spec.ts` on
  430x932, 320x568, WebKit 390x844 and desktop 1280x900 → 12/12 admin configuration, load recovery
  and Home badge scenarios passed; light/dark evidence manually inspected without overflow.
- `/Users/x_kit_/Documents/Projects/mini-app`: `verify.ps1 -Scope Changed` → 421 service-free backend,
  77 unit, build and 149 Playwright passed; `verify.ps1 -Scope Full` → migration lifecycle/drift,
  Ruff, 530 backend, 56 pinned contracts, 77 unit, build, 149 Playwright and docs passed.

## Recovery and rollback

Migration downgrade removes only the new referral table/settings columns after dropping their
constraints. Existing users, invites, checkouts and payment operations are preserved. Application
rollback disables new reads/writes before schema downgrade. Tests use disposable PostgreSQL and
mocked Tribute/Remnawave; no real provider endpoint or secret is used.

## Outcomes & Retrospective

Реализованы все три продуктовых режима одним компактным блоком из двух независимых toggles. Reward
не зависит от нестабильной provider donation identity и начисляется только после доказанного
`applied`; welcome discount остаётся безопасной backend-selected ссылкой для новичка. Реальные
Tribute/Telegram/Remnawave mutations не выполнялись. Commit и push не выполнялись.
