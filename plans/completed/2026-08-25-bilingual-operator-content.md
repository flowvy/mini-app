# Двуязычный operator content и единый выбор locale

Status: completed
Owner: Пятница
Started: 2026-08-25
Updated: 2026-08-25

## Purpose

Русский или английский пользователь получает один согласованный язык Flowvy и соответствующую
operator-authored версию шаблонов, Welcome, Support-статей и sponsor offers. Администратор может
ввести и проверить обе версии во всех затронутых редакторах, не пропуская публичные поверхности.

## Current state

- Product catalogs `en`/`ru` полные; до задачи Mini App выбирал locale только из
  `navigator.languages`, а bot использовал Telegram `User.language_code`.
- HTTP BFF получает выбранный frontend locale через `Accept-Language` и уже разрешает localized
  operator content через exact/base/default/English fallback.
- Communication, Welcome, sponsor offer и Support article editors уже имеют locale maps и language
  controls после добавления `ru`, но полнота, defaults, preview и public fallback требуют сквозной
  проверки.
- До задачи worktree содержит незакоммиченную русификацию и более ранние пользовательские изменения
  в `docs/PROJECT_STATE.md` и `scripts/dev-reset-data.ps1`; всё сохраняется без перезаписи.

## Scope

Входит Telegram-aware locale selection, полный аудит public operator-authored copy, двухъязычные
editor contracts для Settings/Support/Tribute, backend fallback/persistence, deterministic tests и
UI verification. Не входят перевод admin-only внутренних названий, provider facts, user-authored
Support messages, brand proper names и не реализованный Broadcast.

## Acceptance

- В Telegram Mini App `ru-*`/`en-*` из `user.language_code` имеют приоритет, неподдерживаемый
  Telegram locale падает в English; browser locale используется только вне Telegram или при
  отсутствии Telegram locale.
- Один effective locale идёт в i18next, `document.lang`, formatting и BFF `Accept-Language`.
- Все публичные operator-authored шаблоны, Welcome, Support articles и offers редактируются как
  English/Russian maps и выдаются по effective locale с проверенным fallback.
- Editor UI явно показывает обе локали, сохраняет изменения независимо и не ломается на 320x568,
  430x932 и 1280x900 в light/dark.
- Fresh full verification и целевой bilingual Playwright pass зелёные.

## Approach

1. Замкнуть inventory frontend editor → API schema → persistence → public consumer.
2. Зафиксировать Telegram locale contract по pinned SDK 3.3.9 / SDK 3.11.8 и official docs.
3. Внести минимальные contract/UI изменения и deterministic unit/backend tests.
4. Проверить bilingual authoring, locale resolution, fallback, UI constraints и весь repository gate.
5. Обновить verified state, просмотреть diff и закрыть план.

## Progress

- [x] 2026-08-25 — исходный Git state, project instructions и текущая locale цепочка зафиксированы.
- [x] 2026-08-25 — exhaustive operator-content inventory завершён; public и intentional
  nonlocalized surfaces разделены.
- [x] 2026-08-25 — реализован Telegram-aware locale без user preference persistence.
- [x] 2026-08-25 — backend/frontend/UI behavior покрыт bilingual и fallback regression tests.
- [x] 2026-08-25 — Full verification зелёный, документы обновлены, план закрыт.

## Surprises & Discoveries

- Mini App locale до задачи зависит от WebView `navigator.languages`, хотя официальный Telegram
  `WebAppUser.language_code` доступен в init data; bot уже использует этот Telegram field.
- Communication/Welcome, Support Quick Answers и sponsor offers уже хранили typed locale maps;
  недостающим был не новый CMS contract, а сквозной выбор locale и behavioral proof обеих версий.
- Повторные Full runs выявили, что integration tests использовали dev Redis DB 0 и накапливали
  rate-limit keys. Tests переведены на disposable DB 15 с per-test cleanup; DB 0 не очищался.

## Decision Log

- 2026-08-25 — язык brand/provider facts и user-authored messages не переводится; это данные, а не
  Flowvy product/operator locale copy.
- 2026-08-25 — Telegram `language_code` используется только как ephemeral UI preference из launch
  params, не сохраняется и не является trust boundary; raw init data по-прежнему проверяется
  сервером для auth.
- 2026-08-25 — официальный Telegram contract проверен по
  [WebAppUser](https://core.telegram.org/bots/webapps#webappuser) и
  [Connected Web Apps](https://core.telegram.org/bots/features#connected-web-apps): optional IETF
  `language_code` доступен Mini App; Flowvy поддерживает `en`/`ru`, unknown Telegram locale
  fail-safe разрешается в English.
- 2026-08-25 — brand identity, provider facts и user-authored Support conversation остаются
  verbatim; это не product/operator template copy. Shared image/video assets не дублируются по
  locale, поэтому baked-in text оператор контролирует внутри самого media.
- 2026-08-25 — отдельный user-facing language switch не добавляется. Language controls внутри
  Communication/Welcome/Quick Answers/sponsor offer editors остаются только authoring navigation
  между EN/RU версиями operator content.

## Verification

- `frontend`: targeted Vitest locale tests; bilingual Playwright authoring/public scenarios;
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `backend`: targeted localization/provider settings/Support/sponsor tests с `PYTHONPATH=src`.
- Repository root: `pwsh ./scripts/verify.ps1 -Scope Full`.
- UI: 320x568, 430x932 и 1280x900, light/dark, overflow/clipping, console/network и Axe guards.

## Recovery and rollback

Изменения обратимы на уровне locale helpers, JSONB payloads и тестов. Новая schema migration не
требуется: язык пользователя не сохраняется, существующие locale maps не удаляются. Реальные
Telegram/provider targets не вызывались.

## Outcomes & Retrospective

- Telegram Mini App теперь выбирает один effective locale из Telegram launch params при каждом
  запуске; этот locale управляет UI, `document.lang`, датами и BFF `Accept-Language`. Preference не
  сохраняется ни в browser storage, ни в PostgreSQL.
- Settings/Communication и Welcome, Support Quick Answers и Tribute sponsor offers позволяют
  независимо ввести EN/RU version. Target-language placeholders больше не зависят от языка admin UI.
- Bilingual public resolution доказан exact Russian и English fallback tests; partial Russian
  Welcome не подхватывает legacy English, но rows вообще без locale map остаются backward compatible.
- Focused Playwright: 21/21 на 430x932, 320x568 и 1280x900. Вручную просмотрены четыре свежих
  light/dark frames редакторов без clipping/overflow или визуальных артефактов.
- Final `pwsh ./scripts/verify.ps1 -Scope Full`: lifecycle scripts, migration head `i4d5e6f7g8h9`,
  one-head/backfill/downgrade/re-upgrade/drift, Ruff, 560 backend tests, 56 pinned Remnawave contracts, Biome,
  TypeScript, 109 Vitest tests, production build, 220/220 mobile Playwright и Markdown links — green.
- Commit/push и реальные Telegram, R2, Tribute или Remnawave mutations не выполнялись.
