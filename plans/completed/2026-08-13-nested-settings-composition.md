# Единая композиция вложенных Settings

Status: completed
Owner: Codex
Started: 2026-08-13
Updated: 2026-08-13

## Purpose

Вложенные Settings должны восприниматься как одна система с overview: одинаковый внешний ритм,
собранные form surfaces, локальные group dividers и контекстные действия. Access profile creation
должен начинаться из блока профилей и ясно вести к созданию, а Premium constraint в Welcome должен
быть заметным, но не конкурировать с полями.

## Current state

- Overview уже использует устойчивые grouped rows, но nested routes продолжают чередовать внешние
  section labels, отдельные field stacks, status rows и save surface без единой внутренней схемы.
- `Add` в Access находится в наружном заголовке секции, отделён от списка и использует
  неоднозначный label; empty state не предлагает следующий шаг.
- Создание и редактирование профиля используют одинаковые generic title/footer labels, хотя при
  создании пользователю нужна явная задача `Create access profile` и progressive disclosure.
- Premium constraint слит с обычным helper text Greeting field и поэтому не воспринимается как
  важное ограничение.

## Scope

- отдельный nested-settings panel primitive с внутренним group header;
- перевод Kuma, Beszel, Identity, Welcome и Registration/Access на один panel/field/status rhythm;
- перенос `Create profile` внутрь profiles surface, contextual empty state и явные create labels;
- сохранение advanced access fields под disclosure;
- компактное inline warning о Telegram Premium рядом с Greeting text;
- deterministic Playwright assertions и light/dark visual evidence на 320/430/WebKit/desktop.

Не меняются backend contracts, access defaults, profile payload, media upload semantics и provider
mutations.

## Acceptance

- Nested settings имеют один и тот же page inset, internal group header, content padding, divider и
  action spacing; нет наружных floating actions.
- В заполненном profiles block создание доступно через trailing action row, а в empty state — через
  один contextual CTA с глаголом `Create`.
- Create dialog явно называется и завершается `Create profile`; edit flow сохраняет `Save`.
- Advanced provider fields остаются закрыты по умолчанию, focus trap/return и Escape не ломаются.
- Premium warning отдельный, компактный и расположен сразу после Greeting text.
- На четырёх Playwright проектах нет overflow, console/network errors и serious Axe violations.

## Progress

- [x] 2026-08-13 — повторно изучены mini-app nested settings и desktop Settings/Edit Profile.
- [x] 2026-08-13 — сверены актуальные Carbon/Atlassian empty-state/action рекомендации.
- [x] 2026-08-13 — реализованы nested panel rhythm, Access create UX и Premium inline warning.
- [x] 2026-08-13 — обновлены deterministic tests и evidence на четырёх browser projects.
- [x] 2026-08-13 — пройдены focused/full verification, обновлён project state, dev build доступен.

## Decision Log

- 2026-08-13 — overview сохраняет внешние category labels; nested forms используют внутренний
  group header в одной surface, как в desktop settings detail cards.
- 2026-08-13 — `Add` заменяется конкретным `Create profile` внутри коллекции: Carbon рекомендует
  помещать empty state в контекст отсутствующих данных с прямым primary action, Atlassian — CTA с
  императивным глаголом вместо неоднозначного label.
- 2026-08-13 — Premium constraint оформляется section-local inline warning, а не page banner:
  ограничение относится только к Greeting text и не блокирует сохранение.

## Verification

- Changed-file Biome, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Focused Access/Welcome/settings Playwright на mobile, small-mobile и desktop.
- Full all-project Playwright matrix и `scripts/verify.ps1 -Scope Full` перед handoff.
- Ручной light/dark осмотр Kuma, Beszel, Identity, Welcome, Access policy, empty/list profiles и
  create dialog.

Промежуточно пройдено:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — 178 files linted, 33 unit tests и
  production build passed;
- focused mobile functional/evidence pass — после correction тестовых exact locators зелёный;
- small-mobile + desktop affected matrix — 58 сценариев, единственные два initial failures были
  stale `App Name` screenshot markers; после correction 2/2 rerun passed;
- `$env:PLAYWRIGHT_PORT='5233'; pnpm exec playwright test --workers=4` — 216/216 passed на 430x932,
  320x568, iOS WebKit 390x844 и desktop 1280x900;
- вручную просмотрены Welcome, Kuma, Beszel, Identity, Access policy/list/empty/create в light/dark;
  contained headers, 760px desktop form width, warning wrapping, compact dialog scroll/footer и
  bottom chrome визуально согласованы.
- `$env:PLAYWRIGHT_PORT='5234'; .\scripts\verify.ps1 -Scope Full` — exit 0; migration
  one-head/upgrade/downgrade/re-upgrade/drift, 315 backend tests, frontend lint/type/unit/build,
  contracts, docs и mobile browser gate зелёные.

## Outcomes & Retrospective

Kuma, Beszel, Identity, Welcome и Access используют один contained panel contract с internal group
header, одинаковыми padding/divider/save intervals и 760px desktop limit. Access creation теперь
начинается внутри profiles surface: list state показывает trailing action row, empty state — один
контекстный CTA, а dialog различает create/edit copy и сохраняет advanced provider fields под
disclosure. Premium constraint возвращён как компактный section-local warning. Backend contracts и
payloads не менялись. Full repository gate, 216-case browser matrix и ручной light/dark осмотр
пройдены; Telegram-enabled dev-контур оставлен запущенным.
