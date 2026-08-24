# Глобальный keyboard-aware TabBar

Status: completed
Owner: Пятница
Started: 2026-08-25
Updated: 2026-08-25

## Purpose

На touch-устройствах Flowvy скрывает нижний TabBar синхронно с фокусом любого текстового поля на
primary route, поэтому меню не появляется поверх уже открытой software keyboard. Поведение не
ограничивается Users search и автоматически применяется к существующим и будущим текстовым полям.

## Current state

`/admin/users/search` решает проблему структурно: это отдельный task route без TabBar. Общий
`AppShell` учитывает только pathname и не знает о focus. На primary `/support` есть user и admin
search inputs, при фокусе которых TabBar продолжает рендериться.

Официальный Telegram Mini Apps contract не предоставляет keyboard visibility event.
`viewportChanged` относится к visible viewport, имеет недостаточную частоту для плавного pinning,
а stable height обновляется после завершения жестов и анимаций. Media Queries Level 4 определяет
`(hover: none)` и `(pointer: coarse)` как primary touchscreen interaction, а Selectors Level 4 —
динамические `:focus`, `:read-write` и relational `:has()`. Это позволяет реагировать на focus до
keyboard animation без viewport geometry rewrite.

## Scope

Входят общий focus contract AppShell, CSS target classification, deterministic browser regression,
light/dark mobile evidence и актуализация проектной документации. Не входят synthetic blur,
`hideKeyboard()`, `scrollIntoView()`, изменение `visualViewport`, новые Telegram API и перестройка
маршрутов.

## Acceptance

- На mobile/touch primary route TabBar и нижний blur отсутствуют сразу после focus текстового поля
  и остаются отсутствующими при последующем viewport resize.
- После завершения ввода TabBar возвращается; route navigation не оставляет stale hidden state.
- Desktop/fine-pointer keyboard focus не скрывает top-level navigation.
- Users focused task route сохраняет существующий no-TabBar contract.
- Поведение покрыто user и admin Support search, mobile Chromium, iOS WebKit и desktop Chromium.

## Approach

1. На уровне AppShell объединить TabBar и нижний blur в общий layout-owned region.
2. Скрывать region стандартным CSS focus selector только при primary touch interaction.
3. Добавить focused Playwright matrix и проверить geometry, overflow, Axe, light/dark screenshots.
4. Выполнить Changed gate, обновить `PROJECT_STATE.md` и закрыть план.

## Progress

- [x] 2026-08-25 — прослежены AppShell, TabBar, route classification, Users и обе Support search
  surfaces; подтверждено отсутствие общего keyboard state.
- [x] 2026-08-25 — проверены official Telegram Mini Apps viewport contract и W3C focus/interaction
  selectors; прямого Telegram keyboard event нет.
- [x] 2026-08-25 — реализован общий focus contract и regression tests.
- [x] 2026-08-25 — UI matrix, Changed/Full gates и standard dev acceptance прошли.
- [x] 2026-08-25 — live Swiftgram обнаружил flash TabBar между blur и stable keyboard close;
  официальный stable viewport lifecycle добавлен в regression и прошёл focused 32/32.
- [x] 2026-08-25 — Changed/Full gates и standard dev acceptance повторены после closing fix.

## Surprises & Discoveries

- Старый Users fix не скрывает TabBar по keyboard state: он открывает отдельный focused route, где
  TabBar отсутствует по pathname.
- На текущих primary routes реальные text entries есть в user и admin вариантах `/support`; все
  остальные редакторы уже находятся на nested task routes без TabBar.
- Live Swiftgram показал, что focus-only CSS недостаточен для closing: WebView отправляет blur до
  завершения keyboard animation, поэтому navigation на кадр попадала в уменьшенный viewport.

## Decision Log

- 2026-08-25 — не использовать Telegram `viewportChanged` или `viewportStableHeight` для открытия
  клавиатуры или continuous bottom pinning: официальный contract прямо описывает позднее stable
  update и недостаточную частоту обновлений. Поздний stable event подходит только как completion
  signal после blur, что закреплено последующим live решением ниже.
- 2026-08-25 — скрывать TabBar только при text-entry focus и primary `(hover: none) and
  (pointer: coarse)` interaction; desktop navigation остаётся стабильной.
- 2026-08-25 — React focus state отклонён после static check: route reset потребовал бы отдельного
  effect lifecycle. CSS `:has(...:focus)` выражает тот же browser state напрямую и не может стать
  stale после blur или unmount.
- 2026-08-25 — live evidence опровергло достаточность focus-only решения для closing. Минимальный
  AppShell settling state разрешён только для Telegram touch path с реально уменьшившимся SDK
  `viewportStableHeight`; он снимается следующим height-changing stable SDK state. Browser,
  hardware keyboard и desktop не ждут Telegram event; timers и `VisualViewport` не добавляются.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: focused Playwright keyboard spec на
  `PLAYWRIGHT_PORT=5204`, затем lint, typecheck, unit tests и build.
- `/Users/x_kit_/Documents/Projects/mini-app`: `PLAYWRIGHT_PORT=5204 pwsh ./scripts/verify.ps1
  -Scope Changed`.
- UI: `/support` user/admin, 430x932, 390x844 iOS WebKit и 1280x900 desktop, light/dark, focus,
  simulated viewport resize, overflow, Axe и console/network checks.

## Recovery and rollback

Правка не меняет данные или API и обратима revert будущего коммита. Tests используют только mock API.

## Outcomes & Retrospective

`AppShell` теперь владеет одной bottom-navigation region: на primary touch route стандартный CSS
focus contract скрывает TabBar вместе с нижним blur сразу при фокусе editable control. Telegram
closing path дополнительно удерживает region до следующего stable viewport после фактического
уменьшения SDK height; timer и `VisualViewport` geometry отсутствуют. Desktop fine-pointer,
browser/hardware-keyboard fallback и существующий Users task route не изменены.

Focused keyboard suite прошёл 32/32 на mobile Chromium, small mobile Chromium, iOS WebKit и desktop
Chromium. Новый focus regression отдельно прошёл 4/4 со strict Axe и horizontal-overflow guards;
16 light/dark screenshots user/admin Support просмотрены. Changed gate прошёл lint, typecheck, 100
unit tests, production build, 217/217 mobile Playwright и Markdown links. Full gate дополнительно
подтвердил migration lifecycle/drift, Ruff, 558 backend tests и 56 pinned Remnawave contracts.
Standard Telegram-enabled dev пересобран с `index-Uufq1_Ph.js`: local frontend/backend/preview и
public root/health/ready возвращают `200`, public debug — `404`, PostgreSQL/Redis healthy,
`telegram_main_app_ready` подтверждён. Первая попытка restart обнаружила умерший Vite после ready;
официальный fail-closed down/up lifecycle был повторён, итоговые PID и endpoints проверены отдельно.

После live closing regression Telegram fixture стал отвечать на официальный initial viewport/safe
area request и детерминированно воспроизводит stable-open → blur → unstable-close → stable-closed.
Focused keyboard matrix повторно прошёл 32/32; Changed и Full подтвердили тот же полный набор gates.
Standard dev пересобран с `index-D3x_TX5B.js`; local/public endpoints, process ownership, Docker и
Telegram marker проверены независимо через 30 секунд после readiness. Владеющий `pwsh` оставлен
живым; предыдущий внешний `zsh` tail удерживал не тот shell и позволял Vite завершиться позже.
