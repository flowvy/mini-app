# Inline WYSIWYG для форматируемого текста

Status: completed
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Заменить Markdown-like textarea/preview в sponsor offer на переиспользуемый WYSIWYG: постоянный
toolbar форматирует текст, а результат виден сразу. Persisted contract остаётся
ограниченным CommonMark и пригодным для будущего Broadcast.

## Current state

Общий `FormattedTextEditor` показывает постоянный toolbar над inline WYSIWYG. Home/admin безопасно
рендерят общий CommonMark subset через `FormattedText`; backend сохраняет line structure.

Проверенные 2026-08-15 официальные контракты:

- Tiptap React 3.x документирует fixed menu как постоянный `<div>` с кнопками над editor:
  <https://tiptap.dev/docs/editor/getting-started/style-editor/custom-menus>.
- WAI-ARIA toolbar pattern задаёт accessible name, один roving tab stop и arrow-key navigation:
  <https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/>.
- StarterKit включает bold/italic/strike/link/lists/blockquote, а CharacterCount ограничивает
  author-visible text: <https://tiptap.dev/docs/editor/extensions/functionality/starterkit> и
  <https://tiptap.dev/docs/editor/extensions/functionality/character-count>.
- Tiptap Markdown выполняет двусторонний Markdown ↔ editor document conversion, но помечен beta:
  <https://tiptap.dev/docs/editor/markdown>.

## Scope

Входит: общий inline WYSIWYG, fixed toolbar, immediate formatting, link editing, list/quote
controls, Markdown import/export, character limit, offer integration regression and docs.

Не входит: изменение native iOS/Telegram selection menu (web platform не позволяет добавлять туда
app-specific actions), реализация Broadcast route/API/transport serializer, media/headings/tables.

## Acceptance

- Toolbar постоянно виден над editor и не зависит от selection или pointer type.
- Bold/italic/strike/link применяются сразу; lists/quote доступны как block actions.
- Existing CommonMark загружается и сохраняется без потери разрешённой семантики; Home renderer не
  меняет security contract.
- Editor provider-neutral и принимает configurable limit/placeholder, пригоден для Broadcast.
- Mobile/small-mobile/WebKit/desktop, light/dark, keyboard, overflow, Axe, console/network проходят.

## Progress

- [x] 2026-08-15 21:02 +03:00 — traced current shared editor and official Tiptap/WAI-ARIA
  contracts; selected pinned Tiptap plus CommonMark persistence.
- [x] 2026-08-15 21:08 +03:00 — implemented shared WYSIWYG, fixed toolbar, inline link editor,
  character limit, lazy admin loading and focused unit/backend/browser coverage.
- [x] 2026-08-15 21:10 +03:00 — inspected deterministic light/dark mobile, small-mobile, WebKit and
  desktop evidence; completed fresh gates and durable documentation.

## Decision Log

- 2026-08-15 — do not emulate the OS context menu or build contenteditable/selection positioning
  manually. Use Tiptap's documented fixed-menu pattern, styled with Flowvy tokens and WAI-ARIA
  toolbar keyboard semantics.
- 2026-08-15 — keep constrained CommonMark as the persisted interchange format. Pin the beta
  Markdown bridge and protect the exact supported subset with deterministic round-trip tests instead
  of storing editor-specific JSON or unsafe HTML.

## Verification

- `E:\mini-app\frontend`: Biome checked 218 files, typecheck passed, 49/49 Vitest passed and the
  production build passed. Tiptap is a separate lazy-loaded admin chunk.
- `E:\mini-app\backend`: focused sponsor suite passed 23/23; changed gate passed Ruff and 389
  service-free tests.
- UI: focused new authoring/render scenario passed 4/4 across 430x932, 320x568, iOS WebKit and
  desktop. Full mobile suite passed 109/109. Light/dark screenshots were inspected; overflow,
  Axe, console and network guards passed.
- `E:\mini-app`: `scripts\verify-docs.ps1` and `scripts\verify.ps1 -Scope Changed -SkipE2E` passed.

## Recovery and rollback

The API/database string remains CommonMark. The previous textarea editor can be restored without a
data migration; renderer and backend normalization remain compatible.

## Outcomes & Retrospective

Offer copy now behaves like an inline rich-text editor: one fixed toolbar is always visible and
formatting is visible immediately. The app does not attempt to alter the native OS menu.
The persisted string remains constrained CommonMark and the shared safe renderer remains unchanged,
so the same content boundary can be reused by Broadcast without storing Tiptap-specific JSON.

Follow-up after real iOS evidence: pointer detection, conditional triggers and contextual app popups
were removed. Touch, keyboard and fine pointer all use the same permanently visible toolbar above
the editor; the platform Cut/Copy/Paste/Format menu remains untouched.
