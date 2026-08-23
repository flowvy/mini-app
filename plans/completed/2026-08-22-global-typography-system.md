# Единая типографическая система Flowvy

Status: completed
Owner: Пятница
Started: 2026-08-22
Updated: 2026-08-22

## Purpose

Заменить накопившиеся несвязанные размеры текста во всём React-интерфейсе Flowvy на одну
семантическую систему. Заголовки, основной текст, подписи, метаданные, кнопки и все виды полей
должны получать размер из глобальных tokens по роли компонента, а не из локального числа или
browser-specific условия.

## Current state

- В `frontend/src` используются как минимум размеры `8`, `9`, `9.5`, `10`, `10.5`, `11`, `12`,
  `12.5`, `13`, `13.5`, `14`, `15`, `16`, `18`, `20` и `22px`, а также несколько `font` shorthands.
- Plain input, Telegram HTML textarea, CommonMark contenteditable, compact link/emoji inputs,
  onboarding и search имеют разные локальные правила. Старый неиспользуемый `InputField` и
  `.fv-input` дублируют ещё один вариант.
- Действующий Playwright test отдельно ожидал `16px` value и `13px` placeholder на touch, то есть
  воспроизводимо закреплял визуальное расхождение со скриншотов владельца.
- До уточнения scope начата частичная form-control правка. Она принадлежит этой задаче, но должна
  быть переработана в invariant global type scale без `pointer`, Safari zoom threshold или viewport
  ограничений.
- Исходная ветка `dev` была чистой и опережала `origin/dev` на два существующих commit. Commit и
  push этой задачей не авторизованы.

## Scope

Входит полный аудит `font-size`, `font` shorthand и inline `fontSize` в `frontend/src`, создание
глобальных semantic tokens, миграция всех React pages/components, удаление мёртвых дублирующих input
styles, deterministic regression coverage, light/dark visual review на mobile, iOS WebKit и desktop,
а также обновление `docs/PROJECT_STATE.md`.

Не входят изменение шрифта Geist, текстов локализации, backend/API, layout spacing вне необходимой
адаптации текста, запрет user zoom, viewport meta, JavaScript keyboard/viewport logic и реальные
Telegram/provider вызовы.

## Acceptance

- В `frontend/src` нет raw `font-size` или size-компонента `font` shorthand вне файла tokens;
  исключения допустимы только для относительного `em` внутри code formatting и должны быть объяснены.
- Все текстовые роли используют небольшой документированный набор semantic tokens.
- Input value и placeholder, plain textarea, Telegram editor и CommonMark editor имеют одинаковый
  control token во всех pointer/browser modes; нет media query, transform или viewport ограничения
  ради Safari focus zoom.
- Все user/admin routes сохраняют читаемую иерархию, не имеют horizontal overflow и проходят
  deterministic console/network/Axe guards в light/dark на требуемых viewports.
- Fresh frontend lint, typecheck, unit, production build, focused all-project Playwright и Full
  repository verification проходят; каждый пропущенный gate явно указан.

## Approach

1. Построить полный selector/component inventory и присвоить каждому тексту роль, не сводя миграцию
   к механической замене близкого числа.
2. Проверить официальные Apple/Web/CSS accessibility guidance: semantics, text scaling, zoom и
   placeholder behavior. Зафиксировать только подтверждённые ограничения; не кодировать эвристики.
3. Добавить semantic type tokens в `styles/tokens.css`, затем последовательно мигрировать shared UI,
   content editors, layout/user pages и admin surfaces.
4. Добавить static contract test против новых raw sizes и Playwright assertions для representative
   ролей/controls.
5. Выполнить visual/runtime matrix и при необходимости поправить только семантическое назначение
   token или локальный layout, не вводя новый размер.

## Progress

- [x] 2026-08-22 07:05 +03:00 — зафиксированы исходный Git state, полный список distinct размеров и
  доказанный Playwright-контракт расхождения value/placeholder.
- [x] 2026-08-22 07:05 +03:00 — завершён selector/component inventory всех 165 size declarations;
  официальные Apple, Telegram, W3C WCAG и CSS/Tiptap contracts проверены.
- [x] 2026-08-22 07:05 +03:00 — введены семь semantic tokens, все pages/components мигрированы,
  старые неиспользуемые `InputField`/`.fv-input` удалены, добавлен static regression test.
- [x] 2026-08-22 07:43 +03:00 — fresh frontend gates, focused and full four-project browser
  matrices, visual review и repository Full verification завершены.

## Surprises & Discoveries

- Первоначальная гипотеза о локальном placeholder bug оказалась слишком узкой: расхождение
  поддерживалось и глобальным touch rule, и множеством component-specific размеров от `8px` до
  `16px`; владелец уточнил, что требуется система для всего UI, а не Safari-oriented fix.
- Full WebKit matrix выявила не новый sizing defect, а два прежних недетерминированных момента:
  Axe мог анализировать route/theme в промежуточном animation state, а auth test менял route с
  незавершёнными mock queries. Проверки теперь ждут конечное observable state, не игнорируя ошибки.
- Та же Axe matrix обнаружила реальный dark destructive-text contrast `4.46:1`; общий dark negative
  token скорректирован до значения, проходящего WCAG AA на используемых поверхностях.

> Superseded 2026-08-23: dark `text-negative` возвращён с `#FF554A` на desktop `#F84235` по strict
> color parity решению. Axe finding остаётся видимым и не suppressится.

## Decision Log

- 2026-08-22 — отказаться от responsive размера, привязанного к `pointer: coarse`, как основания
  typography. Type scale будет invariant между browser modes; platform zoom остаётся нативным.
- 2026-08-22 — использовать semantic, а не numeric token names, чтобы component code выражал роль
  текста и не создавал новый размер копированием числа.
- 2026-08-22 — удалить `text-size-adjust` и prefixed WebKit declaration вместе с touch threshold:
  приложение задаёт semantic size, а нативное масштабирование текста и страницы остаётся платформе.
- 2026-08-22 — scale: overline `10px`, caption `11px`, label `12px`, body/control `13px`, heading
  `15px`, title `18px`, display `22px`. Это сохраняет проверенную плотность Flowvy, убирает дробные
  и локальные ступени и выражает hierarchy, которую Apple HIG требует от typography, не выдавая её
  за platform-mandated numerical scale.

## External contract evidence

- Apple Human Interface Guidelines, Typography, accessed 2026-08-22: typography должна обеспечивать
  legibility и выражать information hierarchy:
  https://developer.apple.com/design/human-interface-guidelines/typography
- W3C WCAG 2.2, Understanding SC 1.4.4 Resize Text, accessed 2026-08-22: текст должен увеличиваться
  до 200% без потери content/functionality; viewport не должен запрещать zoom:
  https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html
- W3C WCAG 2.2, Understanding SC 1.4.10 Reflow, accessed 2026-08-22: интерфейс должен сохранять
  content/functionality без двумерного scroll на эквиваленте 320 CSS px:
  https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- Telegram Mini Apps API, accessed 2026-08-22: официальный web contract задаёт theme colors и
  viewport values, но не font-size scale; numerical hierarchy остаётся product decision:
  https://core.telegram.org/bots/webapps
- CSS Pseudo-Elements Level 4 `::placeholder`, accessed 2026-08-22: placeholder является
  tree-abiding pseudo-element; его typography наследуется из control вместо отдельного размера:
  https://drafts.csswg.org/css-pseudo-4/#placeholder-pseudo
- Tiptap Placeholder extension, accessed 2026-08-22: editor placeholder выводится CSS `::before`
  на `.is-editor-empty`, поэтому получает тот же control token:
  https://tiptap.dev/docs/editor/extensions/functionality/placeholder

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build` → zero exit.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: focused typography Playwright во всех четырёх
  projects → 16/16, одинаковые semantic roles, no overflow, serious Axe/console/network failures
  absent.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: полный `pnpm exec playwright test
  --workers=4` → 564/564 на mobile Chromium, small-mobile Chromium, iOS WebKit и desktop Chromium.
- `/Users/x_kit_/Documents/Projects/mini-app`: `pwsh ./scripts/verify.ps1 -Scope Full` → full gate
  прошёл: migrations/drift, Ruff, 520 backend, 56 pinned Remnawave contracts, frontend
  lint/typecheck, 75 unit, production build, 141/141 mobile Playwright и Markdown links.
- Ручная проверка: все user/admin routes, light/dark, `320x568`, `430x932`, iPhone/WebKit и
  `1280x900`; screenshots открыты и просмотрены.

## Recovery and rollback

Изменения ограничены frontend CSS/tests/docs и не затрагивают данные или внешние системы. До commit
любой отдельный шаг можно отменить обратным `apply_patch`; существующие два локальных commit и
Docker volumes не изменяются. Playwright использует только deterministic mock API.

## Outcomes & Retrospective

Flowvy теперь имеет одну семантическую систему размеров вместо набора локальных чисел. Компонент
выбирает роль текста, а не размер; новый static contract не даст вернуть raw `font-size`. Все формы и
редакторы показывают value/placeholder одним control token во всех browser modes, при этом нативный
user zoom и text adjustment не переопределяются. Полная визуальная и функциональная матрица
подтвердила hierarchy, reflow, accessibility и отсутствие overflow на всех поддерживаемых
viewport/browser проектах.
