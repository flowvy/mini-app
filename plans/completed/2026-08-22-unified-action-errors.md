# Видимые и консистентные ошибки действий в Mini App

Status: completed
Owner: Пятница
Started: 2026-08-22
Updated: 2026-08-22

## Purpose

После неудачного save/create/delete/test пользователь сразу видит и получает доступный текст ошибки,
независимо от длины страницы или editor. Локальные ошибки полей остаются рядом с полями, а ошибки
загрузки сохраняют собственные retry-состояния.

## Current state

- Общий `InlineFeedback` задаёт визуальный tone и ARIA role, но не переводит фокус и viewport к
  сообщению.
- В `SponsorOfferEditor`, `CommerceRuleEditor` и `AccessProfileEditor` save error расположен после
  всего содержимого длинного editor, поэтому Telegram MainButton может завершить mutation вне
  видимой области без зрительно заметного результата.
- Mutation errors в других формах используют тот же компонент, но haptic и управление фокусом
  применяются несистемно.
- W3C WCAG 2.2 требует текстово идентифицировать ошибку и программно объявлять status message;
  GOV.UK error summary pattern рекомендует переносить keyboard focus на summary после submit;
  Telegram официально предоставляет `notificationOccurred("error")` для провала action. Источники
  проверены 2026-08-22: <https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html>,
  <https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html>,
  <https://design-system.service.gov.uk/components/error-summary/>,
  <https://developer.apple.com/design/human-interface-guidelines/feedback>,
  <https://developer.apple.com/design/human-interface-guidelines/writing> и
  <https://core.telegram.org/bots/webapps#hapticfeedback>.

## Scope

Входит: общий контракт action-error feedback, все существующие mutation/action failure surfaces,
перестановка save errors к началу длинных editor, deterministic Playwright coverage, документация
текущего состояния. Не входит: изменение backend error contract, новый toast stack, переписывание
field-level validation и success feedback.

## Acceptance

- После провала создания sponsor offer error находится в верхней части editor, получает focus и
  попадает в viewport без ручной прокрутки.
- Остальные action/mutation errors используют тот же явный режим: persistent inline text,
  `role="alert"`, focus reveal и один Telegram error haptic.
- Ошибки загрузки и предупреждения не перехватывают focus автоматически.
- Повторная попытка снова объявляет ошибку; draft и безопасная error copy сохраняются.
- Frontend lint, typecheck, unit tests, build и релевантные Playwright scenarios проходят свежо.

## Approach

1. Добавить opt-in action mode в `InlineFeedback`: focus on mount и Telegram error haptic.
2. Применить его только к результатам инициированных пользователем неудачных действий; не менять
   passive load errors, warnings и field validation.
3. Перенести save feedback трёх длинных editor сразу под header content.
4. Добавить Playwright assertions для focus и положения в viewport на точном sponsor-offer flow и
   репрезентативной второй форме.
5. Выполнить change-aware и визуальные проверки, затем обновить `docs/PROJECT_STATE.md`.

## Progress

- [x] 2026-08-22 04:12 +03:00 — закрыты найденные повторным аудитом business-failure,
  clipboard, sponsor refresh и partial-load ветки; расширено deterministic UI coverage.
- [x] 2026-08-22 03:00 +03:00 — исходное состояние и существующие error surfaces инвентаризированы.
- [x] 2026-08-22 03:00 +03:00 — первичные W3C, GOV.UK, Apple HIG и Telegram Mini Apps источники сверены.
- [x] 2026-08-22 03:07 +03:00 — общий action-error contract внедрён во все найденные
  user-initiated mutation surfaces; passive/field/load states сохранены отдельно.
- [x] 2026-08-22 03:10 +03:00 — focus/viewport/Axe и visual evidence проверены на точном sponsor
  offer failure; focused matrix 12/12 прошла на четырёх проектах.
- [x] 2026-08-22 03:12 +03:00 — frontend lint/type/unit/build и 121/121 mobile E2E прошли; project
  state и финальный diff проверены.

## Surprises & Discoveries

- Повторный route/action audit нашёл четыре ветки вне исходной инвентаризации: штатные
  `Kuma/Beszel { ok: false }`, отклонение Clipboard API на Home, sponsor refresh поверх stale data и
  ошибку дополнительного registration query на Settings overview. До их закрытия утверждение о
  глобальном покрытии неверно.
- CSS tokens уже содержат неиспользуемую toast animation, но toast не решает задачу: критичная
  ошибка должна оставаться рядом с контекстом и не исчезать по таймеру.
- `role="alert"` решает объявление для assistive technology, но само по себе не делает удалённый DOM
  узел видимым зрячему пользователю.

## Decision Log

- 2026-08-22 — используем persistent inline error summary с opt-in focus, а не transient toast или
  modal alert: это сохраняет контекст, не требует dismiss и соответствует severity обычной
  исправимой server/form ошибки.
- 2026-08-22 — haptic включается только для action errors, не для passive load errors, чтобы не
  создавать шум при открытии страницы.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: targeted `pnpm exec playwright test ...
  --project=mobile-chromium`, затем релевантная UI suite на `320x568`, `430x932` и desktop.
- Ручная проверка: dark/light, error focus, viewport containment, no horizontal overflow,
  console/page/network errors и accessibility scan.

## Recovery and rollback

Изменения frontend-only и не затрагивают данные. Откат — удалить новый opt-in prop, вернуть error
blocks в прежние позиции и убрать соответствующие test assertions; миграции и внешние операции не
нужны.

## Outcomes & Retrospective

`InlineFeedback attention="action"` стал opt-in boundary для исправимых ошибок действий: он оставляет
сообщение в DOM, программно переводит focus, показывает outline и вызывает guarded Telegram error
haptic. Save summaries трёх длинных editor перенесены вверх. Passive load errors, warnings и локальная
field validation не менялись. Найденная ошибка удаления sponsor offer теперь остаётся внутри открытого
confirmation dialog вместо скрытой под ним страницы.

Повторный полный route/action audit закрыл четыре пропущенные ветки. Kuma и Beszel теперь одинаково
обрабатывают transport error и штатный `200 { ok: false }`; отказ Clipboard API показывает action
error вместо unhandled rejection; sponsor refresh сохраняет прежние access facts и сообщает о
неудаче; Settings overview показывает passive registration-load error с Retry. Regression также
проверяет ровно один Telegram error haptic.

Fresh verification: `scripts/verify.ps1 -Scope Changed` и `-Scope Full` прошли. Full gate включал
tooling, one-head/upgrade/downgrade/re-upgrade/drift migrations, Ruff, 497 backend tests, 56 pinned
Remnawave contracts, frontend lint/typecheck, 70/70 unit tests, production build, 125/125 mobile
Playwright и docs. Новый focused audit matrix 16/16 прошёл на mobile, small-mobile, iOS WebKit и
desktop; Home и Settings evidence просмотрены в light/dark без overflow. Exact sponsor и rule errors
полностью находились в viewport и имели focus; sponsor state прошёл Axe без serious/critical
violations. Реальные Telegram/Tribute/Remnawave endpoints не вызывались.
