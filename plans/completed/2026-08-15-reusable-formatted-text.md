# Переиспользуемое форматирование пользовательского контента

Status: completed
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Администратор сможет оформлять описание sponsor offer полужирным и курсивом текстом, ссылками,
цитатами и списками, видеть результат до сохранения, а Home безопасно покажет это оформление.
Формат и UI-компоненты не будут зависеть от Tribute и смогут без копирования использоваться в
будущем редакторе Broadcast.

## Current state

`SponsorOffer.description` хранит обычную строку до 300 символов. Backend сейчас схлопывает все
пробельные символы, поэтому абзацы и списки сохранить невозможно. Admin использует обычный
`FormFieldTextarea`, а Home вставляет описание как один React text node. Broadcast остаётся
заглушкой без API.

В `frontend/package.json` нет Markdown/rich-text библиотеки. Проверенные 2026-08-15 внешние
контракты:

- Telegram Bot API Formatting options: Bot API поддерживает bold, italic, underline,
  strikethrough, quote, inline links и code через entities/HTML/MarkdownV2;
  <https://core.telegram.org/bots/api#formatting-options>.
- CommonMark задаёт переносимый и однозначный plain-text Markdown contract;
  <https://commonmark.org/>.
- `react-markdown` 10.x следует CommonMark, безопасен по умолчанию без
  `dangerouslySetInnerHTML`, поддерживает allow-list элементов и URL transform;
  <https://github.com/remarkjs/react-markdown>.
- WAI-ARIA APG Toolbar требует именованный toolbar, один tab stop и навигацию стрелками;
  <https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/>.

## Scope

Входит: ограниченный CommonMark contract для описаний, общий editor/renderer, сохранение переводов
строк без потери Markdown, offer admin/Home integration, unit/API/UI regression tests и документация.

Не входит: реализация Broadcast route/API/очереди и отправки Telegram-сообщений; arbitrary HTML,
изображения, таблицы, headings и полноценный document/WYSIWYG editor.

## Acceptance

- Администратор форматирует выделение, ссылки, цитаты и маркированные/нумерованные списки общим
  доступным toolbar и переключается между написанием и preview.
- Сохранённые переносы строк не схлопываются backend; прежний plain text остаётся совместимым.
- Home и admin preview безопасно рендерят только разрешённый набор элементов, игнорируют raw HTML и
  не допускают опасные URL.
- Компоненты и helpers не содержат Tribute/offer-specific API и подходят будущему Broadcast.
- Mobile/desktop, light/dark, keyboard, accessibility, console/network и API failure paths получают
  свежую детерминированную проверку.

## Approach

1. Добавить маленький provider-neutral content layer: Markdown helpers, `FormattedTextEditor` и
   `FormattedText` renderer.
2. Ограничить syntax до paragraph/line break, emphasis, strong, strike, link, quote, ordered и
   unordered list. Не разрешать raw HTML и media.
3. Подключить editor в offer form и renderer в admin preview/Home. Сохранить существующее строковое
   API и БД, изменив только нормализацию whitespace: это backward-compatible и не требует миграции.
4. Добавить unit tests helpers/backend normalization и Playwright flow create/edit/render with
   formatting, затем выполнить change-aware gate и targeted all-project UI matrix.

## Progress

- [x] 2026-08-15 20:16 +03:00 — traced offer model/schema/service/form/Home and confirmed plain-text
  300-character contract plus destructive whitespace collapsing.
- [x] 2026-08-15 20:16 +03:00 — checked official Telegram, CommonMark, renderer-security and WAI
  toolbar contracts; selected constrained CommonMark source.
- [x] 2026-08-15 20:31 +03:00 — implemented the shared editor/renderer/content normalizer and
  connected offer admin, admin cards and Home without changing the persisted string contract.
- [x] 2026-08-15 20:38 +03:00 — added formatter, renderer, backend and four-project browser
  regressions; inspected mobile/desktop light/dark evidence.
- [x] 2026-08-15 20:46 +03:00 — updated durable docs, completed fresh changed/backend/frontend/UI
  gates, reviewed the diff and closed the plan.

## Surprises & Discoveries

- Existing `normalize_copy` uses `" ".join(value.strip().split())`; this silently removes every
  author-entered paragraph/list boundary and must be split into title and formatted-text policies.

## Decision Log

- 2026-08-15 — store constrained CommonMark source in the existing string field. Rejected raw HTML
  because it creates an XSS/sanitization contract; rejected Telegram MarkdownV2 because it couples
  authored content to one delivery channel and has difficult escaping; rejected a library-specific
  WYSIWYG JSON document because it adds a migration and locks persisted data to editor internals for
  a short-copy MVP.
- 2026-08-15 — use an established CommonMark renderer with an explicit element allow-list and no raw
  HTML. The editing toolbar is a thin, reusable textarea enhancement, keeping native mobile text
  editing and the existing VisualViewport behavior.

## Verification

- `E:\mini-app\backend`: focused sponsor schema/service tests and Ruff → Markdown line structure is
  preserved and invalid/oversized input remains rejected.
- `E:\mini-app\frontend`: focused Vitest, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` →
  helpers/types/components pass.
- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Changed` → relevant repository gate passes.
- UI: `/admin/settings/tribute` create/edit preview plus `/` Home render on 430x932, 320x568,
  390x844 WebKit and 1280x900, with light/dark evidence and Axe/console/network/overflow checks.

## Recovery and rollback

The storage contract remains a string and needs no data rewrite. Reverting the shared components and
restoring the old description validator returns plain-text behavior; existing CommonMark remains
legible as plain text. Dependency changes are confined to the frontend lockfile/package manifest.

## Outcomes & Retrospective

Offer descriptions now use a deliberately small CommonMark subset through provider-neutral
`FormattedTextEditor`, `FormattedText` and formatting helpers. The backend preserves line structure,
old plain text remains valid, raw HTML is not rendered, unsafe links are rejected by the renderer,
and the same editor/renderer contract is ready for a future Broadcast composer.

Follow-up `2026-08-15-inline-wysiwyg-formatted-text.md` superseded only the authoring presentation:
the textarea toolbar/preview became an inline Tiptap editor with one permanently visible fixed
toolbar. The
CommonMark storage and safe-rendering decisions remain current.

Fresh verification completed with 22 focused sponsor backend tests, 6 new focused frontend unit
tests, 388 service-free backend tests, 50 frontend unit tests, production lint/type/build, 109 mobile
Playwright scenarios and the focused formatting flow on all four browser projects. The changed gate
was run with E2E skipped only after the fresh full mobile E2E suite had already passed separately.
