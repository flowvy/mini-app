# Единая иерархия поверхностей всей Mini App

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-24

## Purpose

Согласовать background и border roles на всех пользовательских и административных маршрутах Mini
App по одной модели визуальной глубины. Одинаковые по назначению и глубине поля, editor bodies,
карточки и вложенные сущности должны выглядеть одинаково независимо от route family; различия
допустимы только для доказуемо разных semantic state или structural depth.

## Initial state

- В рабочем дереве находится незакоммиченная завершённая чистка Support и Settings; эти изменения
  сохраняются и входят в исходный diff задачи.
- Текущий Support Request reply использует `floor-0` body с `bg-primary` editor, тогда как Tone of
  Voice использует transparent fields wrapper внутри `bg-primary` Settings panel с тем же
  `bg-primary` editor. Разница возникла из route-specific Desktop analogs, а не из продуктового
  различия editing surface.
- `frontend/src/router.ts` содержит 32 route, включая user, Support task, admin и Settings task
  surfaces. Предыдущий focused regression подробно покрывал Support/Settings, но не доказывал
  единую cross-route hierarchy всей Mini App.
- Shared color values остаются runtime-копией текущего `flowvy_desktop`; задача меняет применение
  semantic roles, а не значения palette.

## Scope

Входят все route components из `frontend/src/router.ts`, используемые ими shared components и CSS
Modules, light/dark hierarchy, responsive route states, deterministic Playwright contracts,
ADR 0004 и `PROJECT_STATE`. Не входят backend/API/schema, реальные Telegram/provider calls,
изменение shared token values, commit и push.

## Acceptance

- Для каждого route есть прочитанный source inventory: page owner, outer surface, section/card,
  nested entity/group, control/data surface, semantic status exceptions и border owner.
- Одинаковая глубина использует один background/border contract во всех route families; ни один
  parent/child pair не различается только из-за случайно выбранного Desktop аналога.
- Все 32 route открываются deterministic fixture; representative normal/editor/dialog states
  проверены в light/dark на 430x932, 320x568, WebKit 390x844 и desktop 1280x900.
- Свежие UI проверки не имеют Axe, overflow, console, pageerror, failed request или unexpected mock
  findings; lint, typecheck, unit tests, production build, Changed и Full gates проходят.
- Два независимых критика после реализации проверяют static mapping и runtime evidence. Каждое их
  возражение сверяется с source, Desktop reference и воспроизводимым runtime до принятия или
  мотивированного отклонения.

## Approach

1. Прочитать route/page/shared style source и текущий Desktop reference; построить owner/depth map.
2. Зафиксировать единый cross-route semantic contract тестом, сначала получив воспроизводимые
   failures текущих расхождений.
3. Внести минимальные shared-owner изменения и точечные variants только для иной глубины/state.
4. Прогнать focused functional/visual/Axe matrix и вручную просмотреть generated evidence.
5. Передать финальный diff static и runtime критикам, проверить их claims и повторить свежие gates.
6. Обновить ADR, `PROJECT_STATE`, закрыть и перенести план после подтверждённого результата.

## Progress

- [x] 2026-08-24 18:46 +03:00 — зафиксированы branch/diff и полный route inventory; исходный dirty
  diff сохранён без отката.
- [x] 2026-08-24 18:46 +03:00 — прочитаны repository/frontend/e2e/docs rules, `flowvy-ui-verify`,
  `flowvy-verify`, state matrix и предыдущий surface-cleanup plan.
- [x] 2026-08-24 20:08 +03:00 — построен полный cross-route owner/depth inventory: page canvas,
  read-only card, nested entity, editing body, standalone/contained control и semantic state разделены
  по назначению, а не по route family.
- [x] 2026-08-24 20:12 +03:00 — новый exact computed-style regression сначала воспроизвёл
  `transparent` Settings body против ожидаемого `floor-0` в обеих темах.
- [x] 2026-08-24 20:31 +03:00 — добавлен shared `FormSurfaceBody`; на него переведены Support create/
  reply/article editor, все `SettingsFields`, Access profile, Commerce rule и onboarding forms.
- [x] 2026-08-24 — focused semantic hierarchy matrix прошла 76/76 на четырёх
  browser projects; exact background/border/outline/shadow/text contracts, dialog Axe, overflow и
  onboarding padding проверены в обеих темах.
- [x] 2026-08-24 — полный visual suite прошёл 80/80; все 32 routes прошли light/dark
  Axe и overflow, а изменённые Request, Quick Answer, Settings, dialogs и onboarding screenshots
  просмотрены вручную.
- [x] 2026-08-24 — static и runtime критики независимо проверили latest tree; их
  claims воспроизведены и разрешены по source/runtime evidence, включая отклонённые stale и
  touch-hover ожидания.
- [x] 2026-08-24 — fresh mobile Playwright прошёл 210/210; Changed и Full gates прошли
  migrations/drift, Ruff, 558 backend, 56 contracts, lint/typecheck, 100 unit tests, build, browser
  и docs. Standard dev пересобран и перезапущен, local/public acceptance зелёная.

## Surprises & Discoveries

- Предыдущий план локально подтвердил обе композиции разными Desktop аналогами, но не сравнил
  Request reply и Tone of Voice как peer editing surfaces Mini App.
- В актуальном router 32 маршрута, а не 31: предыдущий visual suite не включал семь nested Support
  routes и `/admin/settings/support`.
- Тот же случайный `primary -> primary` collapse обнаружился не только в Settings, но также в
  Access profile, Commerce rule и invite-onboarding forms; standalone Users/Support search,
  Sponsor editor и Activity resolve textarea имеют другую owner depth и не требуют перекраски.
- Первый вариант унификации ошибочно вложил `floor-0` внутрь primary cards. Static adversarial review
  доказал, что current Desktop использует `floor-0` только как page/dialog canvas, а Settings/Modal
  field bodies оставляет transparent; точный contract был исправлен до финальных gates.
- Удаление старого Commerce `.fields` class одновременно задело Sponsor offer editor. Runtime critic
  нашла import-graph regression; оба Sponsor blocks переведены на shared owner и получили exact test.
- Shared onboarding `padding: 0` сначала был правильным по source intent, но проигрывал cascade
  более позднему `.surfaceBody`; computed runtime test поймал фактические `14px`. Локальный
  `.form .formBody` теперь надёжно сохраняет один card inset и проверяется exact `0px`.
- Нативный `<dialog>` имеет implicit role, поэтому Axe include по `[role="dialog"]` не сканировал
  editor. После перехода на `include("dialog")` runtime critic нашла два реальных hover contrast
  дефекта Templates; весь hover foreground усилен до `text-primary`.
- All-route Axe однажды анализировал промежуточный route reveal и получил transient Broadcast contrast
  `#727272` на `#1e1e1e`. Ожидание фактического `opacity: 1` стабилизировало scans, но runtime critic
  затем принудительно остановила animation frame и доказала, что промежуточный contrast defect
  реален. Попытка transform-only сохранила contrast, но внесла transient geometry shift; поэтому
  декоративный route reveal удалён, а стабильные opacity/geometry получили regression.

## Decision Log

- 2026-08-24 — shared palette не менять: сначала доказать и исправить роль owner/depth.
- 2026-08-24 — Desktop остаётся источником token semantics, но выбор Desktop component analog не
  может переопределять одинаковую продуктовую глубину двух Mini App routes.
- 2026-08-24 — отклонён первый nested-`floor-0` вариант после проверки Desktop DOM/CSS. Единый
  contract: canvas/dialog — `floor-0`; framed form — `bg-primary + border-tertiary`; его body —
  transparent; standalone controls — `bg-primary`; nested entity/group —
  `bg-secondary + border-tertiary`; warning/positive/negative surfaces сохраняют semantic roles.
- 2026-08-24 — один shared `FormSurfaceBody` становится owner для editing depth. Route CSS может
  менять layout/radius, но не background role без отдельного semantic/structural доказательства.

## Verification

- Focused semantic surface suites: 76/76 на 430x932, 320x568, iOS WebKit 390x844 и desktop
  1280x900, light/dark, включая настоящий dialog Axe и desktop hover; отдельный route-change
  regression подтверждает полную opacity, отсутствие reveal animation и Axe.
- Full visual suite: 80/80 на тех же четырёх projects; all-route 32-route light/dark Axe/overflow
  matrix и onboarding evidence зелёные.
- Frontend: lint, typecheck, 100 unit tests, production build и 210/210 mobile Chromium Playwright.
- Repository: `pwsh ./scripts/verify.ps1 -Scope Changed` и `-Scope Full` прошли; Full также
  подтвердил lifecycle/tooling, migrations/downgrade/re-upgrade/drift, Ruff, 558 backend tests и 56
  pinned Remnawave contracts.
- Runtime после штатного `dev-down.ps1`/Telegram-enabled `dev-up.ps1`: local frontend, backend
  `/api/health`, backend `/api/ready` и preview — 200; public root/health/ready — 200; public debug —
  404; PostgreSQL/Redis healthy; `telegram_main_app_ready` присутствует в owned log.

## Recovery and rollback

Работа ограничена source/tests/docs и не делает provider или data mutations. Откат должен быть
точечным по новым строкам этого плана; pre-existing dirty diff и Git history не переписываются.

## Outcomes & Retrospective

Все peer editing surfaces Mini App получили один Desktop-backed contract: `floor-0` остаётся canvas,
primary bordered card владеет surface, form body прозрачен, standalone controls primary, nested
entities secondary. Различие Request и Communication больше не вызвано route-specific аналогом.

Критическая перекрёстная проверка оказалась содержательной: static critic опровергла первоначальный
nested-`floor-0` вариант, нашла mixed read-only wrapper, onboarding double inset и слабые frame tests;
runtime critic поймала Sponsor import regression, неполный dialog Axe scope и два hover contrast
дефекта. Я приняла только воспроизведённые claims, отклонила stale tertiary expiry, generic no-edge
Advanced и touch-hover expectations и отдельно обнаружила cascade failure уже после их verdict.

Оставшийся Sponsor → Commerce CSS import является coupling, а не текущим semantic defect: exact
immediate-frame assertions теперь делают возможный будущий drift исполняемо видимым. Commit, push и
external provider mutations не выполнялись.
