# 0004: Цветовой паритет с Flowvy Desktop

Status: accepted
Date: 2026-08-23
Owners: Flowvy

## Context

Mini App и Flowvy Desktop использовали общий `--v2-*` vocabulary, но локальная палитра Mini App
содержала три contrast-adjusted значения, отдельную голубую `info-*` family, glass/edge effects и
несколько raw component colors. Одинаково названные элементы из-за этого могли иметь разные
semantic roles и computed colors.

Построчный аудит актуальных source trees зафиксировал desktop commit `dedd324a9a9baac4da660b8a9a760a2afacef168`
как design reference и Mini App commit `9334014279817e21034674b8c2d63644e291299d` как исходный target.
Проверены все 25 Mini App routes, 58 актуальных CSS-файлов, 87 TSX-файлов и color-bearing TS/SVG surfaces.

Desktop light `text-positive` и `text-warning`, а также `static-white` на общем
`bg-negative-primary` не проходили некоторые Mini App contrast contexts. Возвращённый к прежнему
desktop value dark `text-negative` давал отдельный iOS WebKit finding на underlying danger-outline
action. Изначально владелец выбрал буквальный desktop parity с открытым debt вместо локальных
contrast replacements.

24 августа 2026 года владелец изменил это решение: accessibility debt закрывается в общем Desktop
source, а Mini App сохраняет буквальный паритет уже с доступной shared palette. Light positive
foreground/background-primary использует `#24784F`, light warning foreground — `#8A5B00`, filled
negative background в обеих темах — `#C6352A`, dark negative foreground — `#FF554A`.

## Decision

1. `flowvy_desktop/src/styles/tokens.css` является authority для всех общих `--v2-*` color/effect
   values и semantic color roles. `frontend/src/styles/tokens.css` хранит точную runtime-копию.
2. Локальные contrast-adjusted replacements, aliases с искажённым значением и one-off UI colors
   запрещены. Изменение общей палитры сначала принимается в desktop source, затем синхронно
   переносится в Mini App.
3. Mini App сохраняет Telegram theme synchronization и `prefers-color-scheme` до установки
   `data-theme`; desktop default-dark selector behavior не переносится.
4. Header и TabBar сохраняют общую faux-glass surface по прямому решению владельца. Только четыре
   `--v2-glass-*` token используются как явное Mini App exception и не могут применяться за
   пределами `components/layout/header.module.css` и `components/layout/tab-bar.module.css`.
5. TabBar использует общие с Header glass background, border и shadow roles; secondary neutral state,
   positive-quaternary selected surface и positive text/icon остаются desktop-authoritative.
6. Pulse maintenance использует desktop warning roles. `UNKNOWN` subscription/user status
   использует тот же neutral disabled appearance, что desktop: secondary surface/text и solid
   tertiary border.
7. Loading skeleton следует desktop subscription-list loading surface. Настоящие page errors
   используют negative roles; Support/Broadcast остаются neutral empty/stub surfaces.
8. Invite и внешняя Sponsor surface используют neutral subscription/preview roles. Доступный Home
   offer повторяет основную опубликованную `.offerCard[data-published="true"]` в
   `Tribute > Sponsor offers`: `border-positive-secondary` по периметру и `inset 3px` из
   `border-positive-primary` слева. Заблокированный до окончания
   текущего paid period offer остаётся neutral. Остальные warning, positive и negative accents
   применяются только к фактическому состоянию. Admin commerce следует desktop settings, table и
   rule-editor roles.
9. Rendered CommonMark следует desktop Release Notes roles. Authoring surfaces следуют config/YAML
   editor roles. Built-in glyphs и Flowvy logo получают desktop icon roles через `currentColor` или
   CSS variables; provider-owned images не перекрашиваются.
10. DOM Save повторяет filled confirm action и становится полупрозрачной при disabled. Telegram
    MainButton сохраняет native bridge, но получает те же desktop color values.
11. Для Mini-only derived surfaces владелец выбрал конкретные desktop roles: Home welcome discount —
    neutral `bg-secondary` как `Basic access`, с `border-positive-secondary` и
    `icon-positive`; `TicketPercent` используется без декоративной круглой tile по desktop pattern
    bare leading icon. `Basic access`, Tribute price shell и отдельная donation-price row используют
    `bg-secondary` с `border-secondary`; separators между строками цены остаются
    `border-tertiary` на primary offer surface. Templates disclosure, commerce intro и
    legacy offer — neutral `bg-primary`; admin informational notice и внутренний duplicate warning —
    warning surface; внешний duplicate wrapper и list наследуют фон без отдельной заливки.
12. Perpetual/unlimited expiry в Home и Admin Hero повторяет Desktop HeroCard и использует
    `text-secondary`.
13. Standalone inputs, native `select`/date shells и onboarding invite field повторяют Desktop
    input/CustomSelect: `bg-primary` и muted `border-secondary`. Control внутри уже обведённой
    `FormInline` row остаётся contained surface `bg-secondary + border-tertiary`; native picker
    behavior не заменяется. Individual Users items сохраняются отдельными ProfileCard-like
    `bg-primary + border-tertiary` cards с positive-quaternary hover.
14. Rich-text/Telegram HTML authoring использует Desktop ConfigEditor nesting: primary outer editor,
    tertiary frame/dividers, primary toolbar/menu, positive focus и semantic icon roles. Persistent
    `InlineFeedback` использует semantic notice-card surfaces с соответствующими secondary borders.
    Focusable commerce rows получают явный Desktop positive outline. Text-only content сохраняет
    text roles; standalone glyph owners используют icon roles.
15. Axe запускается после стабилизации route/theme/animation без `color-contrast` suppression,
    allow-list или impact downgrade. Strict parity не даёт completion exception: любой finding
    блокирует завершение и исправляется в общем Desktop source либо в неверном semantic role.

## Исторический contrast-debt ledger — закрыт 2026-08-24

Строки ниже сохраняют точный исторический inventory Axe rule `color-contrast` с impact `serious`.
Они больше не являются accepted debt или completion exception. Shared token correction закрывает
positive пары минимумом `4.59:1` на актуальных light surfaces, warning — минимумом `5.16:1`,
`static-white` на filled negative — `5.32:1`, а dark negative outline — `5.10:1`.

| Route и состояние | Theme / project scope | Affected node | Foreground / background | Contrast |
|---|---|---|---|---|
| `/admin/settings/pulse`, active provider choice | light / all four | текст `Active` в active-choice pill | `#3AB176` / `#F1FAF5` | `2.55:1` |
| `/admin/settings`, `/admin/settings/pulse` и `/admin/settings/tribute`, configured providers | light / all four | пять status-pill nodes: `Kuma`, `Key added` и три `Configured` | `#3AB176` / `#F1FAF5` | `2.55:1` |
| `/admin/settings/content`, template variables | light / all four | `code` с `{{appName}}` | `#3AB176` / `#FFFFFF` | `2.71:1` |
| `/`, active subscription | light / all four | status badge `Active` | `#3AB176` / `#E8F7F0` | `2.45:1` |
| `/`, enabled invite/settings fact | light / all four | row value `On` | `#3AB176` / `#FFFFFF` | `2.71:1` |
| `/devices`, connected-device capacity | light / all four | counter `1 / 5` | `#3AB176` / `#ECECEC` | `2.29:1` |
| `/pulse`, healthy summary | light / all four | `All systems operational` | `#3AB176` / `#F1FAF5` | `2.55:1` |
| `/admin/settings`, provider facts | light / all four | version fact `v2.7.4` | `#3AB176` / `#FFFFFF` | `2.71:1` |
| `/devices`, remove confirmation | light, dark / desktop Chromium | filled danger button `Remove` | `#FFFFFF` / `#F84235` | `3.60:1` |
| `/admin/settings/tribute/automation-rules`, delete confirmation | light, dark / three Chromium projects | filled danger button `Delete` | `#FFFFFF` / `#F84235` | `3.60:1` |
| `/admin/settings/tribute/automation-rules`, delete confirmation | dark / iOS WebKit | underlying danger-outline button `Delete` (`._dangerOutline`) | `#F84235` / `#212121` | `4.46:1` |
| `/admin/settings/tribute/sponsor-offers`, editor/list/legacy states | light / all four | Tribute price `strong` nodes (`₽100`, `₽270`, `₽500`, `₽900`, `₽3,500`) | `#3AB176` / `#FFFFFF` | `2.71:1` |
| `/admin/settings/tribute/sponsor-offers`, formatted editor | light / all four | formatted link `strong` text | `#3AB176` / `#F2F2F2` | `2.42:1` |
| `/admin/settings/tribute/sponsor-offers`, duplicate legacy state | light / all four | `[data-ui="duplicate-notice"]` child `p[role="note"]` and `p[data-ui="duplicate-sponsor-warning"]` | `#F3AB11` / `#FFEFCC` | `1.73:1` |
| `/`, confirmed/checkout sponsor states | light / all four | status badge `Active` | `#3AB176` / `#E8F7F0` | `2.45:1` |
| `/`, confirmed subscription alternatives | light / all four | `other-subscriptions-warning` note | `#F3AB11` / `#FFEFCC` | `1.73:1` |
| `/`, sponsor offer content | light / all four | formatted `strong`, template `code`, and Tribute current/discounted price `strong` nodes | `#3AB176` / `#F2F2F2` or `#FFFFFF` | `2.42:1` or `2.71:1` |

## Coverage ledger

Все 58 Mini App CSS sources входят в semantic mapping:

| Mini App sources under `frontend/src` | Desktop reference и color roles |
|---|---|
| `styles/tokens.css`, `styles/global.css` | Полный desktop token catalog, global floor/text/selection/focus/scrollbar roles; Telegram theme selection сохраняется |
| `components/layout/{app-shell,edge-blur,header,tab-bar}.module.css` | Dashboard/Popup floors и Sidebar navigation; floating Header/TabBar разделяют единственное glass exception |
| `components/ui/{action-btn,app-logo,coming-soon,confirm-dialog,editor-dialog,error-state,form-save-button,form-section,inline-feedback,page-skeleton,segmented-control,skeleton,spinner-icon,status-badge,toggle}.module.css` | ActionButton, LogoIcon, shared Support/Broadcast neutral placeholder, Modal, ErrorBoundary/Profiles error, Settings/Bypass fields, BusyToggle, route/section/editor loading compositions, StatusBadge и Toggle |
| `components/content/{formatted-text-editor,formatted-text,telegram-html-editor,template-variables}.module.css` | Release Notes renderer, YAML/Config editor framing, CustomSelect/rule controls |
| `components/home/{detail-section,hero-card,invite-card,sponsor-card}.module.css`, `components/commerce/subscription-billing-list.module.css` | ProfileDetail/HeroCard, AddSub preview, основная опубликованная Sponsor offer-card accent и provider-confirmed neutral billing facts |
| `components/pulse/{heartbeat-bar,monitor-row,status-banner}.module.css`, `pages/pulse.module.css` | StatusBadge/Toast semantic positive, negative и owner-selected warning maintenance roles |
| `components/devices/device-row.module.css`, `pages/devices.module.css` | Connections rows, ProcessIcon/fallback glyphs и neutral DataTable empty/list roles |
| `components/admin/{access-profile-editor,admin-user-detail,admin-user-hero,commerce-activity,commerce-rule-editor,commerce-rules-config,dashboard-bandwidth-row,dashboard-kpi-grid,filter-chips,referral-benefits-config,settings-surface,sponsor-offers-config,tribute-payment-destinations,user-row,virtualized-user-list,welcome-media}.module.css` | SettingsPage/SettingsRow, ProfileDetail, DataTable/Connections/Logs, RuleForm/RulesEditor/EditSubModal и neutral provider facts |
| `pages/admin/{dashboard,settings-access,settings,users}.module.css`, `pages/home.module.css` | Dashboard/Profile lists, Settings surfaces and negative real-error roles |
| `components/onboarding-screen.module.css` | AddSub/Modal neutral onboarding surface и filled confirm CTA |

Non-CSS color owners также проверяются: built-in AppLogo, Home/Admin traffic and expiry indicators,
UserRow micro-bars, OS/service glyphs, shared icon components, Telegram header/background/MainButton
adapters и provider-owned `logoUrl`. Первые используют desktop semantic variables, Telegram adapters
содержат только документированные exact token fallbacks, а provider artwork остаётся intrinsic.

## Alternatives

- Исправить значения только в Mini App. Отклонено: shared palette меняется сначала в Desktop source,
  затем синхронно переносится в Mini App.
- Сохранить буквальный старый Desktop catalog и красный accessibility gate. Отклонено владельцем
  2026-08-24: доступность стала обязательной частью shared parity.
- Перенести desktop default-dark theme resolution. Отклонено: Telegram и system preference остаются
  runtime authority Mini App.
- Перекрасить floating Header/TabBar как desktop TitleBar/Sidebar. Отклонено: их общая faux-glass
  surface сохраняется как ограниченное исключение.

## Consequences

- Shared token catalog и semantic roles можно проверять статически; raw color drift вне точных
  документированных Telegram adapter fallbacks становится test failure.
- Прежние light positive/warning тексты, filled danger CTA и iOS WebKit dark danger-outline больше
  не создают accepted accessibility debt; regressions блокируют gate.
- Исторические записи о прежних WCAG color fixes остаются доказательством своих запусков, но
  помечаются superseded этим решением.
- Provider artwork и Telegram native integration fallbacks остаются отдельными bounded color
  owners; они не разрешают новые component literals.

## Verification and rollout

- Vitest фиксирует frozen desktop token catalog во всех четырёх theme selectors, четыре shared
  Header/TabBar glass exceptions и разрешает только пять точных Telegram adapter fallback expressions среди raw UI
  colors.
- Full Playwright matrix проходит через 25 routes/states с console, network, overflow и Axe checks;
  focused parity test проверяет computed colors representative distinct owners в light/dark на
  четырёх проектах. Axe запускается только после stable route/theme/animation state и должен быть
  зелёным; branches, использующие один shared owner, не считаются отдельными color assertions.
- Semantic-surface suites проверяют parent/child nesting, `background`, все четыре border sides,
  `outline`, `box-shadow`, text color и SVG `color`/`fill`/`stroke` на четырёх проектах и в обеих
  темах. Source regressions фиксируют отдельные text/icon owners и запрещают вернуть исправленные
  glyphs к `text-*` roles.
- Theme switches перед Axe подтверждаются конечными computed colors. Device dialog regression
  прошёл 20/20 после такого ожидания; transient смешение light text и dark surface не записывается
  как palette debt. Formatted editor явно задаёт desktop config-editor `text-primary`, включая
  WebKit после runtime theme switch.
- Source audit повторно сопоставляет каждый color-bearing Mini App file с desktop component role.
- Любое accessibility failure блокирует зелёный Full gate и исправляется, а не удаляется или
  маскируется.
