# Закрыть P0-безопасность и подтвердить локальный dev-контур

Status: completed
Owner: Codex
Started: 2026-08-01
Updated: 2026-08-01

## Purpose

Сделать локальную разработку Flowvy безопасной и воспроизводимой: опасные debug API не должны
становиться публичными, Telegram-auth и admin-доступ обязаны отказывать при неполной конфигурации,
device mutations должны повторно подтверждать владельца, а Telegram webhook — проверять секрет.
После этого полный backend и migration gate должен пройти на PostgreSQL/Redis из Docker Desktop.
CF Tunnel используется только для frontend/dev-пути, который не публикует небезопасный debug API.

## Current state

- `DEBUG` в runtime-коде по умолчанию включён, а debug routers содержат читающие и изменяющие
  операции без обычной авторизации.
- `BOT_TOKEN` допускает пустую строку, которая не останавливает Telegram initData-проверку.
- Admin dependency опирается на сохранённую роль и не учитывает `is_active` и текущий allow-list.
- Device service использует локальный Remnawave UUID без повторной проверки ownership.
- Telegram webhook не использует Bot API `secret_token` и не проверяет входной secret header.
- Исходные P0 ниже закрыты текущим diff и regression tests. Docker/Tunnel подтверждены свежими
  проверками без чтения секретных локальных конфигов и `.env`.

## Scope

Входит: backend auth/config/debug/admin/device/Telegram webhook, regression tests, `.env.example`,
безопасные dev scripts/docs, Docker-backed pytest и disposable Alembic verification.

Не входит: реальные Telegram/Remnawave/Kuma вызовы, production deploy, destructive provider/admin
операции, чтение существующих секретов, полный P1 backlog после закрытия P0.

## Acceptance

- Пустой `BOT_TOKEN` не может использоваться для Telegram-auth; normal app startup/health остаётся
  пригодным для явно локального mock-режима без реального Telegram flow.
- Debug routes возвращают `404` вне явного локального debug режима и не публикуются через CF Tunnel.
- Admin access требует активного пользователя и актуального разрешения.
- Device mutation повторно сопоставляет authenticated Telegram identity с текущим provider user.
- Telegram webhook требует настроенный secret и корректный header; Bot API registration передаёт
  тот же secret.
- Targeted regression tests, полный backend suite, migration verifier, contract tests и
  change-aware verification проходят свежо с Docker PostgreSQL/Redis.
- Dev/tunnel workflow задокументирован и не требует раскрытия секретов.

## Approach

1. Проследить config → factory/dependencies → routes/services/repositories и существующие tests.
2. Сверить Telegram webhook secret contract с официальным Bot API и установленным aiogram.
3. Сначала добавить регрессионные tests, затем минимальные fail-closed изменения.
4. Поднять Docker Desktop/Compose без удаления volumes; прогнать migrations и полный pytest.
5. Проверить `cloudflared` и добавить безопасный frontend-only dev workflow; не оставлять tunnel
   запущенным после проверки.
6. Обновить документацию и перенести этот план в `plans/completed/` после полного результата.

## Progress

- [x] 2026-08-01 — Зафиксированы исходный dirty worktree, известные P0 и границы безопасной проверки.
- [x] 2026-08-01 — Прослежены auth/debug/admin/device/webhook paths и написаны failing tests.
- [x] 2026-08-01 — Реализованы fail-closed изменения и пройдены targeted tests.
- [x] 2026-08-01 — Пройдены Docker-backed full pytest и disposable migration checks.
- [x] 2026-08-01 — Проверен безопасный CF Tunnel dev workflow и обновлены docs.

## Surprises & Discoveries

- `ADMIN_TELEGRAM_IDS=` требовал `NoDecode`: pydantic-settings пытался JSON-декодировать пустой env
  до custom validator и мог сломать startup.
- Migration verifier содержал PowerShell typo `true` вместо `$true`.
- Alembic загружал полный application Settings и мог блокироваться/показывать input из-за несвязанной
  webhook-конфигурации; migration environment теперь читает только `DATABASE_URL`.
- Базовый downgrade оставлял PostgreSQL enum types, а media columns расходились с ORM по типу. Оба
  дефекта обнаружены upgrade/downgrade/re-upgrade + drift gate и исправлены.
- Установленная служба Cloudflare/WARP разрешает локальный `trycloudflare.com` в `198.18.0.0/15`,
  поэтому verifier использует внешний DNS edge для публичной TLS-проверки. Служба не изменялась.

## Decision Log

- 2026-08-01 — Не открывать CF Tunnel до закрытия debug/auth P0: frontend Vite proxy делает backend
  доступным через тот же публичный origin.
- 2026-08-01 — Не читать локальные `.env` и Cloudflare credentials; проверять только binaries,
  process/runtime status и synthetic configuration.
- 2026-08-01 — Локальный subscription UUID считать только кэшем; destructive device operation всегда
  требует свежего точного provider lookup, а неоднозначность закрывает операцию.
- 2026-08-01 — Quick Tunnel использовать только для временного production-build smoke; named Tunnel
  нужен для стабильного Telegram test URL.

## Verification

- `E:\mini-app\backend`: focused auth/admin/device/webhook pytest, Ruff, затем `uv run pytest -q`.
- `E:\mini-app`: `scripts/verify-migrations.ps1`, `scripts/verify-contracts.ps1` и
  `scripts/verify.ps1 -Scope Changed`.
- Docker: `docker info` и Compose health без `down -v` или удаления volumes.
- CF Tunnel: synthetic/local frontend route, отсутствие debug exposure, process stopped afterwards.

## Recovery and rollback

Кодовые изменения откатываются обычным Git revert после отделения пользовательского dirty diff.
Compose services останавливаются без `-v`; disposable migration database удаляет только собственную
случайно названную test database. Tunnel process завершается по сохранённому PID и не изменяет DNS.

## Outcomes & Retrospective

- `scripts/verify.ps1 -Scope Full`: 87 backend tests, one-head migration
  upgrade/downgrade/re-upgrade/drift, 8 Remnawave client tests, frontend lint/type/unit/build и 3
  Chromium Playwright smoke — пройдены.
- `pnpm test:e2e:all`: 12/12 на 430x932, 320x568, iPhone/WebKit и 1280x900.
- `scripts/verify-tunnel.ps1`: public root/health `200`, unauthenticated API `401`, debug/webhook
  `404`, source path отдаёт built HTML; все owned processes остановлены.
- Пустой token больше не аутентифицирует, debug default закрыт, inactive/admin revocation проверяются
  на запросе, device ownership обновляется перед mutation, Telegram webhook защищён одним secret.
- Дополнительно исправлены frontend `204`, безопасные loopback binds, migration isolation/symmetry и
  unknown provider status → suspended.
- Production всё ещё заблокирован оставшимися P1: Remnawave replay/retention, Kuma SSRF, streaming
  upload limit, provider error boundaries, readiness/ops и неполная UI state matrix.
