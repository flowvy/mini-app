# Полная русская локализация Flowvy

Status: completed
Owner: Пятница
Started: 2026-08-25
Updated: 2026-08-25

## Purpose

Flowvy автоматически выбирает русский интерфейс для русской browser/Telegram locale, сохраняя
английский fallback. Пользовательский, административный и Telegram bot-copy остаются цельными,
короткие строки не ломают существующий layout, а runtime-данные provider не переводятся.

## Current state

- Frontend загружает полные `en.json` и `ru.json` по 1 140 одинаковых leaf-paths через i18next.
- Backend product-copy содержит English и Russian catalogs по 17 одинаковых leaf-paths.
- `Accept-Language` уже передаётся BFF, Telegram bot использует locale пользователя, а
  `Intl.DateTimeFormat`/money formatting используют активную i18n locale.
- До задачи были изменены `docs/PROJECT_STATE.md` и `scripts/dev-reset-data.ps1`; эти правки не
  относятся к локализации и должны быть сохранены без перезаписи.

## Scope

Входит полный русский frontend catalog, русский backend bot catalog, согласованные короткие термины,
plural-формы, locale tests и детерминированная UI-проверка русского интерфейса. Не входят перевод
runtime provider facts, operator-authored content, изменение layout/CSS и публикация Git.

## Acceptance

- Русская locale имеет полный product-copy без случайного English fallback.
- Принятые термины соблюдены: `Помощь`, `Базовый доступ`, `Extended access`/`Расширенный доступ`,
  `Инструкция по установке`, короткие `Юзеры`, `Устройства`, `Тикет`.
- Placeholders и template capabilities совпадают с English; Russian plural-формы корректны.
- На 320x568, 430x932 и 1280x900 нет нового horizontal overflow, обрезанных critical controls,
  console/network/Axe ошибок в проверенных русских сценариях.
- Fresh change-aware verification проходит; пропущенные проверки явно зафиксированы.

## Approach

1. Инвентаризировать locale consumers, plural-sensitive keys и UI state matrix.
2. Подготовить полный русский frontend/backend catalog с сохранением структуры и placeholders.
3. Добавить/обновить catalog, fallback, plural и locale-selection tests.
4. Запустить targeted checks, затем diff-aware/full verification и русский Playwright pass.
5. Просмотреть diff и UI artifacts, обновить проверенные факты в документации, закрыть ExecPlan.

## Progress

- [x] 2026-08-25 — зафиксированы исходный Git state, source-of-truth, catalog size и locale boundary.
- [x] 2026-08-25 — подготовлен и сведен полный русский frontend/backend catalog.
- [x] 2026-08-25 — parity, placeholders, согласованные термины и locale selection покрыты тестами.
- [x] 2026-08-25 — пройдены fresh full code и UI verification.
- [x] 2026-08-25 — итоговый diff и UI evidence просмотрены, план закрыт.

## Surprises & Discoveries

- Новый locale обязан покрыть также админку: частичный пользовательский перевод нарушит принятое
  ADR 0002 требование полной locale и покажет смешанный язык администратору.
- Появление второго locale сделало language selector видимым в operator editors и потребовало copy
  обоих языков для sponsor offer; старые E2E fixtures были обновлены под реальный контракт.
- Один rich-text E2E терял клавиатурное selection перед нажатием Bold; детерминированный Selection API
  устранил browser race без изменения production-кода.

## Decision Log

- 2026-08-25 — использовать цельный `ru.json`, а не частичный fallback; это сохраняет единый язык UI.
- 2026-08-25 — измерять constrained copy в реальном UI, а не только по числу символов.
- 2026-08-25 — `Flowvy Support` остаётся названием службы; остальные Support surfaces используют
  русское `Помощь` с грамматически корректными формами.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: targeted Vitest locale tests, затем
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Repository root: `pwsh ./scripts/verify.ps1 -Scope Changed`; при доступной полной среде
  `pwsh ./scripts/verify.ps1 -Scope Full`.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: deterministic Playwright на русской locale для
  user routes и representative admin surfaces в 320x568, 430x932 и 1280x900, light/dark.

## Recovery and rollback

Изменения ограничены locale resources, locale tests и документацией. Откат выполняется удалением
новых locale-файлов и относящихся к ним тестовых изменений; БД, provider и внешние сервисы не
затрагиваются.

## Outcomes & Retrospective

Добавлены полные Russian catalogs для Mini App/admin и backend bot product-copy. English user-facing
`Sponsor access` заменён на `Extended access`; Russian использует принятые `Помощь`, `Базовый доступ`,
`Расширенный доступ`, `Инструкция по установке`, `Юзеры`, `Устройства` и `Тикет`. Operator-authored и
provider-owned runtime content остаются без автоматического перевода.

Fresh `pwsh ./scripts/verify.ps1 -Scope Full` прошёл: migrations/drift checks, 559 backend tests,
56 pinned Remnawave contracts, frontend lint/typecheck, 106 unit tests, production build и 220/220
mobile Chromium scenarios. Отдельная Russian UI matrix прошла 6/6 на 320x568, 430x932 и 1280x900 в
light/dark с overflow, clipped-controls, console/network и Axe guards; screenshots просмотрены вручную.
