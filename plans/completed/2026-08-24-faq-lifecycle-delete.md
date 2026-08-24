# Явный lifecycle и удаление FAQ

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-25

## Purpose

Администратор видит и использует три однозначных состояния FAQ-статьи: `draft`, `published` и
`archived`. Архивирование доступно только для опубликованной статьи, повторная публикация без
изменений не предлагается, а любую сохранённую статью можно безвозвратно удалить после
подтверждения.

## Current state

Модель и API уже хранят статусы `draft`, `published`, `archived`, но редактор всегда показывает
`Publish` для пригодного к публикации содержимого и показывает `Archive` как для опубликованной,
так и для черновой статьи. Backend и frontend не имеют операции удаления. Публичные endpoints уже
возвращают только опубликованные статьи.

## Scope

В работу входят admin/debug API удаления, service/repository lifecycle, React Query mutation,
редактор и список FAQ, локализованные тексты, mock API, backend и browser tests, а также актуализация
проектной документации. Изменение схемы БД и удаление реальных данных не требуются.

## Acceptance

- `archived` доступен как следующий status только у существующей опубликованной статьи.
- У опубликованной неизменённой статьи нет активной `Publish`; сохранение изменений становится
  доступно только после правки.
- Черновик можно опубликовать, опубликованную статью снять с публикации или архивировать,
  архивированную — восстановить как черновик.
- Любую существующую статью можно удалить только после явного подтверждения; API отвечает пустым
  `204`, а повторное удаление — `404`.
- Удалённая статья исчезает из admin/public caches и списков.
- Изменённый поток проверен backend tests и Playwright в light/dark на поддерживаемых viewport.

## Approach

1. Добавить минимальный hard-delete поверх существующего `BaseRepository.delete()` и admin/debug
   routes с `204 No Content`.
2. Добавить React Query deletion mutation и статус-зависимые действия редактора.
3. Обновить mock API и deterministic tests для переходов, dirty state, подтверждения и ошибки.
4. Выполнить узкие проверки, затем diff-aware gate, UI-матрицу и финальный review.

## Progress

- [x] 2026-08-24 22:59 +03:00 — прослежены модель, schema, repository, service, routes, hooks,
  редактор и существующие tests; подтверждено, что миграция не нужна.
- [x] 2026-08-24 23:18 +03:00 — admin/debug `DELETE` возвращает пустой `204`, сервис удаляет
  существующую статью и даёт `404` для отсутствующей; focused backend tests прошли 4/4.
- [x] 2026-08-24 23:18 +03:00 — редактор показывает действия по текущему статусу, clean published
  article имеет disabled `Save changes` без `Publish`, delete confirmation и cache invalidation
  покрыты mock API.
- [x] 2026-08-24 23:18 +03:00 — focused lifecycle/delete/order Playwright прошёл 12/12 на четырёх
  projects; отдельный lifecycle visual/Axe прогон прошёл 4/4, light/dark и destructive dialog кадры
  просмотрены без overflow или visual findings.
- [x] 2026-08-24 23:12 +03:00 — Changed и Full gates прошли; Full подтвердил migration lifecycle,
  558 backend, 56 pinned contracts, 100 frontend unit, production build и 214/214 mobile Playwright.
- [x] 2026-08-24 23:12 +03:00 — standard Telegram-enabled dev пересобран и восстановлен после
  fail-closed stale PID cleanup; local и public acceptance зелёные, volumes сохранены.
- [x] 2026-08-24 23:46 +03:00 — после live iOS feedback действия разделены по назначению:
  сохранение осталось в `Article details`, переходы вынесены в `Article status`, удаление — в
  отдельную destructive-зону; focused lifecycle прошёл 4/4, light/dark кадры 320 px и iOS WebKit
  просмотрены без overflow или Axe findings.
- [x] 2026-08-25 — после повторного owner review изучены publishing/action patterns Sanity,
  WordPress, Contentful и Ghost, а также Carbon и GOV.UK guidance. Отдельные lifecycle cards
  удалены: status стал полем статьи, одна primary action применяет контент и переход, а initial
  delete de-emphasized до compact secondary action; focused lifecycle снова прошёл 4/4.
- [x] 2026-08-25 — live Swiftgram iOS показал белые края после успешного FAQ delete: этот flow всё
  ещё использовал WebKit `<dialog>`, тогда как Communication discard уже был переведён на Telegram
  Popup. `ConfirmDialog` теперь требует native message во всех 15 callsites и в поддерживаемом
  Telegram использует `web_app_open_popup`; FAQ success/failure/retry покрыты отдельными bridge
  scenarios. Focused Support matrix прошла 72/72 на четырёх Playwright projects, post-delete iOS
  WebKit evidence просмотрено без dialog layer, overflow или белых краёв.
- [x] 2026-08-25 — пять прежних browser tests, которые симулировали Telegram, переведены с DOM
  dialog assertions на официальный `popup_closed` lifecycle; focused repeat прошёл 5/5. Повторный
  Full gate зелёный: migrations/drift, 558 backend, 56 contracts, lint/typecheck, 100 unit,
  production build, 216/216 mobile Playwright и Markdown links.
- [x] 2026-08-25 — standard Telegram-enabled dev штатно пересобран после fail-closed stale PID
  inspection; public asset `index-D5gb8iY7.js`, local/public readiness, Docker health, public debug
  404 и `telegram_main_app_ready` подтверждены.

## Surprises & Discoveries

- `BaseRepository` уже реализует SQLAlchemy `AsyncSession.delete()` с немедленным `flush()`, поэтому
  отдельный repository contract или миграция не нужны.
- Telegram Popup принимает только plain-text message и до трёх кнопок. Поэтому operator Resolve,
  где обязателен редактируемый resolution note, остаётся form-dialog: заменить его Popup без потери
  данных и accessibility невозможно по официальному contract.

## Decision Log

- 2026-08-24 — удаление разрешено для любой существующей статьи; иначе черновик нельзя ни
  архивировать по новой модели, ни убрать из системы.
- 2026-08-24 — архивированную статью можно только восстановить в черновик, а не публиковать
  напрямую; это сохраняет явные три состояния и обязательную проверку содержимого перед публикацией.
- 2026-08-25 — status является редактируемым свойством документа с ограниченными вариантами от
  сохранённого состояния; одна contextual primary action применяет и контент, и status. Это
  соответствует фактическому API contract и распространённому CMS publishing model без нового
  menu/popover primitive.
- 2026-08-25 — initial delete остаётся neutral compact action, а negative button используется в
  confirmation. Это следует GOV.UK guidance не применять warning style к первому шагу и не даёт
  редкому destructive действию конкурировать с сохранением.
- 2026-08-25 — общий `ConfirmDialog` требует явный `telegramNativeMessage` и использует официальный
  native Popup при доступном Mini Apps v6.2+ contract; HTML dialog остаётся fallback для обычного
  browser/unsupported client. Async failure повторно открывает native confirmation с безопасной
  локализованной ошибкой и исходным consequence text. Единственное явное `null` — Resolve с
  обязательным note input, который Popup API не умеет отображать.
- 2026-08-25 — Telegram contract проверен по
  [официальному Mini Apps Popup API](https://core.telegram.org/bots/webapps#popupparams),
  [platform overview](https://docs.telegram-mini-apps.com/platform/popup) и locked
  `@telegram-apps/sdk` 3.11.8 source map: title до 64, message 1–256, 1–3 buttons,
  destructive button и `popup_closed` поддерживаются.
- 2026-08-25 — UX references: [Sanity Document Actions](https://www.sanity.io/docs/studio/document-actions-api),
  [WordPress Post Status](https://wordpress.org/documentation/article/post-status/),
  [Contentful entries](https://www.contentful.com/help/content-and-entries/),
  [Ghost publishing](https://ghost.org/help/publishing-content/),
  [Carbon menu buttons](https://carbondesignsystem.com/components/menu-buttons/usage/) и
  [GOV.UK buttons](https://design-system.service.gov.uk/components/button/).
- 2026-08-24 — API удаления использует `DELETE .../{id}` с пустым `204 No Content`, согласно
  [официальному контракту FastAPI](https://fastapi.tiangolo.com/tutorial/response-status-code/);
  отсутствующий id остаётся `404`. Repository переиспользует документированный
  [SQLAlchemy `Session.delete()`](https://docs.sqlalchemy.org/en/20/orm/session_basics.html#deleting).

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/backend`: focused `uv run pytest ...` и lint/format.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build` и focused Playwright Support scenarios.
- `/Users/x_kit_/Documents/Projects/mini-app`: `pwsh ./scripts/verify.ps1 -Scope Changed`.
- UI: admin FAQ editor/list, light/dark, 320x700 и 390x844, transitions, delete cancel/success/error,
  console/network и Axe.

## Recovery and rollback

Кодовая правка обратима обычным revert будущего коммита. Тесты используют только disposable test DB
и in-memory mock fixtures. Реальные FAQ-статьи не удаляются в ходе проверки.

## Outcomes & Retrospective

FAQ получил однозначные статусные действия и полноценное безопасное удаление без изменения schema.
Backend, cache invalidation, success/cancel/failure UI и public disappearance покрыты на минимальном
уровне. Полный gate и runtime acceptance зелёные; реальные FAQ-данные не удалялись. Первый штатный
shutdown остановился на fail-closed ownership check для уже исчезавшего PID, повторный вызов после
read-only inspection корректно очистил markers и сохранил Docker volumes.
