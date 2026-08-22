# Универсальный Telegram entry flow

Status: completed
Owner: Codex
Started: 2026-08-22
Updated: 2026-08-22

## Purpose

Сделать бот нейтральной точкой запуска Flowvy: `/start` всегда присылает одно main-сообщение с
кнопкой Mini App, а режим регистрации, ручной invite и referral обрабатываются только внутри Mini
App. Referral-ссылка сначала создаёт чат с ботом через `start`, затем переносит код в подписанный
Main Mini App `start_param` через кнопку сообщения.

## Current state

- `/start` регистрирует неизвестного пользователя в `open`, а в `invite_only` отправляет отдельный
  prompt; private text handler принимает invite-коды в чате.
- До этой задачи публичная referral-ссылка сразу открывала Main Mini App как
  `?startapp=ref_<code>`.
- Frontend автоматически вызывает no-body `/api/onboarding/redeem-launch` для подписанного
  `initData.start_param` в обоих режимах; повторный redeem зарегистрированного пользователя не меняет
  attribution.
- `Settings > Content` содержит больше не нужные bot invite-only copy и media; Welcome уже хранит
  нейтральное Telegram message, media и button label.

## Scope

Входит Telegram `/start` handler, Main Mini App referral link contract, message button construction,
удаление chat invite-code flow и устаревших Content controls/data, backend/frontend tests,
документация, migration и runtime rebuild. Не входят изменение registration policy, access profile,
Remnawave provisioning semantics, реальные provider/payment mutations и публикация Git.

## Acceptance

- Любой `/start` отправляет одинаковое locale-resolved Welcome message и не создаёт пользователя.
- `?start=ref_<code>` отправляет тот же message; его кнопка открывает Main Mini App с тем же строгим
  `startapp`, а обычная кнопка остаётся обычным Web App launch.
- Повторное открытие referral-кнопки зарегистрированным пользователем не меняет `invited_by_id`.
- Новый пользователь видит `open` registration CTA либо `invite_only` code input в Mini App;
  signed referral продолжает работать в обоих режимах.
- `Settings > Content` больше не предлагает bot invite-only copy/media; Welcome остаётся единственным
  Telegram message editor.
- Fresh migration, backend/frontend, Playwright, Full verification и rebuilt standard dev runtime
  проходят; local/public readiness и public debug boundary проверены без вывода секретов.

## Approach

1. Зафиксировать официальный `start`/`startapp` contract и текущие тестовые границы.
2. Разделить link builders для share (`start`) и Main Mini App launch (`startapp`), передавать launch
   URL только в Welcome sender.
3. Упростить bot handlers до Welcome-only `/start` и удалить private invite redemption.
4. Удалить bot invite-only Content schema/UI/media и очистить persisted settings новой migration.
5. Обновить deterministic backend/frontend/UI tests и документы.
6. Выполнить Changed и Full gates, визуально проверить затронутые states, пересобрать standard dev и
   подтвердить runtime endpoints.

## Progress

- [x] 2026-08-22 — исходный `dev` чист, текущие bot/referral/onboarding/Content contracts и locked
  `aiogram 3.26.0` прочитаны.
- [x] 2026-08-22 — реализовать backend/link/content contract и migration.
- [x] 2026-08-22 — обновить frontend Content surface и regression tests.
- [x] 2026-08-22 — обновить docs и выполнить fresh verification.
- [x] 2026-08-22 — пересобрать и проверить standard Telegram-enabled dev runtime.

## Surprises & Discoveries

- Текущий `RegistrationService.redeem` возвращает существующего пользователя до проверки invite,
  поэтому повторный referral launch уже идемпотентен и не меняет attribution.
- После удаления регистрации из bot handler Redis lease перестал быть security boundary: при его
  недоступности безопаснее отправить Welcome без дедупликации, чем снова показывать
  registration-specific error.

## Decision Log

- 2026-08-22 — использовать два нативных Telegram deep link: публичный `start` создаёт bot chat,
  кнопка сообщения использует `startapp` для подписанного Mini App context. Не добавлять pending
  referral storage или собственные frontend tokens.
- 2026-08-22 — Welcome остаётся единственным bot message content; registration-specific copy живёт
  только в Mini App onboarding.

## External contract evidence

- Telegram bot deep links, accessed 2026-08-22: https://core.telegram.org/bots/features#deep-linking
- Telegram Main Mini App links and `start_param`, accessed 2026-08-22:
  https://core.telegram.org/bots/webapps#launching-the-main-mini-app

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/backend`: focused bot, message sender, Telegram link,
  provider settings, migration and auth tests.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: lint, typecheck, unit, production build and
  focused registration/Content Playwright states with light/dark evidence.
- Repository root: `pwsh -File ./scripts/verify.ps1 -Scope Changed`, then `-Scope Full`.
- Runtime: standard `dev-up.ps1` Telegram-enabled named-Tunnel build; local frontend/backend/preview,
  public root/health/ready `200`, public debug `404`, `telegram_main_app_ready` marker.

## Recovery and rollback

Changes remain source-only until the user separately authorizes commit/push. Migration downgrade
restores compatible nullable media columns, но удалённые operator copy и media metadata не
восстанавливаются и являются намеренно устаревшими. Verification uses mocks/disposable test databases and
must not contact real Telegram/provider/payment targets. Runtime restart may contact only the already
authorized standard dev bot/tunnel and must avoid a second poller or connector.

## Outcomes & Retrospective

- Bot chat стал стабильной нейтральной точкой входа; registration-specific decisions перенесены в
  Mini App без нового pending-referral storage.
- Focused: 76 backend и 30 mobile Chromium tests. Changed: 410 backend, 77 unit, production build и
  144/144 Playwright. Full: migration/drift, 518 backend, 56 pinned Remnawave contracts, 77 unit,
  build, 144/144 Playwright и docs.
- Content/open/invite screenshots просмотрены в light/dark без visual, overflow или serious Axe
  regressions.
- Standard Telegram-enabled dev пересобран и запущен: local `5173`/`8001`/`4173`, public
  root/health/ready — `200`, public debug — `404`, asset `index-DhYPq-8q.js` совпадает,
  `telegram_main_app_ready` присутствует, Docker healthy и системный cloudflared остался один.
- Commit/push и provider/payment mutations не выполнялись.
