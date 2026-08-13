# Стабильный ввод и загрузка в Telegram Mini App

Status: completed
Owner: Codex
Started: 2026-08-14
Updated: 2026-08-14

## Purpose

Поля формы во всей Mini App остаются видимыми при открытии экранной клавиатуры, нижняя навигация и
действия редактора не мерцают при её закрытии, а загрузка кнопок не создаёт артефактов композитинга.
В настройках Tribute используется официальный знак сервиса.

## Current state

`AppShell` и `EditorDialog` независимо вызывают `useKeyboardVisibility`, который смешивает фокус,
эвристику размера `VisualViewport` и состояние нижнего chrome. `EditorDialog` дополнительно отменяет
`pointerdown`, вручную снимает фокус и условно удаляет footer из раскладки. При `focusout` hook сразу
объявляет клавиатуру закрытой, хотя анимация WKWebView и восстановление visual viewport ещё не
завершились. Корневой scrollport и полноэкранный dialog при этом имеют высоту `100dvh`, а не
фактически видимой области.

Локально зафиксированы `@telegram-apps/sdk-react` 3.3.9 и `@telegram-apps/sdk` 3.11.8. Исходный код
3.11.8 привязывает `--tg-viewport-height` к Telegram `viewport_changed`; это контракт контейнера
Mini App, а не отдельное событие экранной клавиатуры. Telegram Bot API 9.6 документирует
`hideKeyboard()` (добавлен в 9.1), но не предоставляет событие keyboard-open.

Исследование 2026-08-14:

- https://core.telegram.org/bots/webapps — официальный контракт Telegram viewport, stable height,
  safe areas и `hideKeyboard()`;
- https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport — экранная клавиатура может
  уменьшать visual viewport, не меняя layout viewport;
- https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView — стандартное раскрытие
  сфокусированного элемента во вложенных scroll-контейнерах;
- https://webkit.org/blog/12179/the-focus-indicated-pseudo-class-focus-visible/ — ожидаемая видимая
  индикация фокуса текстовых полей в WebKit;
- https://wiki.tribute.tg/ru — официальный круглый знак Tribute из icon metadata.

## Scope

Входит общий visual-viewport/focus lifecycle, shell и editor dialog, общий spinner, знак Tribute,
детерминированные unit/E2E сценарии и визуальная проверка. Не входит обработка платежных webhook,
изменение commerce API, реальный вызов Tribute или изменение данных пользователя.

## Acceptance

- Сфокусированный текстовый/числовой control автоматически раскрывается внутри видимой части
  shell или editor dialog после изменения visual viewport.
- Footer редактора и tab bar скрыты на всём цикле touch-ввода и возвращаются только после
  восстановления viewport; кнопки не перехватывают blur и не требуют локального Telegram-вызова.
- Loading-индикатор всех `ActionBtn` и `FormSaveButton` не содержит SVG-анимационного backing box.
- Settings и header Tribute показывают один переиспользуемый официальный brand component.
- Mobile Chromium, small mobile, iOS WebKit, desktop Chromium проходят функциональные, overflow,
  focus и визуальные проверки без console/network ошибок.

## Approach

1. Разделить стабильное состояние touch editing и геометрию visual viewport в одном глобальном
   browser adapter; привязать CSS variables и раскрытие active control на focus/resize/scroll.
2. Перевести `AppShell` и `EditorDialog` на эти общие сигналы, удалить pointer/blur workaround.
3. Заменить SVG spinner на CSS border spinner с фиксированной геометрией и добавить TributeIcon в
   существующий каталог service brand icons.
4. Переписать тесты с проверки `display:none` на наблюдаемую видимость active input, непрерывность
   keyboard lifecycle и отсутствие spinner backing box.
5. Выполнить diff-aware и UI verification, проверить тёмную/светлую темы и публичный dev route.

## Progress

- [x] 2026-08-14 00:30 +03:00 — проверены текущий runtime flow, locked SDK 3.3.9/3.11.8 и первичные
  контракты Telegram/WebKit platform.
- [x] 2026-08-14 00:45 +03:00 — реализован общий viewport/focus lifecycle; локальные pointer/blur
  workaround удалены из editor dialog.
- [x] 2026-08-14 00:45 +03:00 — spinner заменён на прозрачный CSS border ring, Tribute получил
  переиспользуемый официальный brand mark.
- [x] 2026-08-14 00:50 +03:00 — обновлены детерминированные E2E сценарии focus reveal, viewport
  restoration, button activation, loading indicator и accessibility.
- [x] 2026-08-14 00:57 +03:00 — расширенная affected-матрица 72/72 и repository Changed gate
  прошли; light/dark evidence просмотрены, документация обновлена.

## Surprises & Discoveries

- `focusout` сейчас немедленно очищает keyboard state до восстановления `VisualViewport`; это прямо
  объясняет кадр с вернувшимся footer над ещё открытой клавиатурой.
- В двух mounted-компонентах создаются независимые listeners одной и той же глобальной browser state.
- Spinner вращает сам inline SVG; снимок Swiftgram показывает прямоугольный backing layer этого SVG.
- Изменение layout между `pointerdown` и `click` отменяет activation кнопки в WebKit. Глобальный
  lifecycle поэтому удерживает текущую раскладку до завершения pointer activation, не отменяя
  событие и не снимая focus вручную.
- `documentElement.clientHeight` в test/browser layout может отражать высоту документа, а не
  видимого окна; keyboard baseline должен опираться на `window.innerHeight` и `VisualViewport.height`.

## Decision Log

- 2026-08-14 — использовать VisualViewport только как геометрию и подтверждение завершения цикла,
  а editable focus как немедленное начало touch editing; web platform не имеет переносимого
  keyboard-open события.
- 2026-08-14 — сохранять собственные нижние действия, а не переходить на Telegram MainButton:
  редактор имеет две кнопки и desktop/web fallback, тогда как задача относится к общей раскладке.
- 2026-08-14 — использовать официальный знак из metadata wiki.tribute.tg и единый
  `ServiceBrandIcon`, а не локальную Lucide-замену.

## Verification

- `E:\mini-app\frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` → 195 файлов
  lint, 37/37 unit tests, typecheck и production build прошли.
- `E:\mini-app\frontend`: `pnpm exec playwright test tests/e2e/keyboard-ux.spec.ts
  tests/e2e/tribute.spec.ts tests/e2e/critical-routes.spec.ts --project=mobile-chromium
  --project=small-mobile-chromium --project=ios-webkit --project=desktop-chromium --workers=3` →
  72/72 прошли без overflow/console/network ошибок.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5314; .\scripts\verify.ps1 -Scope Changed` → 293 service-free
  backend tests, Ruff, 37 frontend unit, lint/typecheck/build, 69 mobile Playwright smoke и docs
  прошли. Первый запуск остановился только на занятом dev-сервером порту 5173; повтор на выделенном
  порту не менял работающую среду.
- Ручная/UI-проверка: `/admin/settings` и Tribute editor в light/dark; официальный brand mark,
  focused `Payment amount`, непрерывное скрытие нижних actions и pending Save spinner просмотрены.

## Recovery and rollback

Изменения ограничены frontend browser adapter, базовыми компонентами, тестами и документацией.
Внешние запросы и миграции не выполняются. Откат возможен удалением новых adapter/tests и возвратом
затронутых CSS/TSX строк без изменения пользовательских данных; чужие изменения worktree сохраняются.

## Outcomes & Retrospective

Глобальный singleton adapter заменил две независимые keyboard-эвристики и локальный event
workaround. Shell и все редакторы теперь используют один touch-editing snapshot и фактическую
геометрию visual viewport; WebKit pointer activation сохраняется без `preventDefault`. Общий CSS
spinner устранил серый compositing rectangle сразу у `ActionBtn` и `FormSaveButton`, а Tribute
переиспользует тот же каталог brand icons, что Kuma/Beszel. Реальные provider/payment операции не
выполнялись.
