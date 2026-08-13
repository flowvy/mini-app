# Чистая и брендированная система Settings

Status: completed
Owner: Codex
Started: 2026-08-13
Updated: 2026-08-13

## Purpose

Настройки Flowvy должны использовать узнаваемые, но визуально согласованные логотипы сервисов,
одинаковый вертикальный ритм с остальным Mini App и спокойную композицию форм без конкурирующих
заголовков, карточек и предупреждений.

## Current state

- Предыдущая итерация уже ввела общий `SettingsSection`, grouped rows и адаптивный Access dialog.
- Pulse tile единственный имеет постоянную positive-заливку, хотя это заголовок выбора, а не status.
- Uptime Kuma, Beszel, Remnawave и Flowvy представлены общими Lucide glyphs вместо brand marks.
- Welcome Message разбит на три top-level секции и отдельный warning; media type отображается как
  самостоятельное generic `Animation`, хотя его полезнее связать с `Default media`.
- Полный dev-контур уже запущен; Vite применит изменения через HMR. Реальные provider mutations не
  нужны, UI verification останется на mocked Playwright boundary.

## Scope

Входит:

- нейтральная Pulse icon treatment;
- локальные code-native brand icons для Uptime Kuma, Beszel, Remnawave и Flowvy из официальных
  источников с единым размером/tile styling;
- один settings spacing contract для overview и всех nested routes;
- упрощённая Welcome composition и более содержательная media metadata;
- распространение того же field/group rhythm на Kuma, Beszel, Identity и Access;
- deterministic UI tests, light/dark visual evidence и обновление project state.

Не входит изменение backend API, media contract, upload semantics, provider settings или реальных
данных. Логотипы не используются как полноцветные рекламные assets.

## Acceptance

- Pulse icon визуально нейтральна; positive цвет применяется только к status/value feedback.
- Четыре service rows используют узнаваемые brand marks внутри одинаковых нейтральных icon tiles.
- Overview и nested pages имеют одинаковые section header/card/footer gaps на всех viewport.
- Welcome использует одну основную content surface без лишней top-level дробности; media type/format
  объясняет `Default media`, а premium constraint остаётся видимым, но вторичным.
- На `320x568`, `430x932`, WebKit `390x844` и `1280x900` нет overflow; light/dark, focus, dialogs,
  console/network и serious Axe checks зелёные.

## Approach

1. Зафиксировать официальные формы brand marks и текущую settings geometry.
2. Добавить минимальный reusable brand-icon primitive и выровнять section/field spacing tokens.
3. Упростить Welcome и применить общий group rhythm к прочим nested settings.
4. Обновить deterministic assertions/evidence и проверить affected routes.
5. Пройти fresh changed/full gates, обновить `PROJECT_STATE.md` и закрыть план.

## Progress

- [x] 2026-08-13 — подтверждены причины Pulse accent, generic service icons и перегрузки Welcome.
- [x] 2026-08-13 — зафиксированы официальные brand assets и целевая spacing/composition схема.
- [x] 2026-08-13 — реализованы icons, Welcome cleanup и общий nested settings rhythm.
- [x] 2026-08-13 — расширено deterministic UI coverage для брендов, Pulse treatment и Welcome.
- [x] 2026-08-13 — пройдены code, browser и visual verification; обновлены docs, dev build доступен.

## Surprises & Discoveries

- Цвет Pulse задан статически в `.providerIcon`, а не вычисляется из active/configured state.
- Официальный Uptime Kuma mark остаётся предельно компактным после monochrome adaptation; узнаваемость
  обеспечивает исходный silhouette, а не отдельный generic activity glyph.

## Decision Log

- 2026-08-13 — brand marks будут монохромными и наследовать `currentColor`: узнаваемость сохраняется,
  а Flowvy icon tile, light/dark contrast и status color остаются единообразными.
- 2026-08-13 — исходники marks взяты из официальных репозиториев: Uptime Kuma
  `public/icon.svg` (`6b5ea0155793e666666745fb8d6fef1e829543a2`, MIT), Beszel
  `internal/site/public/static/icon.svg` (`c9b6279e61f0427e857a93443d1029406bc37709`, MIT), Remnawave
  `static/img/logo.svg` (`a39e153c663cccd9b11357fd171016f778429cb9`, AGPL-3.0); Flowvy использует
  собственный локальный знак. Все варианты встроены как code-native SVG без runtime network request.
- 2026-08-13 — premium requirement остаётся частью hint конкретного Greeting text, а media format
  становится description строки `Default media`; отдельный warning и три конкурирующих section title
  удалены.

## Verification

- `E:\mini-app\frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `E:\mini-app\frontend`: focused settings Playwright, затем all-project matrix на четырёх viewport.
- Ручная проверка: overview, Kuma, Beszel, Identity, Welcome и Access в light/dark; spacing,
  long copy, dirty/save failure, upload/reset, focus, overflow, console/network и Axe.
- `E:\mini-app`: `scripts/verify.ps1 -Scope Changed` и применимый final gate.

Промежуточно пройдено:

- changed-file Biome и `pnpm typecheck`;
- focused mobile Chromium: 5/5 settings scenarios;
- small-mobile Chromium + desktop Chromium: 8/8 settings rhythm/route/evidence scenarios;
- вручную просмотрены Overview, Welcome, Kuma и Beszel в light/dark на 320x568, 430x932 и
  1280x900; overflow, нечитаемых переносов и конкурирующей визуальной иерархии не обнаружено.

Финально пройдено:

- `E:\mini-app`: `$env:PLAYWRIGHT_PORT='5224'; .\scripts\verify.ps1 -Scope Full` — exit 0;
  Ruff, migration one-head/fresh/downgrade/re-upgrade/drift, 315 backend tests, frontend
  lint/typecheck/unit/build, contracts, docs и mobile browser gate зелёные;
- `E:\mini-app\frontend`: `$env:PLAYWRIGHT_PORT='5225'; pnpm exec playwright test --workers=4`
  — 208/208 passed на mobile Chromium, small-mobile Chromium, iOS WebKit и desktop Chromium;
- `http://127.0.0.1:5173`, `https://dev-app.flowvy.io`, локальный и публичный `/api/ready` — HTTP 200.

## Recovery and rollback

Изменения ограничены frontend source/tests/docs. Brand icons локальны и не делают network requests.
Каждая nested page сохраняет текущие hooks/payloads; visual composition можно откатить независимо.

## Outcomes & Retrospective

Pulse tile больше не использует misleading positive accent. Четыре системных/интеграционных строки
получили локальные адаптированные brand marks, а Kuma/Beszel используют те же marks в route headers.
Overview и nested settings теперь опираются на один section/field/action rhythm. Welcome вместо трёх
секций и отдельного warning использует одну content surface; premium constraint связан с Greeting
text, а media format — с `Default media`. API payloads, upload semantics и provider mutations не
изменялись. Полный repository gate, 208-case browser matrix и ручной light/dark осмотр пройдены;
стандартный Telegram-enabled dev-контур оставлен запущенным для проверки владельцем.
