# Профессиональный UX форм и клавиатуры в Telegram iOS

Status: completed
Owner: Codex
Started: 2026-08-02
Updated: 2026-08-02

## Purpose

Редактор access profile должен визуально совпадать с остальными настройками Flowvy, не менять
геометрию неожиданно и оставаться доступным при открытой экранной клавиатуре. Нижняя навигация не
должна подниматься над клавиатурой и перекрывать активное поле ни на одной странице Mini App.

## Current state

- `frontend/src/pages/admin/settings-access.tsx` использует отдельный набор raw input/select/textarea
  и локальные стили вместо общих form-section controls.
- Глобальное правило в `frontend/src/styles/global.css` поднимает любой control до 16px ради защиты
  от focus zoom в iOS; из-за отсутствия общей типографики placeholders и native controls выглядят
  крупнее окружающего интерфейса.
- `frontend/src/components/layout/tab-bar.tsx` не знает о фокусе ввода или visual viewport, поэтому
  absolute/fixed навигация остаётся видимой над iOS keyboard.
- Официальные Visual Viewport и Telegram Mini Apps API сообщают об изменении видимой области, но
  обновления могут приходить после начала системной анимации; обработка focus нужна как немедленный
  сигнал, а viewport — как подтверждение и восстановление.

## Scope

Входит: общий слой полей/выбора/textarea, access editor и default access selector, touch hover,
стабильность conditional form layout, глобальная видимость tab bar при экранном вводе, unit/E2E/UI
проверки и актуализация текущего состояния. Не входит: изменение registration API, профилей доступа,
Remnawave contract или данных.

## Acceptance

- Placeholder, введённый текст, date/select surface и подписи используют согласованную типографику
  и тему во всех состояниях; focus zoom не возвращается на iPhone.
- Access editor переиспользует общие form controls и не вставляет provider-поля после открытия.
- Touch не оставляет hover-состояния, а смена validity и открытие editor не вызывают резкого скачка.
- При фокусе keyboard-opening input/textarea в мобильном WebView tab bar и нижний blur скрываются до
  завершения ввода, поле остаётся достижимым; native select/date picker не затрагиваются.
- Маршруты настроек проходят 430x932, 320x568, WebKit/iPhone и desktop в light/dark без overflow,
  console/page/network/accessibility ошибок.

## Approach

1. Зафиксировать официальные ограничения iOS/WebKit и Telegram viewport и сопоставить access editor
   с существующими FormSection/Segmented/Action patterns.
2. Расширить общий form-section слой семантическими полями и перевести access editor без изменения
   API; стабилизировать условные области и pending provider options.
3. Добавить один глобальный hook для состояния экранного ввода на основе focus + VisualViewport и
   Telegram viewport events; скрывать нижний chrome на coarse/mobile input, не ломая desktop focus.
4. Добавить focused Playwright scenarios, затем выполнить frontend и полный repository gates,
   визуально открыть артефакты и проверить текущий public tunnel build.

## Progress

- [x] 2026-08-02 17:16 +03:00 — прочитаны repo/UI verification правила, исходный diff и состояние.
- [x] 2026-08-02 17:16 +03:00 — подтверждены VisualViewport keyboard semantics, Telegram stable
  viewport/safe-area contract и Apple text-field guidance по официальным источникам.
- [x] 2026-08-02 17:35 +03:00 — редактор вынесен в feature component и переведён на общий
  FormField/Input/Select/Textarea; Add сохраняет геометрию до завершения provider options.
- [x] 2026-08-02 17:38 +03:00 — tab bar и нижний edge chrome скрываются по keyboard-capable touch
  focus и VisualViewport, восстанавливаются по Enter/blur; native select/date остаются системными.
- [x] 2026-08-02 18:05 +03:00 — финальные frontend lint/type/unit/build и 156/156 all-project
  Playwright прошли; focused/date/lifetime screenshots просмотрены в light/dark на всех viewports,
  light-theme positive text приведён к WCAG AA контрасту.

> Superseded 2026-08-23: локальный light `text-positive` override отменён принятым strict desktop
> color parity решением; исторический результат этого запуска не изменяется.
- [x] 2026-08-02 17:51 +03:00 — полный repository gate прошёл, public tunnel отдаёт новый bundle,
  health 200 и debug 404.
- [x] 2026-08-02 — реальный iOS screenshot выявил, что закрытый native select всё ещё получает
  системный rendering/16px, а полноширинный date выходит за editor; сверены прямые Apple, WebKit,
  Open UI и React Aria references.
- [x] 2026-08-02 — select/date переведены на общий app-owned visible layer поверх нативного
  semantic control: Geist 13px снаружи, системный picker внутри; compact date стоит в одной строке
  с `Expires at` и ограничен границами editor.
- [x] 2026-08-02 — реальный iOS повторно проверен: touch picker больше не оставляет focus frame,
  controlled input показывает Geist 13px в покое и сохраняет нативные 16px только при редактировании;
  вспомогательная строка под фиксированной датой удалена.

## Surprises & Discoveries

- Глобальный `font-size: max(16px, 1em)` защищает от iOS focus zoom, но одновременно переопределяет
  локальные 12–13px размеры всех controls; правка должна сохранить вычисляемые 16px у input surface,
  а визуальную иерархию вернуть через общий control layout и отдельную placeholder typography.
- WebKit документирует запаздывание VisualViewport resize в отдельных iOS состояниях, поэтому
  скрывать overlay только по resize поздно: focusin нужен до анимации клавиатуры.
- `interactive-widget=resizes-content` соответствует текущему CSS Viewport contract, но выбранный
  WebKit/iPhone runtime ещё выводит `Viewport argument key not recognized`; hint удалён, потому что
  VisualViewport/focus решение работает без предупреждений во всех четырёх browser projects.
- Native select/date не считаются экранной клавиатурой: попытка управлять их blur lifecycle могла бы
  прервать выбор в iOS wheel picker, поэтому hook их намеренно не скрывает.
- Playwright WebKit на Windows нормализует неподдержанный `type=date` в DOM property `text`; hook
  проверяет объявленный HTML type, поэтому fallback не меняет назначение control и не прячет chrome.
- На touch глобальное anti-zoom правило корректно оставляет нативный form control в 16px, но
  закрытый `<select>` на iOS тем самым визуально нарушал шкалу Flowvy. Разделение видимого и
  нативного слоёв сохраняет anti-zoom, picker и accessibility без системной типографики в строке.

## Decision Log

- 2026-08-02 — не вводить новый select/date framework: native mobile pickers сохраняют привычное
  системное взаимодействие; унифицируется поверхность поля, типографика и focus state.
- 2026-08-02 — tab bar скрывается при mobile/coarse keyboard-control focus немедленно,
  VisualViewport служит дополнительным сигналом для программно открытой клавиатуры и восстановления.
- 2026-08-02 — `interactive-widget=resizes-content` не используется до поддержки WebKit без console
  warning; pinch zoom остаётся доступен, focus zoom предотвращает 16px touch-only control size.
- 2026-08-02 — для Safari 26 не эмулировать новый customizable select: WebKit заявляет эту
  возможность для Safari 27. Короткие choices и compact date следуют Apple HIG; видимое значение
  рендерит Flowvy, а прозрачный native select/date остаётся источником semantics и system picker.
- 2026-08-02 — focus ring у native picker показывается только для fine-pointer keyboard navigation:
  iOS сохраняет focus после закрытия picker, где рамка ошибочно выглядит как незавершённый выбор.
  Значение обычного input на touch получает отдельный inert resting layer 13px; при фокусе слой
  скрывается, а semantic input остаётся 16px для защиты от Safari focus zoom.

## Direct references

Проверено 2026-08-02:

- [Apple HIG: Pickers](https://developer.apple.com/design/human-interface-guidelines/pickers) —
  pull-down button для короткого списка и compact date button в ограниченном пространстве.
- [WebKit: The golden rule of Customizable Select](https://webkit.org/blog/18117/the-golden-rule-of-customizable-select/) —
  полноценный customizable select заявлен для Safari 27, не текущего Safari 26.
- [Open UI: Customizable Select explainer](https://open-ui.org/components/customizable-select.explainer/) —
  JS-реконструкции могут уступать native control по accessibility/reliability; native semantics
  сохранены.
- [React Aria: Select](https://react-aria.adobe.com/Select) и
  [DatePicker](https://react-aria.adobe.com/DatePicker) — проверены button/value/listbox и
  date-field/calendar patterns; новая runtime dependency не добавлена ради двух коротких controls.

## Verification

- `E:\mini-app\frontend`: `pnpm lint; pnpm typecheck; pnpm test; pnpm build` → 163 files linted,
  TypeScript passed, 11/11 unit passed, production build passed.
- Повторная проверка touch focus/resting typography: 24/24 focused mobile+WebKit; полная матрица
  156/156 сценариев закрыта отдельными project runs на 430x932, 320x568, iPhone/WebKit и desktop.
  Один массовый desktop run исчерпал Windows localhost sockets (`ERR_NO_BUFFER_SPACE`); тот же
  единственный сценарий сразу прошёл изолированно на чистом порту.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5204; .\scripts\verify.ps1 -Scope Full` → Ruff, migrations,
  281 pytest, 41 Remnawave contracts, frontend, 39 mobile browser cases и docs passed.
- Ручная/UI-проверка: policy/days/focused/date/lifetime screenshots `/admin/settings/access` в
  light/dark на mobile Chromium и iPhone/WebKit открыты; touch picker без рамки, Geist 13px resting
  value, отсутствие fixed-date helper, no-overflow и скрытие tab bar подтверждены.
- Public dev tunnel: root 200 с новыми `index-0rNdkxkC.js` и `index-CDni97G-.css`, `/api/health`
  200, debug route 404.

## Recovery and rollback

Изменения frontend-only и не мутируют данные. Откат выполняется точечно по новым form/keyboard
файлам и access/tab-bar diff; текущий большой invite-registration diff и dev/tunnel процессы не
трогать. Playwright использует только детерминированные mocks.

## Outcomes & Retrospective

Access editor больше не держит собственную копию input/select/textarea styles: он использует общий
form-section слой, отдельный feature component и стабильную pending-state геометрию. Touch controls
сохраняют 16px против iOS focus zoom, но placeholder/date surface остаются компактными и используют
Geist; desktop возвращён к 13px. Hover применяется только для fine pointer и не залипает после tap.

App shell немедленно убирает нижний chrome при keyboard-opening mobile input focus и подтверждает
состояние через VisualViewport; Enter, blur и textarea имеют проверенные lifecycle paths, а native
select/date не получают принудительный blur.
Закрытые select и compact date теперь рисуют значение через общий Flowvy layer, а нативные элементы
остаются прозрачным semantic/picker слоем. На 320x568, 390x844, 430x932 и desktop значение не
выходит из editor, дата стоит в одной строке с label, Geist/13px и системный picker сохранены.
Новый CSS `interactive-widget` намеренно не оставлен из-за WebKit console warning. API, данные и
Remnawave contract не менялись. `docs/PROJECT_STATE.md` обновлён свежими результатами.
