# Нормальное открытие Flowvy в Telegram Desktop

Status: completed
Owner: Codex
Started: 2026-08-08
Updated: 2026-08-08

## Purpose

Flowvy должен открываться в Telegram Desktop в управляемом нативном окне клиента, без
необоснованного запроса изменения viewport/fullscreen со стороны Mini App. Мобильное поведение
должно сохраняться только в пределах документированного Telegram WebApp API.

## Current state

- Скриншот пользователя от 2026-08-08 показывает WebView Flowvy, который выходит далеко за
  геометрию узкого окна Telegram Desktop и не имеет доступной области перетаскивания.
- На машине воспроизводится Telegram Desktop `7.0.6.0` из Microsoft Store; главное окно во время
  диагностики имеет нативную геометрию `719x1399` logical pixels.
- Frontend использует `@telegram-apps/sdk-react 3.3.9` и вложенный `@telegram-apps/sdk 3.11.8`.
- `frontend/src/lib/telegram.ts` после `viewport.mount()` безусловно вызывает `viewport.expand()`;
  `viewport.requestFullscreen()` вызывается автоматически только для `android`, `android_x`, `ios`.
- Официальный Telegram Mini Apps contract на `https://core.telegram.org/bots/webapps` (доступ
  2026-08-08) определяет `expand()` только как расширение до максимальной доступной высоты,
  `requestFullscreen()` как отдельный Bot API 8.0+ запрос, а Main Mini App по умолчанию уже открывает
  на полную высоту. API не предоставляет Mini App управление шириной, координатами или нативным
  drag-area окна Telegram Desktop.
- Официальный открытый issue Telegram Desktop `#30963` описывает точно такую геометрию на Windows
  с несколькими мониторами: fullscreen-панель получает размеры экрана, но сохраняет прежнюю точку
  привязки, выходит за правый/нижний край и становится непригодной для управления.
- В исходнике официального Telegram Desktop tag `v7.0.6` WebView сообщает платформу `tdesktop`,
  обрабатывает `web_app_request_fullscreen` и `web_app_exit_fullscreen`, но не содержит обработчика
  `web_app_expand`. Следовательно, текущий `expand()` Flowvy не может исправить или вызвать
  наблюдаемую desktop-геометрию.

## Scope

Входит: точная проверка Telegram Desktop 7.0.6 и SDK 3.11.8, минимальная правка Telegram frontend
adapter, deterministic regression tests, desktop/mobile UI verification, обновление интеграционной
документации и project state.

Не входит: изменение нативного Telegram Desktop, BotFather launch mode, production deployment,
изменение auth/backend/provider контрактов.

## Acceptance

- Telegram Desktop (`tdesktop`) не получает автоматические `web_app_expand` или
  `web_app_request_fullscreen`; существующее мобильное поведение не меняется этим desktop fix.
- Если Telegram Desktop (`tdesktop`) сообщает при старте уже активный fullscreen, Flowvy один раз
  вызывает документированный `web_app_exit_fullscreen`, возвращаясь в управляемую оконную панель.
- Обычный браузер остаётся работоспособным без Telegram SDK.
- Frontend lint, typecheck, unit, production build и релевантный Playwright desktop/mobile smoke
  проходят свежо; public Tunnel после перезапуска отдаёт новый production asset и закрытый debug
  route.
- Реальное положение нативного окна повторно проверяет пользователь в Telegram Desktop, поскольку
  Playwright не управляет оболочкой Telegram.

## Approach

1. Сопоставить официальный Bot API/Mini Apps документ, установленный SDK и официальный исходник
   Telegram Desktop 7.0.6.
2. Добавить узкий deterministic test на platform-specific startup commands.
3. Изменить только Telegram adapter; не маскировать проблему CSS width/max-width.
4. Запустить frontend и UI gates, инспектировать desktop/mobile screenshots и public Tunnel.
5. Обновить устойчивую документацию, закрыть план и перенести его в `plans/completed/`.

## Progress

- [x] 2026-08-08 00:31 +03:00 — зафиксированы скриншот, чистый `dev`, Telegram Desktop 7.0.6,
  locked SDK 3.11.8 и текущие startup-вызовы.
- [x] 2026-08-08 00:31 +03:00 — полностью прочитаны `flowvy-integration`, `flowvy-ui-verify`,
  `flowvy-verify`, frontend/test instructions и UI state matrix.
- [x] 2026-08-08 00:31 +03:00 — прочитан официальный Telegram Mini Apps contract; подтверждено,
  что `expand` управляет высотой, fullscreen является отдельным запросом, Main Mini App уже full-height.
- [x] 2026-08-08 — проверены официальный tag Telegram Desktop `v7.0.6`, locked SDK 3.11.8 и
  официальный issue `#30963`; подтверждён нативный Windows multi-monitor fullscreen bug.
- [x] 2026-08-08 — добавлены `tdesktop` startup policy, documented fullscreen-exit recovery и 13
  deterministic unit cases; mobile behavior сохранён.
- [x] 2026-08-08 — свежо пройдены frontend/Changed gates и 86 Playwright mobile+desktop scenarios;
  light/dark desktop/mobile Home screenshots просмотрены, public Tunnel отдаёт новый asset.
- [x] 2026-08-08 — обновлены integration evidence и project state.
- [x] 2026-08-08 — владелец подтвердил возврат Flowvy в управляемую оконную панель Telegram
  Desktop 7.0.6. Дополнительно подтверждено по locked `lib_ui`, что компактный размер `384x694`
  задаёт клиент, а окно можно увеличить за любую границу или угол.

## Surprises & Discoveries

- Ширина и положение окна на скриншоте не являются параметрами WebApp API; CSS страницы не может
  законно управлять нативной геометрией Telegram Desktop.
- Platform, которую передаёт Telegram Desktop, — строго `tdesktop`; текущий mobile-only
  `requestFullscreen()` Flowvy на ПК не выполняется.
- Telegram Desktop 7.0.6 не обрабатывает `web_app_expand`; вызов Flowvy является лишним и не связан
  с нативным смещением панели.

## Decision Log

- 2026-08-08 — не вводить CSS `max-width` как исправление нативного окна: это изменит только
  раскладку контента внутри уже неверно размещённого WebView и не восстановит drag-area.
- 2026-08-08 — не менять BotFather или launch link до доказательства: Main Mini App full-height —
  документированное поведение, а `mode=compact` меняет стартовую высоту, не desktop width/position.
- 2026-08-08 — не отправлять `expand()` и `requestFullscreen()` только на `tdesktop`: первый вызов
  официальный клиент 7.0.6 игнорирует, второй для этой платформы и раньше не отправлялся. Мобильное
  поведение сохранить, поскольку оно не связано с Windows multi-monitor bug.
- 2026-08-08 — применять документированный `exitFullscreen()` только к `tdesktop`, только когда
  mounted viewport уже сообщает fullscreen. Это обход открытого бага клиента, а не попытка
  управлять недоступными WebApp API координатами окна.

## Verification

- `E:\mini-app\frontend`: targeted Vitest → 13/13 Telegram viewport cases passed.
- `E:\mini-app\frontend`: `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build` → 166 files,
  5 unit files / 26 tests and production build passed; only the pre-existing Vite >500 kB warning.
- `E:\mini-app\frontend`: Playwright mobile-chromium + desktop-chromium → 86/86; overflow,
  console/page/network/axe guards passed; Home light/dark desktop/mobile screenshots inspected.
- `E:\mini-app`: `scripts/verify.ps1 -Scope Changed` → frontend and Markdown links passed.
- `https://dev-app.flowvy.io`: root/asset/health/readiness `200`, debug route `404`; public index serves
  the fresh `/assets/index-e_EVoaqR.js` build.

## Recovery and rollback

Frontend change is code-only and reversible by restoring the affected Telegram adapter/test/docs
diff. No database, Telegram BotFather, provider or Cloudflare state will be changed. Restarting dev
uses `scripts/dev-down.ps1` followed by the documented named-Tunnel `dev-up` command.

## Outcomes & Retrospective

Официальный issue `#30963` подтвердил, что исходный скриншот показывает нативный Telegram Desktop
fullscreen placement bug, а не CSS overflow Flowvy. App-side mitigation опубликован в dev Tunnel;
владелец подтвердил успешный возврат из смещённого fullscreen в управляемую оконную панель.
Промежуточный стартовый размер нельзя задать через Mini Apps API: Telegram Desktop 7.0.6 создаёт
resizable панель с initial inner size `384x694`, поэтому дальнейшее увеличение остаётся нативным
пользовательским resize.
