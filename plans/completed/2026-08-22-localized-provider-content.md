# Локализуемый контент оператора без runtime hardcode

Status: complete
Owner: Codex
Started: 2026-08-22
Completed: 2026-08-22

## Purpose

Дать владельцу одной Flowvy-инсталляции управлять tone of voice для Telegram onboarding,
Mini App onboarding, приглашений и входа в sponsor storefront. Сейчас интерфейс и admin
редактируют только English, но persisted/API contract сразу хранит значения по locale, чтобы
добавление `ru` не потребовало новой схемы данных или English-only полей.

## Current state

- Исходный commit `d0d4e556f0b1ede520b84eead8f5c3534fff512b`; `dev` опережает
  `origin/dev` на один commit, рабочее дерево перед задачей чистое.
- Frontend имеет один `frontend/src/i18n/locales/en.json` и принудительный `lng: en`.
- Telegram welcome text/button/media уже operator-owned, но text/button являются глобальными scalar
  columns. Остальной bot onboarding copy жёстко записан на English в
  `backend/src/flowvy/bot/handlers/start.py`.
- Mini App onboarding/referral/sponsor copy берётся из product locale; public API отдаёт
  только branding identity, без resolved operator content.
- Sponsor offer title/description являются operator-owned, но пока не имеют locale map.
- Текущий Alembic head: `z5a6b7c8d9e0`; цепочка одна.

## Scope

Входит typed locale-map contract, безопасный resolver/fallback, migration и admin editor для
operator content; локализуемые welcome и sponsor-offer presentation; backend bot locale resource;
resolved public content для onboarding/current user; deterministic backend,
frontend и browser coverage; обновление ADR/architecture/project state.

Не входят перевод product locale на Russian, автоматический машинный перевод, произвольный редактор
всех locale keys, изменение payment/security semantics, реальные Telegram/provider requests,
production rollout, commit или push.

## Acceptance

- Operator-authored text сохраняется как `locale -> typed fields`; UI сейчас редактирует `en`, а
  добавление нового JSON locale автоматически делает этот locale доступным в Content editor.
- Product strings остаются в locale resources. Telegram bot onboarding не содержит user-visible
  English literals в handler и выбирает product/operator copy по Telegram `language_code` с
  детерминированным fallback.
- `/api/onboarding` и `/api/me` возвращают только resolved allow-listed operator content для locale
  запроса; frontend использует `operator override ?? product locale`.
- Existing welcome и sponsor-offer English content сохраняется миграцией и продолжает отображаться;
  новые записи не требуют будущей schema migration для `ru`.
- Support остаётся product-owned заглушкой `Coming Soon`; payment warnings, status, validation,
  auth/security errors, admin actions и accessibility copy остаются product-owned.
- Fresh migration, backend, frontend, build and targeted/full deterministic browser gates проходят;
  новые admin/user states визуально проверены в light/dark и mobile/desktop.

## Approach

1. Ввести общий backend typed localized-content contract, locale normalization/resolution и
   packaged bot locale JSON с allow-listed placeholders.
2. Добавить JSONB locale maps к provider settings и sponsor offers и
   reversible Alembic migration с backfill существующих English welcome/offer values.
3. Протянуть admin/public schemas, services and routes; сохранить legacy fallbacks на период
   совместимости и не отдавать public API все языки.
4. Добавить frontend locale discovery, `Accept-Language`, typed admin Content editor и resolved copy
   на onboarding/Home; адаптировать Welcome и offer editor к locale maps.
5. Расширить unit/contract/Playwright fixtures and scenarios, затем выполнить Changed и Full gates,
   просмотреть diff/artifacts и обновить документы.

## Progress

- [x] 2026-08-22 04:35 +03:00 — выполнен read-only аудит 834 frontend locale leaves, bot literals,
  provider settings, runtime usages и принятой ADR; определены mutable и immutable copy boundaries.
- [x] 2026-08-22 04:45 +03:00 — подтверждены чистый исходный worktree, один migration head и
  обязательные backend/frontend/UI verification contracts.
- [x] 2026-08-22 06:10 +03:00 — реализованы backend typed locale maps, packaged bot catalog,
  public locale projection, reversible migration и legacy English backfill.
- [x] 2026-08-22 06:35 +03:00 — реализованы Content/Welcome/offer editors, locale discovery,
  `Accept-Language`, onboarding/Home/operator bot flows и typed frontend contracts.
- [x] 2026-08-22 07:20 +03:00 — targeted coverage, wheel resource check, Changed и Full gates,
  light/dark visual review, final static/diff/docs review завершены.

## Surprises & Discoveries

- Один onboarding flow сейчас смешивает три независимых источника: operator welcome, Python English
  literals и frontend product locale.
- Принятая ADR 0002 описывает payments как не реализованные и разрешает operator copy только для
  identity/welcome, хотя sponsor-offer title/description уже являются runtime operator data; решение
  требует актуализации, а не скрытого расширения settings.
- Standalone migration verifier на macOS не передавал backend `src` в import path, а raw predecessor
  fixture не учитывала обязательные defaults исторической schema. Helper теперь использует absolute
  process-local `PYTHONPATH` и проверяет реальный welcome/offer backfill на predecessor head.

## Decision Log

- 2026-08-22 — не создавать generic CMS или DB overrides по произвольным i18n keys; использовать
  versioned typed semantic slots и product fallback.
- 2026-08-22 — хранить operator content по normalized BCP-47-like locale tags сейчас, хотя UI имеет
  только English; список frontend editor locales выводить из фактических JSON catalogs.
- 2026-08-22 — HTML разрешён только существующему Telegram welcome; новый onboarding/share
  copy остаётся plain text, placeholders валидируются per slot.
- 2026-08-22 — payment state, security/error semantics и destructive/admin copy остаются immutable
  product locale независимо от tone of voice оператора.

## Verification

- Repository root: `pwsh ./scripts/verify.ps1 -Scope Changed` → diff-aware migration/backend/frontend/UI gates.
- Repository root: `pwsh ./scripts/verify.ps1 -Scope Full` → disposable migrations, full backend,
  pinned contracts, frontend unit/build, deterministic Playwright and docs.
- Backend targeted: locale resolver, schemas, provider settings, bot registration/templates,
  sponsor offer serialization and migration runtime inserts.
- Frontend targeted: locale catalog/API/content resolver plus Content/Welcome/Offer editor unit/E2E.
- Browser: onboarding invite/open, Home invite/sponsor and `/admin/settings/content` at
  430x932 and 1280x900, light/dark, console/network/axe/overflow checks.

## Recovery and rollback

Migration downgrade removes only newly added locale-map columns after copying no data back
into legacy fields beyond the deterministic upgrade backfill. Existing scalar welcome and offer
title/description columns remain during this change, so source rollback preserves prior English
behavior. Verification uses only disposable test databases and mocked Telegram/provider boundaries.

## Outcomes & Retrospective

- Provider settings и sponsor offers хранят typed locale maps с English backfill; добавление
  `ru.json` автоматически открывает Russian в Content/Welcome/offer editors и не требует migration.
- Telegram выбирает operator/product copy по `language_code`; Mini App отправляет
  `Accept-Language`, а public contracts возвращают только одну resolved locale без раскрытия всего
  словаря настроек.
- Operator управляет invite/onboarding/referral/sponsor tone of voice и локализованными
  offer title/description. Payment, security, validation, statuses, errors и admin action copy
  остались product-owned.
- `scripts/verify.ps1 -Scope Changed` прошёл: 400 service-free backend, 72 frontend unit,
  lint/typecheck/build, 128/128 mobile Chromium и docs.
- `scripts/verify.ps1 -Scope Full` прошёл: one-head/zero/predecessor/backfill/downgrade/re-upgrade/
  drift migrations, 506 backend, 56 pinned Remnawave contracts, 72 frontend unit, production build,
  128/128 mobile Chromium и docs. Wheel отдельно подтверждён с packaged `flowvy/locales/en.json`.
- Content editor просмотрен в light/dark; Axe и overflow зелёные. Свежий общий gate также выявил и
  исправил старый low-contrast Pulse timeline и transient opacity контраст `ActionBtn` при выходе
  из disabled state.
- Verification gates не вызывали реальные Telegram/provider endpoints. После них по явному запросу
  владельца standard Telegram-enabled dev был пересобран и запущен с штатным integration handshake;
  payment/provider mutations не выполнялись. Commit/push не выполнялись.

Follow-up того же дня удалил ошибочно добавленные Support semantic slots и destination. Источник
истины для этой границы — `plans/completed/2026-08-22-remove-support-content-and-preview.md`.
