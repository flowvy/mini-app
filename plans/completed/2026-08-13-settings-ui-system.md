# Консистентная система страниц настроек

Status: completed
Owner: Codex
Started: 2026-08-13
Updated: 2026-08-13

## Purpose

Администратор Flowvy должен воспринимать основной экран настроек, вложенные редакторы и диалоги как
одну предсказуемую мобильную систему: ясная иерархия, одинаковые секции и строки, устойчивые действия
сохранения, понятные статусы и удобная навигация на малых Telegram viewport. Визуальное направление
берётся из Settings, Edit Profile и модалок `E:\flowvy_desktop`, но адаптируется к токенам и
существующим паттернам мини-приложения, а не копируется буквально.

## Scope

Выполнено:

- инвентаризация всех admin settings routes, соседних Flowvy экранов и desktop reference;
- единая композиция overview, вложенных форм, status/fact rows, notices и save actions;
- адаптивный Access profile dialog и согласованные confirm dialogs;
- route-specific header titles, locale additions и deterministic UI coverage;
- light/dark проверка mobile, small-mobile, WebKit/iPhone и desktop;
- актуализация `docs/PROJECT_STATE.md`.

Не изменялись backend API, схемы данных, Telegram/Remnawave/Kuma/Beszel контракты и набор
продуктовых настроек. Реальные provider targets не вызывались.

## Acceptance

- [x] Overview имеет одну информационную архитектуру для integrations, Flowvy Mini-App и system.
- [x] Вложенные экраны используют общую section/field/save композицию и собственные route titles.
- [x] Dialog удерживает focus, закрывается по `Escape` и возвращает focus на trigger в Chromium и
  WebKit; compact viewport допускает pointer/keyboard interaction со всем содержимым.
- [x] Сохранены API payloads, direct URLs, Back/Forward, loading/error и mutation semantics.
- [x] На `320x568`, `430x932`, WebKit `390x844` и `1280x900` нет horizontal overflow,
  неожиданных console/page/network ошибок и серьёзных Axe findings.

## Approach

1. Сопоставлена route/component/style/test цепочка Flowvy с desktop reference.
2. Добавлен минимальный settings-specific composition layer поверх существующих design tokens.
3. Overview и каждый nested editor переведены на общий каркас без изменения backend contracts.
4. Расширены deterministic scenarios для hierarchy, navigation, focus и dialog/save states.
5. Выполнены changed/full repository gates, all-project browser matrix и ручной просмотр evidence.

## Progress

- [x] 2026-08-13 — зафиксированы чистое исходное дерево и полный список settings routes.
- [x] 2026-08-13 — завершён visual/component inventory Flowvy и desktop reference.
- [x] 2026-08-13 — реализован settings composition layer и мигрированы маршруты.
- [x] 2026-08-13 — расширено deterministic UI coverage.
- [x] 2026-08-13 — пройдены свежие code, build, browser и visual проверки.
- [x] 2026-08-13 — обновлён project state, выполнен финальный diff review, план закрыт.

## Surprises & Discoveries

- Проект уже унифицировал внешний page gap и form controls; основной разрыв находился в
  информационной hierarchy и page composition, поэтому глобальная смена токенов не потребовалась.
- `overflow: hidden` на раскрытом `details` создавал лишний scroll container и мешал pointer hit
  testing на `320x568`; `overflow: clip` сохранил визуальное обрезание без scroll semantics.
- WebKit не обязан фокусировать button после pointer click. Поэтому dialog получает явный trigger,
  а не полагается только на `document.activeElement`, и возвращает focus после unmount.
- Первый six-worker all-project rerun дал два случайных Vite/HMR transport errors. Оба сценария
  прошли изолированно; полный повтор на новом порту с четырьмя workers прошёл `208/208`.

## Decision Log

- 2026-08-13 — сохранить route/API boundaries и строить визуальную систему поверх существующих
  primitives; desktop-проект остаётся референсом, а не зависимостью.
- 2026-08-13 — использовать спокойные grouped surfaces и leading context desktop reference, но
  сохранить Telegram viewport, safe-area, bottom chrome и токены мини-приложения.
- 2026-08-13 — dialog реализует явные initial focus, focus loop, `Escape` и return-to-trigger по
  [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), а targets
  и focus treatment сверены с [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
  и [focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance). Источники
  просмотрены 2026-08-13.
- 2026-08-13 — safe-area и viewport поведение сохраняют официальный контракт
  [Telegram Mini Apps](https://core.telegram.org/bots/webapps), просмотренный 2026-08-13.
- 2026-08-13 — не использовать реальные backend/provider targets: UI-состояния воспроизводятся
  mocked Playwright boundary.

## Verification

- `E:\mini-app`: `scripts/verify.ps1 -Scope Changed` — frontend install/lint/typecheck, 33 unit,
  production build, 52 mobile Chromium scenarios и docs passed.
- `E:\mini-app`: `scripts/verify.ps1 -Scope Full` — Ruff, migrations, 315 backend tests,
  53 Remnawave contract tests, frontend gates, 52 mobile scenarios и docs passed.
- `E:\mini-app\frontend`: focused small-mobile pointer scenario и WebKit focus-return scenario —
  passed после исправлений.
- `E:\mini-app\frontend`: `PLAYWRIGHT_PORT=5221; pnpm exec playwright test --workers=4` —
  `208/208` passed на четырёх browser/viewport projects.
- Вручную просмотрены overview, Beszel, Identity, Welcome, Access policy и Access editor в
  light/dark на mobile/small-mobile/desktop; hierarchy, contrast, wrapping, scroll/footer и bottom
  chrome согласованы.

## Recovery and rollback

Изменения ограничены frontend source/tests/docs и не выполняют внешних либо data mutations. Каждый
route можно вернуть независимо, сохранив общий settings composition layer. Verification использует
только disposable browser fixtures и repo-owned ignored artifacts.

## Outcomes & Retrospective

Settings перестали быть набором отдельных карточек: overview теперь объясняет структуру продукта,
а nested editors визуально и поведенчески принадлежат одной системе. Desktop reference дал полезные
принципы группировки и modal geometry, но итоговая реализация остаётся нативной для Telegram Mini
App. Наибольшую ценность дала all-project проверка: она выявила не только compact scrolling, но и
реальное различие WebKit в focus behavior до финального handoff.
