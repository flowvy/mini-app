# Глобально ограничить подписи сегментов и убрать touch-focus ring после dialog

Status: completed
Owner: Пятница
Started: 2026-08-25
Updated: 2026-08-25

## Purpose

Исправить четыре замечания в админском UI: локализовать `API key`, убрать вводный текст Tribute,
сократить подпись режима срока до `Авто`, не допускать выхода текста из любого `SegmentedControl`
и не оставлять touch-пользователю зелёный focus ring на trigger после закрытия общего dialog. При
этом keyboard focus и возврат фокуса должны остаться доступными.

## Current state

- `frontend/src/components/ui/segmented-control.module.css` уже задаёт `min-width: 0`, но не
  ограничивает inline text через `overflow`, `white-space` и `text-overflow`; длинная подпись может
  рисоваться поверх соседнего сегмента.
- `EditorDialog` и fallback `ConfirmDialog` возвращают DOM focus trigger через `focus()`. После
  touch-open в Telegram iOS WebView trigger может снова совпасть с `:focus-visible` и получить
  зелёную рамку.
- WAI-ARIA APG требует возврата focus к invoker после закрытия dialog; возврат нельзя заменять
  безусловным `blur()`.
- MDN документирует `focus({ focusVisible: false })` и `:focus-visible` как механизм разделения
  pointer и keyboard индикации. Для совместимости с WebView нужен CSS fallback на самом
  восстановленном trigger.

## Scope

Входит: locale каталоги RU/EN, Tribute hub, общий `SegmentedControl`, общая логика возврата focus
для `EditorDialog` и fallback `ConfirmDialog`, детерминированные UI/regression tests.

Не входит: изменение backend/API, скрытие focus ring у keyboard-навигации, изменение focus у
action errors или native text inputs во время редактирования.

## Acceptance

- RU показывает `API-ключ`, Tribute hub не показывает удалённую вводную фразу ни в RU, ни в EN.
- Режим срока показывает `Авто` и не выходит из сегмента на 320px; искусственно длинная подпись
  общего `SegmentedControl` также остаётся внутри своей геометрии.
- После touch-open/touch-close editor trigger сохраняет DOM focus, но не имеет видимой зелёной
  рамки. После keyboard-open/Escape trigger снова focused и ring остаётся видимым.
- Поведение подтверждено Chromium/WebKit, light/dark, 320x568 и 430x932 без overflow, Axe,
  console/page/network ошибок.

## Approach

1. Удалить Tribute intro leaf и его render, обновить точные locale assertions.
2. Ограничить текст в shared segmented button documented CSS-сочетанием `min-width: 0`,
   `overflow: hidden`, `white-space: nowrap`, `text-overflow: ellipsis`.
3. Добавить shared focus-return helper: запомнить, был ли trigger keyboard-visible до dialog;
   восстановить DOM focus с соответствующим `focusVisible` и WebView fallback attribute до blur.
4. Перевести оба shared dialog shell на helper и покрыть touch/keyboard возврат focus.
5. Выполнить change-aware frontend и focused UI verification, инспектировать screenshots, затем
   пересобрать публичный preview.

## Progress

- [x] 2026-08-25 20:45 +03:00 — исходные locale, segmented CSS и оба dialog shell прослежены.
- [x] 2026-08-25 20:45 +03:00 — сверены MDN `:focus-visible`, `focus()` и CSS overflow, WAI-ARIA dialog focus return.
- [x] 2026-08-25 20:50 +03:00 — locale/render, shared segmented overflow и modality-aware focus return реализованы; regression coverage добавлен.
- [x] 2026-08-25 20:57 +03:00 — focused four-project matrix, Changed gate, production build и standard dev runtime прошли.

## Surprises & Discoveries

- Проблема focus ring возникает не из отсутствия `:focus-visible`: он уже используется глобально.
  Programmatic focus chain dialog → trigger наследует видимую эвристику WebView, поэтому простой
  переход с `:focus` на `:focus-visible` ничего не исправит.
- Старые tracked process ids были уже переиспользованы; fail-closed `dev-down.ps1` корректно
  отказался завершать чужой PID. Повторные штатные проходы очистили только stale markers, после
  чего standard dev поднялся без force-kill и без удаления volumes.

## Decision Log

- 2026-08-25 — сохраняем DOM focus return согласно WAI-ARIA; безусловный `blur()` отклонён.
- 2026-08-25 — overflow исправляется в shared `SegmentedControl`, а `Авто` остаётся продуктовой
  компактной подписью, не заменой layout fix.

## Verification

- `frontend`: `pnpm lint`, `pnpm typecheck`, targeted `pnpm exec vitest run ...`, `pnpm build`.
- `frontend`: focused Playwright на registration/access, Tribute и shared segmented states во всех
  четырёх проектах; Axe, overflow, focus, screenshots light/dark.
- Runtime: публичный root `200`, новый asset содержит принятые RU/EN строки и не содержит удалённый intro.

## Recovery and rollback

Изменения frontend-only и обратимы удалением helper/CSS declarations и возвратом locale leaves.
Никакие данные, provider или Telegram API не изменяются.

## Outcomes & Retrospective

- Принятые тексты отображаются из locale catalog: RU `API-ключ`, RU `Авто`; Tribute intro leaf и
  render удалены в обоих языках.
- Forced-long label regression подтвердил, что общий сегмент клипует только собственный текст и не
  создаёт page overflow. RU access route дополнительно прошёл light/dark на требуемых viewport.
- Pointer-open dialog после close возвращает focus trigger без ring; keyboard-open/Escape возвращает
  тот же trigger с видимым ring. Поведение прошло Chromium, iOS WebKit и desktop; оба shared dialog
  shell используют один helper.
- `scripts/verify.ps1 -Scope Changed`: 440 service-free backend, 109 frontend unit, production build,
  222/222 mobile Playwright и docs прошли. Focused all-project matrix: 20/20 после повторения одной
  test-navigation race в iOS WebKit.
- Standard Telegram dev активен: local `5173`, backend ready/health `8001`, preview `4173`, public
  root/health — `200`; public debug — `404`, PostgreSQL/Redis healthy, `telegram_main_app_ready` есть.
- Live Swiftgram iOS остаётся ручной acceptance-проверкой реальной WebView-эвристики. Commit и push
  не выполнялись.
