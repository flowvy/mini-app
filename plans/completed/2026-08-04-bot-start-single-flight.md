# Один согласованный ответ на повторные `/start`

Status: completed
Owner: Codex
Started: 2026-08-04
Updated: 2026-08-04

## Purpose

Повторные команды `/start`, накопившиеся во время сетевого сбоя Telegram, должны обрабатываться как
одна пользовательская попытка и не приводить к противоречивым сообщениям об ошибке и успехе.

## Current state

Локальный polling 2026-08-04 несколько раз потерял соединение с `api.telegram.org`, после чего два
обновления `/start` были доставлены вместе. `cmd_start` не имеет single-flight защиты, поэтому два
REQUEST-scoped `RegistrationService` выполняются параллельно. PostgreSQL advisory lock защищает
локальную запись, но не объединяет ответы бота. Exact read-only lookup Remnawave также не повторяет
однократный transient `502/504`.

## Scope

Входит: дедупликация одновременно доставленных `/start`, bounded retry только read-only lookup
Remnawave при `502/504`, детерминированные bot/service tests, свежая backend и полная проверка.
Не входит: изменение polling/backoff aiogram, Telegram transport, схемы БД или данных Remnawave.

## Acceptance

- Два параллельных `/start` одной Telegram identity запускают регистрацию один раз и дают один ответ.
- Однократный `502/504` exact lookup повторяется с ограниченной задержкой; постоянная ошибка остаётся
  безопасной временной ошибкой.
- Ошибки `4xx` и ошибки контракта не повторяются автоматически.
- Все relevant contract/backend/full gates проходят свежо.

## Approach

1. Зафиксировать наблюдение из локальных логов и regression tests.
2. Добавить Redis single-flight lease вокруг bot `/start`, с token-safe завершением и коротким
   cooldown только после сформированного стабильного ответа.
3. Добавить в `RegistrationService.resolve_existing` один bounded повтор idempotent provider lookup
   только для `502/504`.
4. Проверить focused tests, полный backend и repository Full gate; обновить project state.

## Progress

- [x] 2026-08-04 16:26 +03:00 — логи подтвердили повторные `TelegramNetworkError`; два `/start`
  могли накопиться и затем выполняться одновременно.
- [x] 2026-08-04 16:31 +03:00 — Redis lease и bounded provider retry реализованы; focused suite
  подтвердил один ответ для двух concurrent `/start`.
- [x] 2026-08-04 16:36 +03:00 — 291 backend tests и полный repository gate с 40 Playwright
  scenarios прошли; dev перезапущен на прежнем Quick Tunnel URL.

## Surprises & Discoveries

- Задержка ответа вызвана наблюдаемым обрывом polling до Telegram, а не блокировкой Remnawave.
  Противоречивые ответы всё равно являются локальной гонкой и должны быть устранены.

## Decision Log

- 2026-08-04 — advisory lock БД оставляем как защиту записи, но добавляем отдельный Redis
  single-flight для пользовательского ответа: эти механизмы решают разные задачи.
- 2026-08-04 — retry разрешён только для exact read-only Remnawave lookup и только один раз на
  `502/504`; provider mutations не повторяются.

## Verification

- `E:\mini-app\backend`: `uv run pytest -q tests/test_bot_registration.py tests/test_registration.py`
  → regression tests pass.
- `E:\mini-app\backend`: `uv run ruff check .`; `uv run ruff format --check .`;
  `uv run pytest -q` → full backend pass with Docker PostgreSQL/Redis.
- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Full` → full repository gate pass.

## Recovery and rollback

Изменение не меняет схему и внешние данные. Откат ограничен bot handler, registration service,
tests и документацией. Redis lease имеет конечный TTL, поэтому аварийное завершение не создаёт
постоянной блокировки.

## Outcomes & Retrospective

Два отдельных `/start`, накопленных Telegram во время сетевого разрыва, теперь объединяются на
уровне пользовательской попытки. Redis lease имеет TTL 120 секунд, случайный token и безопасный Lua
finish; стабильный ответ получает 5-секундный cooldown, временная ошибка освобождает retry сразу.
Read-only Remnawave lookup повторяет только один явно transient сбой и не повторяет contract/auth
ошибки или provider mutation. Полный gate пройден с `PLAYWRIGHT_PORT=5196`; первый запуск без этой
переменной столкнулся с уже работающим dev frontend на `5173`, после чего проверка была повторена на
изолированном порту и прошла полностью.
