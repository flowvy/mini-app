# Понятная блокировка публикации sponsor offer без Tribute destination

Status: completed
Owner: Codex
Started: 2026-08-22
Updated: 2026-08-22

## Purpose

Не позволять администратору включить `Visible on Home` для subscription offer, пока для выбранной
Tribute subscription не сохранён payment destination, и показывать точную исправимую причину вместо
общей ошибки сохранения.

## Current state

- Frontend проверяет enabled rule, donation destination и duplicate subscription, но не получает
  `tributeSubscriptionUrls` в sponsor-offer editor.
- Backend fail-closed отклоняет публикацию текстом
  `Tribute subscription destination is not configured`.
- Admin route отдаёт этот доменный сбой строкой, хотя общий API client уже поддерживает
  `{code, message}` и локализацию по стабильному `code`.

## Scope

Входят frontend publish readiness, доступная подсказка у switch, стабильный backend error code,
локализованный fallback и детерминированные backend/frontend тесты. Полный перевод API на RFC 9457,
изменение Tribute/provider contract, схемы БД и реальные provider calls не входят.

## Acceptance

- При отсутствующем сохранённом destination switch остаётся обнаруживаемым, но не меняет состояние;
  рядом указано, что ссылку нужно добавить в `Payment links`.
- После сохранения destination тот же offer можно опубликовать без перезагрузки страницы.
- Backend по-прежнему повторно валидирует destination и возвращает стабильный machine code; frontend
  показывает точный локализованный текст для гонки или устаревшего client state.
- Неизвестные ошибки используют прежний общий fallback.

## Approach

1. Передать сохранённые subscription destinations из уже загруженных admin settings в editor и
   включить их в publish readiness без копирования provider-валидации.
2. Расширить общий Toggle опциональным `aria-disabled`/description contract, сохранив native
   `disabled` для существующих callers.
3. Типизировать доменную ошибку отсутствующего destination и отдать существующий `{code, message}`
   envelope на admin/debug HTTP boundaries.
4. Добавить focused service/route, localization и Playwright regression tests; затем пройти Changed
   и UI gates.

## Progress

- [x] 2026-08-22 01:51 +03:00 — traced frontend editor, settings cache, service validation, HTTP
  mapping и error-copy boundary; причина подтверждена.
- [x] 2026-08-22 02:00 +03:00 — реализован frontend publish readiness, focusable
  `aria-disabled` guard и стабильный backend error code с локализованным fallback.
- [x] 2026-08-22 02:07 +03:00 — focused, Changed и Full gates прошли; light/dark evidence
  просмотрены, стандартный dev пересобран и поднят повторно после обнаруженного мёртвого Vite.

## Surprises & Discoveries

- `useUpdateSettings` уже синхронно обновляет `adminSettings` в TanStack Query, поэтому publish
  readiness сможет измениться сразу после сохранения payment link без отдельного refetch.
- Финальная runtime-проверка обнаружила, что прежний backend/preview продолжали отвечать `200`, но
  Vite dev на `5173` уже завершился. Штатный restart сначала упёрся в fail-closed stale PID ownership,
  затем в уже очищенный tunnel marker; без force-kill после повторного safe lifecycle полный dev
  поднялся на новых tracked PID.

## Decision Log

- 2026-08-22 — не парсить English exception text и не мигрировать весь API на RFC 9457; использовать
  уже поддержанный Flowvy envelope `{code, message}` со стабильным доменным кодом.
- 2026-08-22 — недоступный switch оставить focusable через `aria-disabled`, связав его с видимой
  причиной; это сохраняет discoverability для keyboard/screen-reader navigation.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/backend`: focused `uv run pytest` для sponsor service и
  HTTP mapping → 3 passed; весь `test_sponsor.py` → 25 passed; Ruff lint/format passed.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: focused Vitest/Playwright, lint, typecheck,
  build → 70 unit passed; focused browser 2 passed; полный Tribute browser file 46 passed.
- Repository root: `pwsh ./scripts/verify.ps1 -Scope Changed` → 391 service-free backend, 70 unit,
  build и 121 browser passed. `PLAYWRIGHT_PORT=5204 pwsh ./scripts/verify.ps1 -Scope Full` →
  migrations/drift, 497 backend, 56 Remnawave contracts, 70 unit, build и 121 browser passed.
- UI: `/admin/settings/tribute`, missing/configured destination, `430x932`, light/dark, keyboard
  focus, Axe, console/network/overflow passed; оба screenshots просмотрены.
- Runtime: local `5173`, `8001/api/ready`, `4173`, public root/health/ready → `200`; public debug →
  `404`; local/public asset `index-BUOcmgKU.js`; backend log содержит `telegram_main_app_ready`.

## Recovery and rollback

Изменения source-only и не вызывают Tribute. Откат файлов задачи восстанавливает прежний UI/API
mapping; база и provider state не изменяются.

## Outcomes & Retrospective

Subscription offer больше нельзя перевести в заведомо непубликуемое состояние, когда сохранённый
Tribute destination отсутствует. Причина видна до submit и доступна assistive technology; сохранение
payment link обновляет guard без reload. Backend остаётся authoritative и при гонке отдаёт стабильный
code, поэтому UI показывает то же исправимое сообщение, а неизвестные сбои сохраняют общий fallback.
Реальные Tribute/Remnawave endpoints и payment/access mutations не вызывались.
