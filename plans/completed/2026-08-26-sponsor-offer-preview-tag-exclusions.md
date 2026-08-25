# Точный preview оффера и исключения по Remnawave tags

Status: completed
Owner: Пятница
Started: 2026-08-26
Updated: 2026-08-26

## Purpose

Администратор видит в редакторе sponsor offer тот же presentation component, который пользователь
увидит на Home, и может скрыть конкретный опубликованный offer от пользователей с выбранными
Remnawave tags.

## Current state

- `sponsor_offers` хранит provider-neutral presentation и immutable checkout snapshot; Home получает
  server-computed sponsor state через FastAPI BFF.
- Admin offer editor и Home сейчас рендерят разные UI paths; точные различия ещё исследуются по
  текущим React components и Playwright fixtures.
- Remnawave tag уже является typed provider-owned сущностью в access-profile flow; точный pinned
  provider contract и текущий user lookup path ещё исследуются до выбора хранения и фильтрации.
- На старте `git status --short --branch` показал чистую `dev`, ahead `23`; существующие файлы задачи
  не изменены.

## Scope

Входит: admin editor preview, sponsor-offer API/schema/model/migration для tag exclusions,
backend-authoritative Home filtering, locale copy, deterministic backend/frontend/UI tests и docs.

Не входит: изменение Remnawave tags, live provider mutations, Tribute payment semantics, скрытие
оффера от admin list или изменение уже созданных immutable checkout snapshots.

## Acceptance

- Preview в create/edit editor использует тот же визуальный offer presentation, структуру цены,
  benefits и CTA semantics, что Home для эквивалентного draft.
- Admin может выбрать ноль или несколько текущих Remnawave tags; сохранённые ID проходят backend
  validation и возвращаются в admin API.
- Home не возвращает конкретный offer пользователю, если его актуальные provider tags пересекаются
  с exclusions; отсутствие exclusions сохраняет текущее поведение.
- Provider/contract failure не раскрывает оффер пользователю, когда безопасно определить exclusions
  нельзя; точная fail-closed граница будет зафиксирована после трассировки текущего Home lookup.
- Fresh migration, backend, frontend, contract и Playwright gates проходят; светлая/тёмная темы и
  mobile/admin desktop preview визуально проверены без новых Axe/overflow/console/network findings.

## Approach

1. Построчно проследить sponsor state и Remnawave tag contracts от provider schema/client до Home и
   от admin route до editor; сверить pinned snapshot и primary official source.
2. Добавить минимальное локальное поле exclusions с обратимой Alembic migration и строгой схемой;
   повторно валидировать выбранные tags backend'ом при create/update.
3. Фильтровать published offers в user sponsor state по свежему уже авторизованному provider user
   contract, не передавая provider payload во frontend.
4. Выделить/переиспользовать общий Home offer presentation для editor preview и дополнить
   deterministic fixtures/tests.
5. Выполнить change-aware, migration, contract и focused UI checks, просмотреть diff/docs, затем
   закрыть план только после full verification.

## Progress

- [x] 2026-08-26 — Проверены repository instructions, skills, текущий `PROJECT_STATE.md`,
  architecture section и начальный git state.
- [x] 2026-08-26 — Завершён end-to-end source/contract trace; exact official 2.8.1/3.0.0/3.1.0
  contracts подтверждают catalog `tags: string[]` и singular nullable user `tag`.
- [x] 2026-08-26 — Реализованы backend model/API/filtering, direct-checkout guard и обратимая
  migration; focused Ruff, migration lifecycle и backend tests зелёные.
- [x] 2026-08-26 — Реализованы tag selector и общий с Home `SponsorOfferCard`; exact parity test
  прошёл 4/4 projects в light/dark, артефакты просмотрены.
- [x] 2026-08-26 — Fresh Full verification и final diff review пройдены; documentation обновлена.

## Surprises & Discoveries

- Remnawave catalog возвращает массив допустимых tags, но user model во всех трёх поддерживаемых
  exact tags содержит одно nullable поле `tag`. Exclusion contract поэтому plural на offer и
  singular при сравнении пользователя.
- Provider availability нужна только ограниченным offers. Неограниченные offers не должны получать
  новый Remnawave dependency; при lookup failure они остаются видимыми.

## Decision Log

- 2026-08-26 — Задача требует ExecPlan, потому что одновременно меняет schema, Remnawave boundary,
  backend contract и UI.
- 2026-08-26 — Exclusions являются server-authoritative и admin-only. Home response не раскрывает
  список, а `POST /checkouts` повторно проверяет eligibility до reuse/create local intent.
- 2026-08-26 — User miss и `tag: null` означают отсутствие tag; malformed/transport response
  fail-closed только для restricted offers.
- 2026-08-26 — Admin list и Home используют один `SponsorOfferCard`; preview CTA остаётся визуально
  тем же, но исключён из tab order и помечен `aria-disabled`.

## Verification

- Repository root: `pwsh ./scripts/verify-migrations.ps1` → один Alembic head, upgrade/downgrade/
  re-upgrade/runtime inserts/model drift без ошибок.
- `backend/`: focused sponsor/repository/provider tests, Ruff format/lint, затем полный pytest.
- Repository root: pinned Remnawave contract verification и `pwsh ./scripts/verify.ps1 -Scope Full`.
- `frontend/`: lint, typecheck, unit tests, build и focused Playwright sponsor/visual matrix на
  430x932, 320x568, iOS WebKit и 1280x900 в light/dark.

## Recovery and rollback

Migration downgrade удаляет только новое exclusion field после явной проверки target database;
существующие offers по умолчанию получают пустой список и сохраняют видимость. Provider calls в
тестах mock/fake-only. Код можно откатить обычным revert ещё не созданного локального commit; commit
и push без отдельного разрешения не выполняются.

## Outcomes & Retrospective

- Admin и Home теперь рендерят один offer presentation component; admin-only controls больше не
  меняют storefront preview.
- Exclusions хранятся в обратимом JSONB field, проверяются по live tag catalog при изменении и
  применяются backend'ом как к Home list, так и к direct checkout.
- Public sponsor response не раскрывает внутреннюю eligibility-конфигурацию. Provider failure
  добавляет fail-closed dependency только restricted offers; unrestricted path не вызывает
  Remnawave.
- Focused backend: 56/56. Exact preview: 4/4 projects, light/dark внутри каждого. Финальный Full:
  migration lifecycle/drift, Ruff, 570 backend, 56 pinned contracts, lint/typecheck, 111 unit,
  production build, 230/230 mobile Chromium Playwright и Markdown links.
- Реальные Remnawave/Tribute requests и mutations не выполнялись. Commit/push не выполнялись.
