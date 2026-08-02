# Beszel as a Pulse uptime provider

Status: completed
Owner: Codex
Started: 2026-08-02
Updated: 2026-08-02

## Purpose

Добавить Beszel как альтернативный источник состояния для страницы Pulse, сохранив Uptime Kuma и
один стабильный frontend response contract. Настройка должна выполняться из admin UI, а внешний
target — проходить те же SSRF, timeout, response-size и safe-error границы, что Kuma.

## Current state

- Pulse умеет читать только public status page Uptime Kuma.
- Kuma URL/slug/enabled хранятся в singleton `provider_settings` и меняются через admin API.
- `KumaClient` использует DNS pinning, private-origin allow-list, redirects/proxy off, bounded body и
  schema validation; `PulseService` нормализует provider data и кэширует результат в Redis.
- Локальная конфигурация Kuma отсутствует; наличие Beszel config ещё не установлено.

## Scope

Входит: официальный Beszel API contract/version; provider selection и настройки; безопасная
аутентификация/transport boundary; нормализация system status в существующий Pulse DTO; cache
invalidation; reversible migration; admin UI; deterministic backend/frontend/browser tests;
документация и доступный read-only live smoke.

Не входит: изменение Beszel systems, создание users/tokens, deployment Beszel, публикация Flowvy,
release в `main` или production tag/build.

## Acceptance

- Admin выбирает `disabled`, `kuma` или `beszel`; Kuma и Beszel настраиваются на отдельных экранах.
- Beszel credentials никогда не возвращаются frontend, не логируются и не сохраняются в test
  artifacts; отсутствие обязательной конфигурации закрывает включение.
- Beszel response нормализуется в текущий `/api/pulse` contract с deliberate unknown/down behavior.
- Target validation блокирует SSRF, redirects, mixed DNS, oversized/malformed/non-2xx responses.
- Изменение provider/settings инвалидирует Pulse cache.
- Migration проходит zero/previous-head/downgrade/re-upgrade/drift; полный применимый gate зелёный.

## Approach

1. Сверить current official Beszel docs/source/release и зафиксировать точные endpoints, auth и
   status fields.
2. Проследить Kuma route → settings service/model/schema → client → Pulse service → frontend.
3. Ввести явный provider discriminator и отдельную Beszel boundary, переиспользуя безопасный target
   transport без ослабления Kuma.
4. Добавить migration, admin settings и contract/state tests.
5. Пройти focused, migration, full backend/frontend/UI gates; выполнить только read-only live probe,
   если target/credentials уже настроены локально.
6. Обновить source-of-truth docs, перенести план в completed и push в `dev`.

## Progress

- [x] Official contract/version и Flowvy call map.
- [x] Backend/provider selection/migration.
- [x] Admin UI и deterministic tests.
- [x] Full verification и документация; live smoke ожидает локальную конфигурацию.

## Safety

- Не печатать `.env`, Beszel credentials, private hostnames/IP, system IDs/names или raw responses.
- Не выполнять write/delete/update в Beszel; live probe только login/read systems через настроенный
  dev target.
- Не ослаблять private-origin policy ради локального Docker target; использовать только точный
  operator allow-list.

## Verification

- Focused backend: Beszel client, settings validation, Pulse mapping/cache, routes.
- `scripts/verify-migrations.ps1` и полный backend suite с Docker PostgreSQL/Redis.
- Frontend lint/type/unit/build и Playwright states для provider selection/test/save/Pulse.
- `scripts/verify.ps1 -Scope Full` перед handoff; live read-only отдельно и только при config.

## Outcomes & Retrospective

- Beszel `v0.18.7`/commit `6e3fd90834309213aca32f2ff5fb0b027661c39a` зафиксирован по
  official docs/source. Flowvy выполняет только auth и чтение назначенных systems/stats.
- Добавлен selector `disabled|kuma|beszel`, обратимая миграция с сохранением legacy Kuma state,
  server-only credential и provider-neutral Pulse/cache contract.
- Общая origin boundary сохранила Kuma и дала Beszel одинаковые SSRF/DNS pinning/redirect/proxy/body
  guarantees. Contract/error/history/cache branches покрыты deterministic tests.
- Admin UI получил выбор источника и отдельный Beszel экран. Full gate прошёл: 253 backend test,
  migration/contracts/frontend build, 16 primary browser tests; all-project matrix — 64/64.
- Light/dark Beszel evidence просмотрен вручную; низкий contrast общего form footer исправлен и
  повторно проверен 20/20 targeted browser tests.
- Live smoke не запускался: в локальном `.env` нет Beszel email/password, в dev DB нет Hub URL и
  provider выключен. Нужны origin и credential отдельного `readonly` пользователя.
