# Контекстные редакторы provider content без перегруженных страниц

Status: complete
Owner: Codex
Started: 2026-08-22
Updated: 2026-08-22

Follow-up: Support semantic slots and destination were removed the same day; `/support` remains a
product-owned `Coming Soon` stub. See `plans/completed/2026-08-22-remove-support-content-and-preview.md`.

## Purpose

Дать провайдеру подходящий способ авторинга для каждого канала: безопасный CommonMark для
длинного Mini App copy, Telegram HTML/custom emoji/media для bot messages и копируемые template
variables для всех полей, которые их поддерживают. English остаётся первым locale, а тот же
persisted contract должен без schema redesign принять будущий Russian locale.

## Current state

- Create/Edit Offer уже использует ограниченный Tiptap/CommonMark editor и безопасный renderer.
- Welcome Message отправляется aiogram 3.26.0 с глобальным `ParseMode.HTML`, поддерживает global
  photo/animation upload и сырой `<tg-emoji>`, но UI не даёт formatting controls или копируемые
  template variables.
- Invite-only bot prompt хранится по locale, но handler HTML-экранирует весь operator text и не
  поддерживает media.
- Остальные длинные provider descriptions отображаются в Mini App как plain text.
- Supported placeholders валидируются backend, но admin UI сообщает о них только через отдельные
  placeholders и заставляет вводить token вручную.

## Scope

Входят reusable template disclosure/copy control; Telegram HTML editor; CommonMark authoring и
rendering для применимых Mini App descriptions; `appName` template для offer presentation;
invite-only bot media upload/storage/delivery; deterministic backend/frontend/browser coverage;
документация официального Telegram contract и UX-решения.

Не входят generic CMS, произвольный HTML в Mini App, formatting для titles/button labels/share URL,
локализация product UI на Russian, реальная отправка Telegram/provider requests, commit или push.

## Acceptance

- Каждое поддерживающее templates поле показывает только свои variables в collapsed disclosure;
  token копируется одной кнопкой с accessible feedback.
- Mini App descriptions используют тот же allow-listed CommonMark contract и безопасный renderer,
  что offer description; titles/actions/share text остаются plain.
- Welcome и invite-only Telegram prompt имеют HTML formatting controls и custom emoji insertion;
  backend разрешает только Telegram-supported markup и безопасные attributes.
- Invite-only prompt может иметь global photo/animation; media error сохраняет text fallback.
- Страницы остаются компактными в `320x568`, `430x932` и `1280x900`, light/dark, без overflow,
  console/network/accessibility ошибок.
- Fresh migration, backend, frontend, build и выбранные Playwright gates проходят.

## Approach

1. Зафиксировать Telegram Bot API/aiogram limits и disclosure semantics в plan/docs.
2. Ввести backend content capabilities, Telegram HTML validator, CommonMark-marked semantic fields,
   bot invite media columns/migration и MessageSender delivery.
3. Добавить reusable collapsed template picker, Telegram editor и применить контекстные редакторы.
4. Рендерить CommonMark только в перечисленных Mini App description slots и template-resolve offer.
5. Расширить unit/contract/E2E coverage, выполнить fresh gates и визуальную проверку.

## Progress

- [x] 2026-08-22 — traced current Offer, Welcome, bot invite, localized settings, public renderers,
  upload boundary and pinned aiogram/Tiptap versions.
- [x] 2026-08-22 — verified official Telegram HTML/custom emoji, message/caption limits and WAI-ARIA
  disclosure semantics.
- [x] 2026-08-22 — implemented backend contracts, migration and deterministic tests.
- [x] 2026-08-22 — implemented compact frontend authoring controls and public rendering.
- [x] 2026-08-22 — fresh Changed/Full verification passed; Content, Welcome and Offer evidence was
  inspected at 320px, 430px and desktop in light/dark.

## Source provenance

- Telegram Bot API 10.2, formatting/custom emoji and send limits, official docs,
  <https://core.telegram.org/bots/api#formatting-options>, accessed 2026-08-22.
- Telegram Bot API 10.2, `sendMessage`/`sendPhoto`/`sendAnimation`, official docs,
  <https://core.telegram.org/bots/api#sendmessage>, <https://core.telegram.org/bots/api#sendphoto>,
  <https://core.telegram.org/bots/api#sendanimation>, accessed 2026-08-22.
- W3C WAI-ARIA Authoring Practices, Disclosure Pattern,
  <https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/>, accessed 2026-08-22.
- Locked local integration: aiogram 3.26.0 and Tiptap 3.30.1 source/signatures, inspected
  2026-08-22.

## Surprises & Discoveries

- Bot factory already sets `ParseMode.HTML`, so Welcome markup works implicitly; invite prompt
  deliberately escapes it. The new contract must make parsing explicit at the sender boundary.
- Telegram text allows 4096 characters after parsing, but photo/animation captions allow 1024;
  both configurable bot messages may carry media and therefore use the caption-safe visible limit.
- Telegram requires a fallback emoji inside custom emoji markup and restricts bot custom emoji use
  to documented entitlement cases; the UI must explain the owner-Premium condition.

## Decision Log

- 2026-08-22 — use fixed Telegram HTML rather than MarkdownV2 because custom emoji has an official
  `<tg-emoji emoji-id>` representation and existing Flowvy bot defaults already use HTML.
- 2026-08-22 — keep template help collapsed by default using the WAI-ARIA disclosure pattern;
  copy buttons live inside the expanded region and never occupy the default page rhythm.
- 2026-08-22 — do not add formatting to Telegram share text or control labels: those target APIs are
  plain strings and exposing markup would be misleading.
- 2026-08-22 — media remains global per semantic bot message while text remains locale-keyed; media
  itself has no language semantics and this avoids duplicating uploads when Russian is added.

## Verification

- `pwsh ./scripts/verify.ps1 -Scope Changed`: 415 backend service-free, 73 frontend unit,
  production build, 132/132 mobile Chromium and docs passed.
- `pwsh ./scripts/verify.ps1 -Scope Full`: one-head/fresh upgrade/downgrade/re-upgrade/drift,
  521 backend, 56 pinned Remnawave contracts, 73 frontend unit, production build, 132/132 mobile
  Chromium and docs passed.
- Focused backend Telegram/settings/sponsor matrix: 98/98 passed.
- Focused Content/Offer Playwright across 430px, 320px and desktop Chromium: 159/159 passed;
  separate Welcome light/dark evidence matrix: 6/6 passed.
- Visual evidence for Content, Welcome and Offer was inspected in light/dark without horizontal
  overflow or serious/critical Axe findings.
- Standard dev rebuilt at migration head `b7c8d9e0f1a2`; local 5173/8001/4173 and public
  root/health/ready returned 200, public debug returned 404, local/public asset
  `index-Ba0U6KR-.js` matched and `telegram_main_app_ready` was logged.

## Recovery and rollback

The new migration adds nullable invite-media columns and raises sponsor description source headroom
from 300 to 2 000 characters while preserving its 300-visible-character API rule. Downgrade removes
the media columns and restores the old database constraint; it requires descriptions to remain
compatible with the old 300-source-character limit. Existing welcome and locale maps remain. Upload
tests mock Telegram and browser tests mock FastAPI. No real provider or payment mutation is part of
verification.

## Outcomes & Retrospective

Channel-specific authoring is now explicit instead of generic: Telegram messages use a compact HTML
toolbar/custom emoji/media contract, Mini App descriptions use safe CommonMark, and controls that
cannot render formatting stay plain. One collapsed template disclosure per section was materially
calmer than repeating help under every field; its field scopes preserve discoverability. Canonical
capabilities come from backend so future Russian content reuses the same typed contract without
duplicating tokens in UI. No real Telegram/provider/payment mutation, commit or push was performed.
