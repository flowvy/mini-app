# Локализованный provider-neutral UI и единые error states

Status: completed
Owner: Codex
Started: 2026-08-11
Updated: 2026-08-11

## Purpose

Flowvy Mini App не должен содержать пользовательский текст в React/HTML-коде, показывать raw
backend diagnostics или предполагать, что имя, поддержка и коммуникация любого развёртывания
совпадают с Flowvy. Все product-owned формулировки должны находиться в locale, operator-owned
факты — приходить из typed backend contract, а все полноэкранные ошибки — использовать один
переиспользуемый UI/UX.

## Current state

- Единственная locale `frontend/src/i18n/locales/en.json` содержит 416 leaf keys; статический scan
  нашёл 13 неиспользуемых кандидатов.
- Прямой frontend hardcode включает `Photo`, `Animation`, `User not found`, document title
  `Flowvy`, version/ratio/separator text и generic `Request failed (...)`. Несколько mutation и
  onboarding surfaces напрямую показывают `error.message` из backend response.
- `LoadErrorState` переиспользуется для большинства query failures, но auth failure, admin denial
  и missing admin user имеют отдельную разметку и поведение.
- `appName` и `logoUrl` уже динамичны; Telegram welcome text/media/button, access-profile
  name/description, Remnawave subscription data и Pulse names/incidents также provider-owned.
  Однако invite share copy всё ещё называет Flowvy напрямую, а Support остаётся статическим
  `Coming soon` и не имеет operator contact contract.
- Предыдущая незакоммиченная status-normalization задача сохранена в рабочем дереве и входит в
  общий final diff, но её поведение не должно быть отменено.

## Scope

Входит:

- каждый user-visible frontend string и accessible label — только locale или typed dynamic data;
- запрет отображения raw API/backend message и локализованное отображение machine error codes;
- единый `ErrorState` для load/auth/forbidden/not-found screen states;
- динамические support title/description/button/URL в provider settings, public branding response,
  admin branding UX и user Support route;
- динамическое service name в share copy и document title;
- удаление неиспользуемых locale keys и automated catalog/hardcode regression guard;
- migration, backend/frontend contract tests, deterministic UI matrix и product-copy policy doc.

Не входит:

- runtime CMS для каждой кнопки/подсказки: structural product language остаётся locale-owned;
- добавление второй language locale или автоматический перевод;
- тарифный/payment UX, которого сейчас нет; существующие access-profile/provider data остаются
  источником названий, описаний, лимитов и статусов;
- локализация внутренних exception/log/HTTP diagnostic strings, которые не показываются человеку.

## Acceptance

- AST-based test не находит literal text в JSX/visible accessibility attributes и неиспользуемые
  locale leaf keys; известные dynamic-data исключения описаны узко.
- Ни один frontend surface не рендерит `ApiError.message`; onboarding codes имеют locale mapping,
  а неизвестная ошибка получает общий локализованный fallback.
- Query, auth, access-denied и user-not-found screens визуально и семантически используют один
  `ErrorState`; retry/back actions доступны с клавиатуры и имеют locale labels.
- Provider может из Admin UI задать support copy/action/URL; пользователь видит эти значения, а
  при пустой конфигурации — locale-owned fallback без ложной ссылки.
- App name меняет header, onboarding, share text и document title; Flowvy остаётся только
  locale-owned default/software identity.
- Миграция имеет upgrade/downgrade, один head и model drift checks; focused и changed-scope gates,
  UI light/dark mobile/desktop evidence проходят свежо.

## Approach

1. Зафиксировать copy ownership policy и полный машинный audit hardcode/locale/error surfaces.
2. Расширить provider settings support-полями и протянуть их через admin/public/onboarding contracts.
3. Централизовать frontend error presentation и machine-code-to-locale mapping.
4. Перенести literal formatting/media/not-found/document/share text в locale или dynamic data;
   удалить orphan keys и добавить regression catalog test.
5. Добавить backend/frontend/E2E coverage, проверить migration и визуальную матрицу, обновить
   канонические документы и закрыть план.

## Progress

- [x] 2026-08-11 01:49 +03:00 — прочитаны repository/UI/migration rules, проверено рабочее дерево,
  traced branding/subscription/onboarding/error flows; найдено 13 unused locale candidates и
  несколько raw-message/hardcode bypasses.
- [x] 2026-08-11 02:08 +03:00 — реализованы typed support settings/public branding contract,
  credential-free HTTPS validation и nullable Alembic migration; focused contract tests и полный
  migration verifier прошли.
- [x] 2026-08-11 02:08 +03:00 — унифицирован error UI, локализованы frontend literals и очищен
  locale catalog.
- [x] 2026-08-11 02:08 +03:00 — добавлены AST catalog/hardcode/raw-message guard, operator content
  policy, dynamic title/share/Support и light/dark mobile/desktop browser evidence.
- [x] 2026-08-11 02:42 +03:00 — полный gate завершён: migrations, 318 backend tests, 53
  Remnawave contract tests, frontend lint/type/unit/build, 50 mobile Chromium scenarios и docs;
  дополнительная all-project matrix — 200/200.

## Surprises & Discoveries

- `home.invite.shareText` хранится в locale, но содержит literal service name `Flowvy`; перенос в
  locale сам по себе не делает такой текст provider-neutral — имя должно быть interpolation data.
- Backend error detail считается safe diagnostic, однако четыре frontend mutation/onboarding
  surfaces рендерят `.message` напрямую, обходя locale и позволяя transport copy управлять UX.
- Existing branding contract покрывает identity, но Support — operator-owned factual content — не
  имеет ни backend settings, ни рабочего route content.
- Первый browser test обнаружил, что старый `FormRow` показывал App Name как визуальную подпись, но
  не связывал её с input. Добавлен optional `htmlFor`; branding inputs теперь имеют корректные
  accessible names.

## Decision Log

- 2026-08-11 — locale владеет навигацией, действиями, статусами, структурными объяснениями и
  fallback copy; backend provider settings владеют identity/support/welcome, а provider contracts —
  именами access/subscription/monitor и фактическими лимитами. Это сохраняет переводимость и
  предсказуемый UX без runtime CMS для сотен строк.
- 2026-08-11 — raw backend message остаётся диагностикой transport layer и никогда не показывается
  пользователю; UI выбирает locale по стабильному code/status/context.
- 2026-08-11 — inline validation/mutation feedback остаётся компактным `InlineFeedback`, но текст
  локализуется; полноэкранные ошибки сходятся в один `ErrorState`.

## Verification

- `E:\mini-app\backend`: focused provider-settings/user/registration tests и Ruff.
- `E:\mini-app`: `scripts/verify-migrations.ps1` → zero/head/downgrade/re-upgrade/one-head/drift.
- `E:\mini-app\frontend`: Biome, TypeScript, full Vitest, production build.
- `E:\mini-app\frontend`: Playwright error/support/branding matrix на 320x568, 430x932 и 1280x900,
  light/dark evidence, keyboard/overflow/console/network/Axe checks.
- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Changed` → final diff-aware gate.

## Recovery and rollback

Никакие live provider/bot calls не нужны. Support columns nullable; downgrade удаляет только новые
columns и поэтому должен выполняться лишь на disposable verification DB. Кодовый откат — reverse
patch frontend/backend/docs и downgrade новой migration в заведомо тестовой БД.

## Outcomes & Retrospective

- Product copy и formatting сосредоточены в locale; удалены orphan keys, а AST regression test
  не пропускает unused leaf, visible JSX literal и raw backend error message.
- Provider может без frontend-форка настроить service name/logo, Support copy/HTTPS action и bot
  welcome. Access profiles и provider facts остаются typed runtime data; runtime CMS не появился.
- Load/auth/forbidden/not-found используют общий `ErrorState`; mutation feedback остаётся inline.
- Nullable migration обратима и прошла zero/previous/head/downgrade/re-upgrade/model drift checks.
- Полная backend/frontend/mobile gate и расширенная 200-scenario mobile/desktop/WebKit matrix прошли;
  светлые/тёмные артефакты затронутых экранов просмотрены вручную.
