# Удаление Support content и dark-preview пользовательских поверхностей

Status: complete
Owner: Codex
Started: 2026-08-22
Updated: 2026-08-22

## Purpose

Вернуть `/support` к product-owned заглушке `Coming Soon`, полностью убрать Support из provider
Content contract и показать владельцу тёмные screenshots всех оставшихся пользовательских
поверхностей, которые меняются через Content settings.

## Current state

- `/support` недавно получил operator title/description/button и `supportUrl`, хотя до этого был
  намеренно оставлен локализованной заглушкой.
- Support fields проходят через JSON locale-map, provider settings schema/service, branding and
  onboarding projections, frontend Content editor, Support renderer, types, fixtures and tests.
- Current draft migration `a6b7c8d9e0f1` re-adds `support_url`; local dev database уже применил её и
  head `b7c8d9e0f1a2`, поэтому removal должен корректно работать и для fresh DB, и для текущего dev.
- Остальные Content surfaces: Telegram invite-only prompt, open/invite-only onboarding, Home invite
  card и Home sponsor no/base access states.

## Scope

Входят removal runtime/schema/UI/tests/docs для Support provider content и destination; сохранение
route/tab/header `/support` с единственным Coming Soon state; migration compatibility для уже
применённого local draft; deterministic dark screenshots Content editor и всех оставшихся
Mini App surfaces.

Не входят удаление самой `/support` route, изменение product navigation, Russian catalog, реальная
отправка Telegram сообщений, provider/payment mutations, commit или push.

## Acceptance

- Content editor и backend capabilities не содержат Support fields или URL.
- Public/admin/onboarding/settings API не проецируют `supportUrl`; frontend types/fixtures его не
  ожидают.
- `/support` всегда показывает локализованную заглушку без operator text и внешней кнопки.
- Fresh/current migration paths сходятся к модели без `support_url` и проходят drift checks.
- Dark screenshots показывают Content editor, invite/open onboarding, Home invite and sponsor
  no/base states на Telegram-like viewport без overflow/console/network/Axe ошибок.

## Approach

1. Проследить Support contract end-to-end и удалить runtime fields от schema до renderer.
2. Скорректировать draft migration и добавить совместимый cleanup head для уже применённого dev.
3. Обновить deterministic tests, docs and Content capabilities.
4. Снять и вручную проверить dark evidence; затем выполнить свежий Changed/Full gate по риску.

## Progress

- [x] 2026-08-22 — traced Support through backend/frontend/migrations/tests/docs and confirmed it is
  a regression from the prior Coming Soon decision.
- [x] 2026-08-22 — removed provider-owned Support contract and added migration compatibility.
- [x] 2026-08-22 — generated and inspected dark screenshots for all remaining Content surfaces.
- [x] 2026-08-22 — fresh Full verification passed; rebuild and standard dev runtime acceptance
  completed at migration head `c8d9e0f1a2b3`.

## Surprises & Discoveries

- Historical migration `g7h8i9j0k1l2` already removed the old quick-link `support_url`; the current
  uncommitted locale migration accidentally reintroduced it.

## Decision Log

- 2026-08-22 — keep `/support` route/tab for navigation stability, but make its page product-only
  Coming Soon with no data dependency.
- 2026-08-22 — preserve current local data/volumes; use a compatibility migration rather than reset
  the already-upgraded development database.

## Verification

- Repository root: `pwsh ./scripts/verify.ps1 -Scope Changed`; Full required because migration and
  backend/frontend contracts change.
- Frontend: focused Support and operator-content Playwright plus dark screenshot scenarios at
  430x932; 320px overflow where applicable.
- Runtime: rebuild standard Telegram dev, local/public ready 200, public debug 404 and current asset.

## Recovery and rollback

The compatibility migration removes only the accidentally reintroduced nullable Support column.
The existing locale JSON may retain ignored legacy keys, but no runtime schema reads or publishes
them. Docker volumes remain preserved; no real integration mutation is used for verification.

## Outcomes & Retrospective

- Support semantic fields, destination, capabilities, public/admin projections, frontend editor,
  types and fixtures were removed; historical migrations remain intact for database reproducibility.
- `/support` is a product-owned localized `Coming Soon` stub and ignores stale provider payloads.
- Seven deterministic dark screenshots were inspected: Content settings, invite/open onboarding,
  Home invite, sponsor no/base access and Support stub. All focused cases passed Axe and overflow
  guards at 430x932.
- `pwsh ./scripts/verify.ps1 -Scope Full` passed migration one-head/zero/previous-head/downgrade/
  re-upgrade/drift, Ruff, 520 backend tests, 56 pinned contracts, 73 frontend unit tests, production
  build, 140/140 mobile Chromium Playwright and docs.
- Standard Telegram dev was rebuilt with preserved volumes at head `c8d9e0f1a2b3`; local/public
  runtime acceptance and final asset identity passed. No provider/payment mutation, commit or push
  was performed.
