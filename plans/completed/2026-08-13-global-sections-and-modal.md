# Общие section headers и top-layer profile editor

Status: completed
Owner: Codex
Started: 2026-08-13
Updated: 2026-08-13

## Purpose

Распространить удачную attached-header композицию вложенных Settings на существующие content
sections Mini App, перенести HTML helper внутрь Greeting textarea и сделать Access profile editor
настоящим modal layer, который на mobile полностью заменяет app chrome.

## Scope

- `HTML is supported...` становится placeholder Greeting textarea; прежний onboarding placeholder
  удаляется, отдельный helper под полем больше не дублируется;
- общий semantic `FormSection` с attached header/action и единым surface contract;
- миграция существующих секций Home detail, Devices, Pulse groups/incidents, Admin dashboard и Admin
  user detail на общий contract;
- Access editor открывается через native `dialog.showModal()` в browser top layer;
- mobile: full-screen task surface с собственными safe-area header/body/footer и без видимого
  app header/tab bar; desktop: центрированный dialog с dimmed inert parent context;
- сохранение focus trap/return, Escape, keyboard-aware scrolling, create/edit и error states.

Не меняются API payloads, business rules, registration defaults и provider contracts.

## Acceptance

- Welcome textarea использует HTML helper как placeholder и не показывает его второй строкой.
- Все существующие именованные content sections используют attached header, border и radius contract;
  section spacing остаётся единым на 320/430/WebKit/desktop.
- На compact viewport Access editor занимает весь visual viewport, перекрывает header/tab bar и не
  позволяет взаимодействовать с parent view; footer доступен при прокрутке и keyboard input.
- На desktop editor остаётся центрированным modal dialog, parent dimmed/inert.
- Focus начинается с dialog heading, Tab не выходит наружу, Escape/cancel возвращают focus trigger.

## Research & Decisions

- Apple HIG рекомендует full-screen modal для complex/multistep tasks на compact displays; profile
  editor содержит essentials, validity modes и progressive advanced provider fields.
- `HTMLDialogElement.showModal()` помещает dialog в browser top layer, создаёт `::backdrop` и делает
  остальной document inert; это устраняет stacking-context гонку с app header/tab bar.
- На wide viewport сохраняется context-preserving centered dialog; breakpoint совпадает с текущим
  compact editor contract (`600px`).

## Progress

- [x] 2026-08-13 — изучены текущие section usages, shell stacking contexts и mobile evidence.
- [x] 2026-08-13 — сверены Apple HIG и MDN top-layer modal contracts.
- [x] 2026-08-13 — реализованы placeholder, global sections и adaptive top-layer dialog.
- [x] 2026-08-13 — обновлены deterministic assertions; light/dark evidence просмотрены на compact и desktop.
- [x] 2026-08-13 — пройдены full verification и 216-scenario matrix; project state обновлён.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Focused Welcome/Home/Devices/Pulse/Dashboard/User detail/Access Playwright.
- Full four-project browser matrix and repository Full gate.
- Manual light/dark evidence at 320x568, 430x932, iOS WebKit 390x844 and desktop 1280x900.

## Outcomes & Retrospective

Greeting helper теперь живёт только в textarea placeholder. Именованные секции Mini App используют
один attached-header/card contract, а их внешний интервал задаёт page/container gap без удвоения.
Access editor использует native top layer: на compact это непрозрачный full-screen task flow с
safe-area header/footer, на desktop — центрированный modal. Полная четырёхпроектная browser matrix
дала 216/216, repository Full gate прошёл backend, migrations/contracts, frontend и docs.
