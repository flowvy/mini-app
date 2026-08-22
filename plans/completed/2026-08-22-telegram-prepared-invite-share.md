# Telegram prepared invite sharing

Status: completed
Owner: Codex
Started: 2026-08-22
Updated: 2026-08-22

## Purpose

Заменить ограниченный `t.me/share/url` на нативный prepared-message flow Telegram там, где клиент
его поддерживает, чтобы invite share мог содержать безопасный Telegram HTML, Telegram-hosted media,
управляемый link preview и referral CTA button. Существующий share URL остаётся fallback для web и
старых Telegram clients.

## Current state

- Home строит `https://t.me/share/url?url=...&text=...`; этот публичный widget принимает только URL
  и редактируемый plain text.
- `invite_share_text` локализован, но валидируется как plain text; Tone of Voice показывает обычный
  textarea.
- Welcome media уже загружается через bot в Telegram, сохраняет только opaque `file_id` и удаляет
  временное сообщение.
- Backend использует locked `aiogram 3.26.0`; в нём доступны `savePreparedInlineMessage`, cached
  photo/animation/video results, HTML entities, `LinkPreviewOptions` и inline keyboard.

## Scope

Входит локализованный HTML invite message и CTA label, глобальные media/preview/audience настройки,
безопасный admin media upload, authenticated prepared-share endpoint, native `shareMessage()` на
Home, legacy fallback, migration, deterministic tests, UI/runtime verification и документация. Не
входят albums, arbitrary button destinations/callbacks, Story sharing, Rich Messages из Bot API 10.2,
dependency upgrades, реальные массовые отправки, commit или push.

## Acceptance

- Tone of Voice для Telegram share явно отделяет message copy от global delivery settings; variables
  остаются видимыми.
- Message и CTA поддерживают allow-listed Telegram HTML/placeholders; ссылка CTA всегда строится
  backend из текущего invite, а не принимается от frontend/admin.
- Media поддерживает none/photo/GIF animation/MP4 video через cached Telegram `file_id`; upload
  ограничен MIME/размером и не сохраняет файл автоматически до общего Save.
- Text-only share поддерживает auto/hidden/small/large preview по referral URL; media share не
  обещает отдельный link preview.
- Audience flags передаются в `savePreparedInlineMessage`; user chats остаются включены и нельзя
  сохранить конфигурацию без единой разрешённой аудитории.
- Capable Telegram client получает prepared ID и открывает `shareMessage`; unsupported/browser
  использует прежний `t.me/share/url`. Decline не показывается как ошибка, реальные failures дают
  persistent action feedback.
- Backend revalidates active current user/invite immediately before Bot API call, has a bounded
  timeout, returns safe stable errors and never logs token/payload.

## Approach

1. Добавить reversible linear migration и typed settings/content contracts.
2. Переиспользовать bounded upload adapter для отдельного invite-media endpoint.
3. Ввести request-scoped prepared invite service around `Bot.save_prepared_inline_message` и
   authenticated `/api/me/invite/prepared-share`.
4. Расширить Tone of Voice существующими settings primitives и Telegram HTML editor.
5. Подключить SDK `shareMessage` с legacy fallback и action-error handling.
6. Обновить fixtures/tests/docs, выполнить focused, Changed, Full и visual/runtime checks.

## Progress

- [x] 2026-08-22 — прочитаны текущие settings/content/invite/media boundaries, locked SDK/aiogram и
  официальные Telegram contracts.
- [x] 2026-08-22 — реализованы backend schema, reversible migration, bounded media upload и
  authenticated prepared-share endpoint с deterministic tests.
- [x] 2026-08-22 — реализованы Tone of Voice authoring controls, native `shareMessage()` flow,
  legacy fallback и browser regressions.
- [x] 2026-08-22 — просмотрены light/dark UI evidence, пройдены focused/Changed/Full gates,
  пересобран standard dev и выполнен финальный diff review.

## Surprises & Discoveries

- `LinkPreviewOptions.url` позволяет выбрать referral URL явно, поэтому raw URL не обязан появляться
  в message copy рядом с CTA button.
- Prepared message содержит ровно один `InlineQueryResult`; album/media group потребовал бы другой
  продуктовый flow и остаётся вне scope.

## Decision Log

- 2026-08-22 — хранить только cached Telegram `file_id`, а не публичные media URLs.
- 2026-08-22 — destination единственной referral CTA генерируется server-side; arbitrary URLs и
  callbacks не добавлять.
- 2026-08-22 — использовать базовые prepared inline results из pinned aiogram, не вводить upgrade
  ради новых Rich Messages.
- 2026-08-22 — сохранить `t.me/share/url` как capability fallback без изменения referral semantics.

## External contract evidence

- Telegram share widget, accessed 2026-08-22: https://core.telegram.org/widgets/share
- Mini App `shareMessage`, accessed 2026-08-22: https://core.telegram.org/bots/webapps
- `savePreparedInlineMessage`, `InputTextMessageContent`, `LinkPreviewOptions`, inline keyboard and
  inline result media contracts, accessed 2026-08-22: https://core.telegram.org/bots/api

## Verification

- Backend: focused settings/content/media/prepared-share/auth suites passed; Ruff passed; Full ran
  523 backend tests and 56 pinned Remnawave contracts successfully.
- Migration: `verify-migrations.ps1` passed zero-to-head, predecessor upgrade, downgrade/re-upgrade,
  one-head and model-drift checks for `e0f1a2b3c4d5`.
- Frontend: lint, typecheck, 77 unit tests and production build passed; focused prepared-share and
  Tone of Voice scenarios passed.
- UI: 430x932 and 1280x900 light/dark evidence was inspected; the affected editor/share states had
  no horizontal overflow, serious Axe finding, unexpected console error or network request.
- Root: fresh Changed and Full gates passed; Full included 146/146 repository Playwright scenarios.
- Runtime: standard Telegram-enabled dev was rebuilt and upgraded to the new head while preserving
  volumes. Local `5173`/`8001`/`4173`, backend `/api/health` and `/api/ready`, and public
  root/health/ready returned `200`; public debug returned `404`. Public and local preview served
  `index-DBKIP-P-.js`, PostgreSQL/Redis were healthy, one system cloudflared remained, and
  `telegram_main_app_ready` was present without startup error markers.

## Recovery and rollback

Changes remain source-only until explicit commit/push authorization. Migration downgrade drops only
new nullable/defaulted settings and localized CTA data after returning content JSON to its prior
shape. Tests use mocked Bot API and disposable databases; no real Telegram share/media/provider call
is authorized by this plan.

## Outcomes & Retrospective

Capable Telegram clients now receive a short-lived prepared message with safe HTML, one
server-generated referral CTA, optional cached photo/GIF/video, explicit link-preview behavior and
audience flags. Older clients and browsers retain the editable `t.me/share/url` path. The settings
remain inside the selected Telegram share context while copy and global delivery controls are
visually separated; contextual variables stay visible. No real share, upload, provider/payment
mutation, commit or push was performed.
