# Цветовой паритет Mini App с Flowvy Desktop

Status: completed
Owner: Пятница
Started: 2026-08-23
Updated: 2026-08-23
Completed: 2026-08-23

## Purpose

Весь интерфейс Flowvy Mini App должен использовать точные light/dark color tokens из актуального
`flowvy_desktop`, а каждый визуальный элемент и состояние — тот же semantic token, что и его
однозначный desktop-аналог. Для элементов без однозначного аналога референс выбирает владелец до
изменения соответствующего UI.

## Current state

- Исходный Mini App commit: `9334014279817e21034674b8c2d63644e291299d`; ветка `dev` чистая и
  опережает `origin/dev` на два коммита.
- Исходный Flowvy Desktop commit: `dedd324a9a9baac4da660b8a9a760a2afacef168`; ветка `dev` чистая.
- На исходном Mini App commit собственные `--v2-*` tokens в `frontend/src/styles/tokens.css`
  расходились с desktop только для light `text-positive`, light `text-warning` и dark
  `text-negative`; дополнительно исходный source содержал отсутствующие в desktop семейства
  `info-*`, `glass-*` и неиспользуемые `edge-*`. После реализации `info-*`/`edge-*` удалены, а от
  `glass-*` оставлены только четыре shared floating Header/TabBar tokens.
- Flowvy Desktop хранит source tokens в `src/styles/tokens.css`. Построчно проверены 52 CSS Modules,
  132 TSX и все прямые token consumers; source tree остался чистым.
- Mini App inventory охватывает 25 routes, 86 TSX и 60 CSS-файлов, включая route branches,
  overlays, Telegram native surfaces и deterministic tests.
- Три независимых read-only агента завершили source-token, target-inventory и cross-repository
  проверки. Память и старые отчёты не считаются доказательством текущего состояния.

## Scope

Входит весь пользовательский и admin UI Mini App: все router routes, общие/feature components,
light/dark themes, loading/empty/error/denied/success/disabled/focus/hover/active states, dialogs,
feedback, navigation, charts/indicators, Telegram-adapter-owned DOM surfaces и deterministic test
fixtures, которые визуально подтверждают эти состояния.

Входит точное копирование актуальных desktop color token values и замена цветовых назначений Mini
App на semantic desktop mapping. Геометрия, typography, layout, copy, бизнес-логика, API и данные не
меняются, кроме минимальных тестовых/документальных обновлений для доказательства цветового parity.

Не входят изменения `flowvy_desktop`, реальные Telegram/provider calls, production data, commit,
push и обновление visual baselines без отдельного согласования.

## Acceptance

- Все light/dark color tokens из desktop source перенесены в Mini App 1:1 по значениям; aliases
  явно документированы и не искажают значения.
- Каждый color-bearing source и каждый distinct color-owner selector/state сопоставлен с desktop
  analog и semantic token. Production branches, использующие один shared owner без собственного
  selector/token, покрываются записью этого owner и representative runtime state.
- Элементы без однозначного аналога не меняются по догадке: владелец выбирает concrete desktop
  reference из подготовленного списка.
- В UI source Mini App нет необъяснённых raw colors, обходящих принятую token mapping; разрешённые
  исключения перечислены и проверены.
- Независимые агенты до реализации подтверждают полноту inventory, после реализации — полноту diff и
  корректность semantic token usage.
- Fresh frontend lint, typecheck, unit tests и production build проходят. Full deterministic
  Playwright run завершается; functional, console, network и overflow checks проходят, а
  несупрессированные Axe failures перечисляются как failures. Representative distinct color owners
  проверяются в light/dark на mobile, small-mobile, iOS WebKit и admin desktop.
- Итоговые `docs/PROJECT_STATE.md` и этот ExecPlan отражают только свежо проверенные факты.

## Approach

1. Построчно каталогизировать desktop tokens и их фактические component/state usages.
2. Построчно каталогизировать все Mini App routes, branches, components, CSS declarations и tests.
3. Построить exhaustive mapping и провести независимую предреализационную перекрёстную проверку.
4. Вынести неоднозначные/отсутствующие аналоги владельцу; зафиксировать решения в Decision Log.
5. Минимально обновить token layer и semantic usages, сохраняя поведение и геометрию.
6. Добавить/уточнить deterministic assertions на точные computed colors и визуальные состояния.
7. Выполнить source audit, fresh frontend gates, полный Playwright matrix и независимую
   постреализационную перекрёстную проверку всего UI.
8. Просмотреть итоговый diff, обновить проектное состояние и закрыть план только при полном evidence.

## Progress

- [x] 2026-08-23 01:34 +03:00 — зафиксированы clean starting commits обоих репозиториев и
  обязательные project/skill instructions.
- [x] 2026-08-23 01:34 +03:00 — запущены три независимых read-only аудита: desktop token catalog,
  Mini App UI inventory и cross-repository coverage/mapping.
- [x] 2026-08-23 — завершены независимые source и target inventories: 25 Mini App routes, 60 CSS,
  86 TSX и все color-bearing TS/SVG surfaces сопоставлены с полным desktop token/component catalog.
- [x] 2026-08-23 — машинным сравнением подтверждены три несовпадающих shared values, mini-only
  token families и все raw color declarations вне token source.
- [x] 2026-08-23 — владелец согласовал все неоднозначные roles: maintenance использует desktop
  warning palette; unknown status — desktop disabled status; остальные предложенные neutral/error/
  editor/icon/save mappings приняты; floating Header/TabBar сохраняют общую faux-glass surface как
  explicit exception.
- [x] 2026-08-23 — владелец выбрал strict `1:1` desktop values даже при конфликте с текущими
  contrast assertions и сохранил Mini App runtime theme selection через Telegram /
  `prefers-color-scheme`.
- [x] 2026-08-23 — реализован согласованный semantic token parity: 48 shared desktop tokens,
  четыре shared Header/TabBar glass exceptions, desktop roles для navigation/status/loading/error/editor/commerce,
  token-driven built-in logo и запрет необъяснённых raw UI colors.
- [x] 2026-08-23 — выполнены fresh static/unit/build, focused runtime/visual и полный repository/UI
  gates. Functional checks зелёные; ожидаемые strict-parity Axe findings не фильтровались и оставили
  accessibility gate красным. Независимый post-change cross-check завершён.
- [x] 2026-08-23 — post-change cross-check подтвердил полный 25-route/60-CSS/86-TSX source inventory,
  исправил selector-aware token regression, сузил raw fallback guard до пяти точных expressions,
  вернул исходную толщину TabBar border и выявил все 27 исходных `color-mix()` usages.
- [x] 2026-08-23 — владелец выбрал references для Mini-only derived surfaces: welcome discount
  использует neutral secondary surface с positive border и bare `TicketPercent` icon, а Tribute
  price rows — отдельный secondary shell с secondary framing и tertiary separators; Templates и
  commerce intro — neutral primary, admin notice и inner duplicate warning — warning, outer
  duplicate wrapper — transparent.
- [x] 2026-08-23 — финальный независимый UI cross-check повторно покрыл 25/25 routes, 60/60 CSS,
  86/86 TSX и 19 non-CSS color owners; найденные Home/Admin Hero expiry mismatches исправлены.
- [x] 2026-08-23 — свежий полный four-project Playwright и repository Full gate завершены; все
  оставшиеся красные результаты точно совпадают с accepted contrast-debt ledger ADR 0004.

## Surprises & Discoveries

- Буквальный перенос трёх отличающихся shared values восстанавливает desktop palette, но отменяет
  три прежние accessibility-поправки Mini App: Axe сообщает для `#3AB176` на белом contrast
  `2.71:1`, для `#F3AB11` на `#FFEFCC` — `1.73:1`, а прежний dark destructive regression был
  исправлен именно
  заменой desktop `#F84235` на `#FF554A`. Значит strict `1:1` заведомо конфликтует с текущим Axe /
  WCAG AA gate; проверки ослабляться не будут.
- В исходном Mini App была semantic palette, которой нет в desktop: `info-*` обслуживала Pulse
  maintenance и `InlineFeedback.info`, `glass-*` — Header/TabBar, а `edge-*` была объявлена без
  consumers. После реализации `info-*`/`edge-*` удалены; последующая owner correction сохранила
  четыре согласованных `glass-*` exception для обоих floating chrome surfaces.
- Найдены component-level mismatches даже при совпадающих values: filled danger использует
  `text-negative` вместо desktop `bg-negative-primary/static-white`; SegmentedControl расходится с
  ModeSelector; Toggle имеет лишнюю raw shadow; default logo hard-codes colors; TabBar использует raw
  positive alpha; HeroCard remaining dot использует `bg-tertiary` вместо desktop `bg-secondary`.
- Desktop theme fallback без `data-theme` всегда dark, Mini App выбирает его через
  `prefers-color-scheme`. Включение theme-resolution в требование `1:1` меняет runtime behavior и
  требует отдельного решения.
- Все неоднозначные группы получили явный reference владельца: maintenance — warning, unknown —
  neutral disabled, Skeleton — subscription-list loading, ErrorState — negative, stub/empty —
  neutral, Invite/Sponsor — subscription surfaces, rich text — Release Notes/config editor, glyphs —
  token/currentColor, inactive Save — dimmed filled confirm, Header/TabBar — shared glass exception.
- Sponsor `one_time_expired`/`recurring_trial`/`refunded`, custom provider logo и каждый hover branch
  не имеют отдельных color screenshots. Они не вводят собственных color owners: полный source audit
  проверяет их общие CSS roles, а runtime matrix берёт representative состояния. Если такой branch
  позже получит уникальный color role, для него потребуется отдельная computed-style проверка.
- Полный четырёхпроектный прогон обнаружил три существовавших WebKit race в тестах: отрицательные
  assertions успевали завершиться до монтирования lazy route, после чего следующий `page.goto`
  перебивал незавершённую навигацию. Добавлено только ожидание уже существующего route-ready
  признака `main > div { opacity: 1 }`; три сценария после этого прошли изолированно 3/3.
- Финальный derived-color audit нашёл 27 исходных `color-mix()` usages: 14 буквально совпадают с
  desktop, восемь получили однозначную desktop-замену, а для Mini-only surfaces владелец выбрал
  concrete references. В итоговом source остались только 14 буквальных desktop formulas.
- Независимая финальная runtime-сверка обнаружила два несовпадения Hero expiry, не видимые из одного
  token catalog: unlimited/perpetual Admin state наследовал primary text, а Admin warning начинался
  с `<=3 days` вместо desktop Hero `<=7 days`. Оба owner-level mismatch исправлены и покрыты exact
  computed-style assertions во всех четырёх Playwright projects.
- Theme-complete Axe aggregation обнаружила и закрыла два доказательных пробела: accepted-debt
  tests теперь завершают обе темы до общего assert, а formatted editor явно использует desktop
  config-editor `text-primary`, устраняя WebKit-only inherited-color mismatch. Route-level Axe также
  ждёт финальную `opacity: 1`, поэтому не измеряет промежуточные blended colors.

## Decision Log

- 2026-08-23 — desktop source code на commit `dedd324` является единственным референсом цветов;
  названия существующих Mini App tokens, память и прежние screenshots не определяют значения.
- 2026-08-23 — неоднозначное semantic correspondence требует явного выбора владельца; визуально
  похожий компонент не считается доказанным аналогом.
- 2026-08-23 — реализация поставлена на паузу до выбора владельцем accessibility policy и concrete
  desktop references для десяти неоднозначных групп; это предотвращает необратимое угадывание
  semantic roles.
- 2026-08-23 — владелец выбрал буквальные desktop color values `1:1`. Документация должна отражать
  этот продуктовый приоритет и известный contrast tradeoff; общая accessibility policy и Axe checks
  не ослабляются, а несовместимые результаты будут зафиксированы как ожидаемое следствие решения.
- 2026-08-23 — Mini App сохраняет текущий Telegram / `prefers-color-scheme` theme resolution;
  desktop default-dark selector behavior не переносится, потому что решение относится к значениям
  и semantic usage цветов, а не к механике выбора темы.
- 2026-08-23 — Pulse maintenance использует desktop warning roles; `UNKNOWN` выглядит как desktop
  disabled status с solid tertiary border. Skeleton следует desktop subscription-list loading,
  настоящие ErrorState — negative roles, Support/Broadcast — neutral empty roles, Invite/Sponsor —
  neutral subscription surfaces с semantic accents, formatted content — Release Notes roles,
  editors — config-editor roles, glyphs — `currentColor`, inactive Save — dimmed filled confirm.
- 2026-08-23 — Header geometry и glass colors остаются без изменений по прямому решению владельца.
  Это единственное используемое Mini App color/effect family без desktop-аналога; TabBar переносится
  на desktop Sidebar roles и больше не потребляет glass tokens.
- 2026-08-23 — Home welcome-discount panel использует neutral `bg-secondary` как `Basic access`,
  сохраняя positive border и bare `TicketPercent` с `icon-positive`; Tribute price rows используют
  отдельный `bg-secondary` shell с `border-secondary` и `border-tertiary` separators на primary
  offer surface; `Basic access` и donation-price row используют такое же neutral framing. Templates
  disclosure и commerce explanatory intro — neutral `bg-primary`; admin informational notices и
  inner duplicate warning — desktop warning surface; outer duplicate wrapper/list не получают
  собственной заливки.
- 2026-08-23 — Home и Admin Hero используют один desktop expiry contract: unlimited/perpetual —
  `text-secondary`, warning — при остатке `<=7 days`. `UserRow <=3 days` остаётся отдельным list
  owner и не подменяет Hero mapping.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build` — passed; 237 files, 18 Vitest files / 81 tests, 2403 Vite modules.
- Focused `color-parity.spec.ts` — 8/8 passed на 430x932 Chromium, 320x568 Chromium, iOS WebKit и
  1280x900 Chromium; lifetime Hero expiry и navigation focus follow-ups прошли 4/4 каждый.
- Полный `PLAYWRIGHT_PORT=5239 pnpm exec playwright test --workers=4` — 577/616 passed и 39 failed,
  `flaky: 0`.
  Каждый failure — несупрессированный Axe `color-contrast`, точно совпадающий с route/node/pair
  ledger ADR 0004; accepted-debt cycles завершают light и dark scans до финального assert.
  Functional, console, network и overflow failures отсутствуют.
- `/Users/x_kit_/Documents/Projects/mini-app`: `pwsh ./scripts/verify.ps1 -Scope Full` — lifecycle,
  migrations/drift, Ruff, 533 backend tests, 56 Remnawave contract tests, frontend lint/typecheck,
  81 unit tests и build passed; исторический pre-discount-Axe mobile Playwright дал 144/154, а все 10
  failures — те же ledgered, несупрессированные Axe `color-contrast` findings. Предыдущий Full run дал 143/154 из-за
  одного transient mixed-theme device-dialog frame (`#454545` на уже dark `#171717`); exact final
  `floor-0`/`text-secondary` waits прошли 20/20, после чего повторный Full дал исторические 144/154.
  После явного welcome-discount Axe coverage актуальный mobile gate — 143/154: дополнительный красный
  test case содержит только уже ledgered current/discounted price pair `#3AB176/#F2F2F2`.
- Source parity audit — 48/48 shared tokens совпадают с desktop семантически; Mini App содержит
  только четыре согласованных Header glass extras. Все 14 оставшихся `color-mix()` буквально
  совпадают с desktop formulas. Вне token source raw colors остаются только в пяти точных expressions
  двух документированных Telegram native API fallback adapters.

## Recovery and rollback

Изменения ограничиваются source tokens, component styles, deterministic tests и документацией.
Откат возможен по точному task diff без изменения данных, provider state или desktop repository.
Никакие visual baselines, commit или push не выполняются без отдельного разрешения владельца.

## Outcomes & Retrospective

Strict color parity реализован без изменения геометрии, copy, API и business behavior. Header и
Telegram/system theme resolution сохранены по решению владельца; TabBar и остальной UI используют
desktop semantic roles. Три независимых post-change аудита подтвердили полный source inventory и
точность token catalog; найденные ими TabBar и Hero expiry mismatch исправлены до финальных прогонов.
Финальная проверка самого evidence нашла ещё один runtime-only WebKit inheritance mismatch formatted
editor и transient theme-switch race в device test; первый исправлен явным desktop `text-primary`,
второй — ожиданием exact конечных computed colors до Axe.
Автоматические проверки не скрывают цену решения: desktop light positive/warning, filled danger
pair в обеих темах и iOS WebKit dark danger-outline `text-negative` создают серьёзные WCAG contrast
findings, поэтому accessibility часть Full gate остаётся красной до изменения desktop source palette
либо отдельного нового решения.
