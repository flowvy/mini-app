# Импорт существующего Remnawave-пользователя без инвайта

Status: completed
Owner: Codex
Started: 2026-08-04
Updated: 2026-08-04

## Purpose

Пользователь, который уже существует в Remnawave с точным Telegram ID, будет считаться существующим
пользователем сервиса даже при отсутствии локальной строки Flowvy. Бот и Mini App автоматически
создадут только локальную учётную запись, персональный invite и связь subscription. Invite-only gate
и default access profile будут применяться только к пользователю, которого нет ни в Flowvy, ни в
Remnawave. Provider-поля существующего пользователя изменяться не будут.

## Current state

- `RegistrationService.get_existing()` проверяет только PostgreSQL, поэтому legacy/provider-only
  пользователь получает invite-only onboarding.
- `RegistrationService._ensure_provider_user()` уже делает exact lookup по `telegramId` и при
  найденном пользователе безопасно сохраняет его без mutation, но этот lookup происходит слишком
  поздно — после прохождения регистрации.
- Фактический сценарий 2026-08-04 подтвердил: локальная запись была создана через invite, а
  Remnawave-user существовал задолго до неё и сохранил прежний доступ.
- Exact lookup поддерживает установленную Remnawave 2.8.1 и зафиксированные 3.0.0/3.1.0 contracts:
  2.x использует `/api/users/by-telegram-id/{id}`, 3.x — bounded `/api/users/stream` с точным
  `telegramId`. Неоднозначное соответствие fail-closed.

## Scope

Входит:

- общий idempotent import path для бота, `/api/me`, onboarding, open registration и direct redeem;
- создание локального user/invite/subscription из read-only provider response;
- отсутствие referral attribution и provider mutations для импортированного пользователя;
- fail-closed поведение при недоступном или неоднозначном Remnawave lookup;
- deterministic service, bot и HTTP regression tests;
- обновление решения и текущего состояния проекта.

Не входит:

- автоматический выбор default access profile;
- изменение доступа существующего Remnawave-пользователя;
- отдельное admin-действие миграции тарифа или UI для него.

## Acceptance

- `/start` для provider-only пользователя сразу отправляет welcome и не просит invite.
- Прямой Mini App вход импортирует provider-only пользователя и возвращает `/api/me` успешно.
- Referral deep link provider-only пользователя не увеличивает статистику пригласившего.
- Импорт создаёт локальный subscription с provider identity/status/expiry/device limit.
- `create_user` и любые update/action методы Remnawave не вызываются при импорте.
- Новый пользователь по-прежнему проходит invite/open policy и получает выбранный default profile.
- Provider lookup error не превращает существующего пользователя в нового: возвращается временная
  недоступность, а локальные записи не создаются.

## Approach

1. Добавить в `RegistrationService` отдельный `resolve_existing()` поверх локального lookup. После
   PostgreSQL miss он берёт advisory transaction lock, повторяет local lookup, выполняет exact
   Remnawave lookup и при успехе создаёт только локальные user/invite/subscription.
2. Перевести bot, onboarding status, `/api/me`, open registration и redeem на новый resolver.
   Локальный `get_existing()` оставить дешёвым и без сети для уже защищённых внутренних операций.
3. Добавить regression tests для import, deep link, provider failure, HTTP mapping и неизменности
   нового-user flow.
4. Обновить durable docs и выполнить focused tests, Remnawave contracts, полный backend gate и
   change-aware repository verification.

## Progress

- [x] 2026-08-04 14:35 +03:00 — воспроизведён и доказан provider-only сценарий без вывода PII:
  provider-user старше локальной записи, referral записан только после ошибочного invite flow.
- [x] 2026-08-04 14:42 +03:00 — прослежены bot/API/service/repository/provider paths и зафиксировано
  решение об import-before-registration.
- [x] 2026-08-04 14:40 +03:00 — добавлены service, bot и HTTP regression tests для import,
  безопасного referral bypass и fail-closed provider error.
- [x] 2026-08-04 14:40 +03:00 — единый resolver подключён к bot, onboarding, `/api/me`, open и
  invite registration; import создаёт только локальные user/invite/subscription.
- [x] 2026-08-04 14:40 +03:00 — durable docs обновлены; focused/full backend, migration,
  Remnawave contract, docs и change-aware gates выполнены, dev перезапущен.

## Surprises & Discoveries

- Создание access profile не выбрало его как default; это объяснило отсутствие provider mutation,
  но по явному решению пользователя UI/default-selection не входит в эту задачу.
- `SubscriptionService` может синхронизировать provider данные только после active-local-user auth,
  поэтому новый import должен происходить до этого dependency, в registration boundary.

## Decision Log

- 2026-08-04 — существующий exact Remnawave match является достаточным доказательством прежнего
  доступа и импортируется без invite. Альтернатива «требовать invite для восстановления локальной
  БД» отвергнута как неверная для уже обслуживаемого пользователя.
- 2026-08-04 — import не применяет default profile и не учитывает referral code. Любая автоматическая
  provider mutation отвергнута как риск повреждения оплаченного или вручную настроенного доступа.
- 2026-08-04 — provider miss/error различаются: miss продолжает обычную регистрацию, transport/
  contract/ambiguity error закрывает flow временной недоступностью.

## Verification

- `E:\mini-app\backend`: focused registration/bot/auth/Remnawave run → 70 passed.
- `E:\mini-app\backend`: `uv lock --check`; Ruff format/lint → passed.
- `E:\mini-app\backend`: `uv run --frozen pytest -q` → 286 passed; only upstream
  pytest-asyncio Python 3.16 deprecation warnings remain.
- `E:\mini-app`: `scripts/verify-migrations.ps1` → one head, zero/previous upgrade,
  downgrade/re-upgrade and model drift passed.
- `E:\mini-app`: `scripts/verify-contracts.ps1` → 41 Remnawave 2.8.1/3.0.0/3.1.0 tests passed.
- `E:\mini-app`: `scripts/verify-docs.ps1` → passed.
- `E:\mini-app`: `scripts/verify.ps1 -Scope Changed -SkipE2E` → backend service-free,
  frontend lint/type/unit/build and docs passed.
- Stale UI coverage was reconciled with the accepted headerless detail-screen contract: date uses
  an unambiguous accessible textbox, nested Beszel navigation uses browser history, and the shared
  visual section header is a semantic `h2` with unchanged geometry. Mobile smoke passed 40/40 and
  the 430px/320px/iOS WebKit/desktop matrix passed 160/160.
- `scripts/verify.ps1 -Scope Full` passed migrations, 286 backend tests, 41 Remnawave contracts,
  frontend lint/type/unit/build, 40 Chromium smoke tests and docs.
- By explicit user request, the local dev `flowvy` schema was reset through Alembic base→head and
  Redis DB 0 was flushed. After restart users/subscriptions/invites/access profiles are empty,
  provider settings contain only the required default singleton, and Redis has only new runtime
  request counters. Remnawave and Docker volumes were not mutated or removed.
- Restarted dev reports local ready/frontend `200` and public tunnel health `200`.

## Recovery and rollback

Изменение не содержит migration и не меняет provider. Откат к прежнему поведению состоит в удалении
resolver и возврате публичных входов к local-only `get_existing()`. Созданные при ручной проверке
локальные строки не удаляются автоматически; live mutation-тесты не выполняются.

## Outcomes & Retrospective

Existing Remnawave users are now resolved before invite policy in every public entry point. Import
persists only local identity/invite/subscription state, ignores referral attribution and leaves all
provider access fields untouched. Deterministic HTTP tests prove direct Mini App import and safe
provider-outage handling; no live provider mutation was used.
