# Честный UX расширенного доступа через Tribute

Status: complete
Owner: Codex
Started: 2026-08-23
Updated: 2026-08-23

## Purpose

Показать пользователю конкретные преимущества каждого опубликованного Tribute offer, провести его
через one-time/recurring donation либо subscription до подтверждённого расширенного доступа и не
скрывать альтернативные варианты из-за незавершённого локального checkout.

## Current state

- `GET /api/me/sponsor` отдаёт опубликованные offer и server-computed access state, но не включает
  traffic/device benefits выбранного admin access profile.
- Donation offer хранит exact amount, one-time либо recurring mode и recurring Tribute period;
  subscription offer содержит все периоды из Creator catalog.
- Один pending checkout сейчас скрывает каталог на Home. Для другого offer backend сначала требует
  закрыть старый local intent отдельным `DELETE`, хотя поздний matching webhook умеет подтвердить и
  expired intent.
- Flowvy открывает provider-hosted Creator link; redirect не подтверждает платёж, доступ меняется
  только после authenticated webhook и applied entitlement operation.

## Scope

Входит полный local contract donation/subscription settings, allow-listed public benefits,
неблокирующий switch checkout, Home UI для offer/pending/applied states, deterministic backend/unit/
browser tests, документация и пересборка Telegram-enabled dev.

Не входят реальные платежи, Tribute/Remnawave mutations, смена платёжного провайдера, Stars и
изменение внешнего Cloudflare route.

## Acceptance

- One-time donation, recurring donation для каждого поддерживаемого Tribute period и subscription
  с одним/несколькими periods показывают traffic/device benefits выбранного admin profile.
- Pending остаётся компактным contextual state; published offers видимы, другой offer можно выбрать
  без предварительного confirm dialog или ручного освобождения интерфейса.
- Redirect/return не создаёт Remnawave user и не утверждает оплату; поздний signed event старого
  checkout остаётся обрабатываемым.
- После applied state checkout guidance исчезает; Home показывает фактический активный access.
- Focused backend/frontend/browser проверки, production build и свежий dev runtime проходят.

## Approach

1. Проследить admin settings и official Tribute donation/subscription contracts для всех режимов.
2. Спроектировать allow-listed benefits projection и атомарный replacement локального pending intent.
3. Реализовать backend schema/service/tests, затем frontend types/state/UI/copy/tests.
4. Проверить 320/430 light/dark, pending switch, applied state, console/network/Axe.
5. Выполнить change-aware/full verification по доступной среде, пересобрать и поднять standard dev.

## Progress

- [x] 2026-08-23 — зафиксированы исходный clean worktree и обязательные integration/UI/verification contracts.
- [x] 2026-08-23 — завершена построчная сверка local settings и official Tribute scenarios.
- [x] 2026-08-23 — реализован backend contract и focused tests.
- [x] 2026-08-23 — реализован Home UX и deterministic browser coverage.
- [x] 2026-08-23 — выполнены финальные gates и runtime acceptance.
- [x] 2026-08-23 — исправлена pending-иерархия: status check стал primary, continue/cancel — secondary.
- [x] 2026-08-23 — удалены пассивные notices после unchanged status check и успешной local отмены.

## Surprises & Discoveries

- Tribute regular donation использует payer-selected amount/frequency; Creator link не фиксирует эти
  параметры, поэтому Flowvy сохраняет exact локальный offer и проверяет signed webhook schedule.
- При switch donation новый intent может не совпасть с поздним платежом старого; repository теперь
  проверяет совместимые expired attempts, а не завершает поиск на newest mismatch.
- Fresh Axe остаётся красным только на ранее принятом exact color ledger ADR 0004; suppression не
  добавлялась.

## Decision Log

- 2026-08-23 — donation остаётся продуктовой благодарностью с расширенным доступом; Stars и смена
  провайдера вне scope по явному решению владельца.
- 2026-08-23 — pending offer switch заменяет только локальный intent; provider payment никогда не
  отменяется и поздний authenticated event остаётся валидным входом.
- 2026-08-23 — пользователь может явно закрыть local pending attempt; это не блокирует другой offer
  и не отменяет позднюю обработку точного signed webhook.

## Verification

- Backend focused: 49 sponsor/checkout tests; full: 538 tests; pinned Remnawave contracts: 56.
- Frontend: lint, typecheck, 99 unit tests и production build прошли.
- Focused Playwright: 24/24 recurring/switch scenarios, 16/16 pending/switch/return scenarios и 4/4
  admin recurring-period scenarios. Follow-up primary/continue/cancel/switch/return matrix прошла
  20/20 на 320/430, iOS WebKit и desktop; scoped Axe трёх pending actions чистый. Light/dark evidence
  просмотрена.
- Repository Full: migrations/drift и все non-Axe checks прошли; mobile Playwright 173/185, все 12
  failures совпали с accepted ADR 0004 `color-contrast` ledger, новых nodes/rules нет.
- Follow-up Changed: 428 service-free backend tests, lint/typecheck, 99 unit и production build прошли.
- Runtime: standard Telegram-enabled dev пересобран и перезапущен; local `5173`/`8001`/`4173`,
  public root/health/ready — `200`, public debug — `404`, asset `index-C5m3OcN1.js` совпадает,
  `telegram_main_app_ready` подтверждён.

## Recovery and rollback

Изменения source-only и проверяются на mocked/fake provider boundary. Lifecycle scripts останавливают
только tracked Flowvy processes и сохраняют Docker volumes. Реальные Tribute, Remnawave и production
data не затрагиваются.

## Outcomes & Retrospective

Home теперь продаёт не абстрактный «расширенный доступ», а конкретные traffic/device benefits и
сохраняет выбор альтернатив даже при pending checkout. Status check — главное действие pending,
повторный переход в Tribute и закрытие local attempt — вторичные. Flowvy не делает вывод об оплате из redirect:
только authenticated exact Tribute event меняет entitlement. Самая полезная provider-возможность для
UX оказалась не checkout callback, которого нет в публичном contract, а Telegram visibility event для
быстрого server refresh после возврата. Existing strict color-parity debt остался видимым и не вырос.
