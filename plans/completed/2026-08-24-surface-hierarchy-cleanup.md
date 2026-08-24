# Чистая semantic surface hierarchy для Support и Settings

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-24

## Purpose

Привести background и border roles на Request, Manage Quick Answers и затронутых Settings routes к
текущему ручному применению токенов в `flowvy_desktop`, не меняя продуктовые контракты и не маскируя
ошибки документацией или тестами с неверными ожиданиями.

## Current state

- Рабочая ветка Mini App `dev` была чистой и на 12 коммитов впереди `origin/dev` до начала задачи.
- Текущий reference checkout `../flowvy_desktop` чистый на `dev`, commit `9718d1c`; старый
  `PROJECT_STATE` упоминает более ранний `dedd324`, поэтому решение будет основано на текущем source.
- `docs/PROJECT_STATE.md` требует exact Desktop/Mini App semantic color roles и полностью зелёный
  Axe без прежнего ADR 0004 exception.
- Затронутые Support routes собраны в `frontend/src/pages/support.tsx`,
  `frontend/src/pages/support-articles.tsx` и `frontend/src/pages/support.module.css`; Settings form
  bodies и row dividers принадлежат shared `SettingsFields`/`SettingsDivider`.

## Scope

Входит: текущие Desktop tokens и ручные component mappings; Support Request detail; Quick Answers
management/editor; settings pages с доказанным тем же hierarchy defect; shared owners, docs и
deterministic Playwright assertions, если именно они закрепляют неверную роль.

Не входит: backend/API/data migrations, реальные Telegram/R2/Remnawave/Tribute mutations,
изменение продуктового IA, commit или push.

## Acceptance

- Каждая изменённая surface имеет явный source-to-target analog из текущего `flowvy_desktop` source.
- Parent/child background и все border sides на affected routes совпадают с выбранными semantic
  roles в light и dark themes; локальных цветов и новых aliases нет.
- Request, Manage Quick Answers и все реально затронутые Settings routes проходят scoped Axe,
  overflow, console, pageerror и unexpected-network checks на 430x932, 320x568, WebKit 390x844 и
  desktop 1280x900; evidence просмотрено визуально.
- Два независимых критических агента после реализации проверяют разные стороны результата; каждое
  замечание принимается или отклоняется только после проверки source/runtime evidence и явного
  контраргумента.
- Fresh change-aware/frontend gates и final diff review зелёные; пропуски названы явно.

## Approach

1. Дочитать текущие source/docs/tests и построить exhaustive inventory affected surfaces.
2. Для каждого дефекта выбрать существующий Desktop analog по структуре и назначению, а не по
   внешнему сходству; зафиксировать mapping в тестах или документации только там, где это устойчивый
   контракт.
3. Внести минимальные CSS/component/test/doc changes через shared owners.
4. Запустить focused static/unit/Playwright checks и просмотреть light/dark screenshots.
5. Передать готовый diff двум read-only критическим агентам, перепроверить их выводы и исправить
   только подтверждённые проблемы.
6. Выполнить финальные gates, review diff и закрыть план.

## Progress

- [x] 2026-08-24 13:01 +03:00 — проверены исходный Git status, repository rules, verification skills,
  current `PROJECT_STATE`, UI state matrix и reference checkout identity.
- [x] 2026-08-24 13:08 +03:00 — построен source-to-target mapping: Desktop floor-0 editor/modal
  body содержит primary controls; primary/tertiary detail shells содержат full-width tertiary row
  separators; найдены прозрачные Mini App form bodies и inset shared divider.
- [x] 2026-08-24 13:10 +03:00 — Support conversation/composer/article editor переведены на
  `--v2-floor-0`; у SettingsDivider удалён ложный left inset; добавлен computed-style regression
  contract без новых token aliases. Пробный `SettingsFields=floor-0` позднее отклонён review.
- [x] 2026-08-24 13:14 +03:00 — focused validation: новый контракт сначала ожидаемо упал 4/4 на
  прозрачных bodies, после исправления прошёл 16/16 на четырёх projects; Support/Axe прошёл 60/60,
  восемь fresh light/dark mobile/desktop screenshots просмотрены вручную.
- [x] 2026-08-24 13:28 +03:00 — два независимых critical reviews завершены. Static critic доказал
  ошибочность Settings Modal analog и нашёл role-asymmetric attachment/file/avatar descendants;
  findings приняты после source/runtime проверки, исправлены и повторно проверены. Runtime critic
  не нашёл blocking product findings после 48 screenshots и all-project Axe/overflow/console/network.
- [x] 2026-08-24 13:33 +03:00 — final gates завершены: full backend/migrations/contracts/static
  stages зелёные; первый mobile browser run дал один theme-contamination flake `206/207`, exact
  repeat прошёл `5/5`, полный rerun — `207/207`; final semantic matrix — `16/16`.
- [x] 2026-08-24 — reopened after owner review: прежняя Settings-проверка покрывала routes, но не
  выполняла per-page inventory и ошибочно выдавала shared wrapper/divider contract за завершённую
  чистку вложенных Settings surfaces.
- [x] 2026-08-24 — дочитаны все Settings route owners и их CSS modules; составлен per-route
  inventory. Provider, Branding, Welcome, Access и payment destination forms подтверждают Desktop
  contract `floor-0 page -> primary bordered card -> transparent fields -> primary outlined control`.
  Реальные same-level defects локализованы в Sponsor Offers cards, Automation Rules amount bands и
  Template Variables; у shared Settings intro/section/row descriptions также найдены primary text
  roles вместо Desktop secondary roles.
- [x] 2026-08-24 — исправлены Sponsor offer/legacy cards, donation fact, Automation amount band,
  Template Variables и shared secondary text roles; exact semantic/color matrix прошла `32/32`,
  legacy+nested Settings — `12/12`, warning states — `4/4` на четырёх projects.
- [x] 2026-08-24 — два критика повторно проверили расширенный Settings diff. После спора приняты
  defects neutral badge/donation nesting, stale executable expectations и три нереалистичных
  Sponsor fixture; отклонены blanket SettingsFields change и warning override published accent.
- [x] 2026-08-24 — Changed и Full gates завершены: migrations/drift, Ruff, `558` backend, `56`
  contracts, lint/typecheck, `100` unit, build и `209/209` mobile Playwright зелёные; итоговые
  screenshots просмотрены, docs синхронизированы.

## Surprises & Discoveries

- `PROJECT_STATE` содержит исторические записи о прежнем красном ADR 0004 ledger, но верхняя
  актуальная запись и latest verification утверждают, что palette исправлена и 203/203 проходят без
  exception. Для этой задачи любое Axe finding блокирует completion.
- Reference Desktop checkout уже на `9718d1c`, поэтому старые commit IDs и память непригодны как
  current source of truth.
- Прежние Support screenshots и Axe не ловили same-level parent/child backgrounds: у них не было
  computed assertions на эти wrappers и геометрию divider.
- Первая реализация divider assertion сравнивала computed `rgb(...)` с raw token/hex и корректно
  упала; проверка переведена на общий semantic resolver вместо ослабления ожидания.
- Static critic доказал, что Modal был неверным analog для shared SettingsFields: текущий Desktop
  `ConverterSection` — full-page Settings drill-down с `bg-primary + border-tertiary` card,
  transparent padded wrapper и `bg-primary + muted border-secondary` input. Пробная глобальная
  floor-0 заливка удалена, а regression contract закрепляет transparent wrapper на восьми routes.
- Тот же review нашёл role-dependent вложенные совпадения в Request: owned secondary bubble
  содержал secondary attachment и avatar. Итоговая цепочка чередует bubble, attachment/avatar и
  file tile для admin и user ownership вместо проверки только admin author mapping.
- Owner review обнаружил scope failure: восемь вложенных Settings routes были открыты тестом, но
  фактические component-specific backgrounds/borders внутри них не были сопоставлены с Desktop и
  не получили отдельные assertions.
- Текущий Desktop source не поддерживает blanket-правило «любой control внутри primary обязан быть
  secondary»: global `.fv-input`, `CustomSelect`, `ModeSelector` и Converter cards явно оставляют
  standalone controls primary. Чередование требуется у самостоятельной вложенной entity/group
  surface: primary outer card -> secondary entity/group -> primary nested control/data surface.
- Старые Sponsor tests содержали не только устаревшие color roles, но и состояния, которые BFF не
  выдаёт: unpublished `ready`, unpublished warning и offers без matching commerce rules. Final
  fixtures разделяют published ready Home offer, unpublished draft и published warning states с
  подходящими enabled/disabled/missing-profile rules.

## Settings route inventory

- `/admin/settings`, `/pulse`, `/tribute`, `/communication`: primary navigation/status cards и
  secondary icon tiles совпадают с Desktop SettingsRow/ServiceRow; исправлению подлежат только
  secondary intro/section/description text roles.
- `/kuma`, `/beszel`, `/branding`, `/welcome`, `/support`, `/access`, `/tribute/connection`,
  `/payment-links`, `/referral-benefits`: primary settings cards, transparent padded field groups,
  tertiary separators и primary outlined controls совпадают с Desktop ConverterSection,
  BypassSection, CustomSelect и global `.fv-input`; blanket background change отклонён.
- `/content`: editor card и controls совпадают с Desktop primary control contract, но static
  Template Variables rows являются nested entity surfaces и ошибочно сливаются с primary parent;
  они должны быть secondary с tertiary border.
- `/automation-rules`: list/empty-state card совпадает; открытый rule editor содержит primary `.card`
  и ошибочно primary `.band`. Amount band должен быть secondary/tertiary, а его primary inputs
  сохраняют следующий вложенный уровень.
- `/sponsor-offers`: outer SettingsSection корректно primary; offer/legacy cards ошибочно primary и
  должны быть secondary/tertiary. Вложенный plain billing list остаётся primary/tertiary. В editor
  disclosure Template Variables должен быть secondary/tertiary, а variable rows внутри —
  primary/tertiary.
- `/activity`: primary list/empty-state owner совпадает; semantic pending/success/failure rows
  используют status tokens и не являются hierarchy defect.

## Decision Log

- 2026-08-24 — не менять значения shared palette до доказательства дефекта tokens: запрос касается
  применения roles, а текущий Mini App заявляет runtime-copy текущих Desktop shared colors.
- 2026-08-24 — не использовать screenshots или существующие exact-token tests как authority:
  authority — текущие Desktop component styles плюс актуальное назначение Mini App surface.
- 2026-08-24 — использовать `floor-0` у Support conversation/form/editor bodies, где вложенные
  interactive cards/controls остаются primary или secondary; SettingsFields оставить transparent
  по ближайшему current Desktop full-page Settings analog.
- 2026-08-24 — SettingsDivider сделать full-width внутри bordered surface: Desktop row/detail
  separators идут от edge до edge, а прежний 14px inset не имел актуального Desktop analog.
- 2026-08-24 — message bubble levels определять по `data-owned`, а не author: admin/user меняют
  ownership. Вложенные avatar/attachment/file tile обязаны чередовать primary/secondary в обеих
  ролях; support author сохраняет отдельный positive inset/icon semantic независимо от ownership.
- 2026-08-24 — Mini-only Admin Settings mapping считать derived structural composition, а не
  literal component parity и не приписывать владельцу новый выбор задним числом: primary section →
  secondary entity/group → primary nested fact/control.
- 2026-08-24 — published и warning являются независимыми ролями. По Desktop `ProfileCard active +
  StatusBadge LIMITED` опубликованный offer сохраняет positive outer accent, а недоступность
  выражается полным warning contract badge; warning не стирает publication state.

## Verification

- Focused Playwright semantic/color matrix: `32/32`; nested Settings + legacy: `12/12`; realistic
  warning states: `4/4`, каждый на 430x932, 320x568, iOS WebKit и desktop Chromium.
- Scoped Axe без suppression, horizontal overflow, console, pageerror, requestfailed и unexpected
  mocked API guards прошли на affected states. Просмотрены 48 Settings screenshots, включая 16
  final Sponsor/donation frames в light/dark.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (`100/100`) и `pnpm build` прошли свежо.
- `pwsh ./scripts/verify.ps1 -Scope Changed` и `-Scope Full` прошли: migration lifecycle/drift,
  Ruff, `558` backend, `56` pinned contracts и `209/209` mobile Chromium Playwright.

## Recovery and rollback

Изменения ограничиваются frontend source/tests/docs и этим планом. Они не выполняют внешних calls и
откатываются точечным удалением только добавленных строк; существующие пользовательские изменения и
Git history не переписываются.

## Outcomes & Retrospective

- Support Request/Quick Answers и все Settings route families получили исчерпывающий per-owner
  mapping. Исправлены только доказанные mismatches; корректные transparent SettingsFields,
  primary controls, Connection/Activity и hub cards сохранены.
- Settings hierarchy теперь различает primary sections, secondary entity/group shells и primary
  nested facts/controls; shared divider и secondary text roles соответствуют текущему Desktop.
- Два review реально изменили результат. Static critic нашла scope omission, stale tests и backend-
  невозможные fixtures; runtime critic нашла badge/donation defects и missing-rule visual state.
  Гипотезы принимались только после чтения backend/Desktop source и повторного runtime evidence.
- Exact computed-style contracts проверяют все border sides, shadow, text/background roles и
  realistic state fixtures; screenshot/Axe-only слепая зона больше не является единственной защитой.
- External providers, Telegram/R2 state, commit и push не затрагивались.
