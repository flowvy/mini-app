# Официальный Telegram referral flow без fallback-эвристик

Status: active
Owner: Codex
Started: 2026-08-04
Updated: 2026-08-04

## Purpose

Выбрать и реализовать один официально поддерживаемый Telegram flow, при котором новый пользователь
переходит по приглашению, Flowvy получает invite payload из документированного поля и регистрирует
пользователя без client/parser-эвристик.

## Current state

Flowvy последовательно пробовал bot `?start=` и bare `?startapp=`. Первый live-сценарий пришёл как
обычный `/start` без attribution; второй не открыл приложение, потому что capability Main/Direct
Mini App не была подтверждена. Временный raw-message fallback в bot handler и условный frontend
link builder не считаются принятым решением. Установлены `@telegram-apps/sdk-react` 3.3.9 и
`@telegram-apps/sdk` 3.11.8.

## Scope

Входит: официальные Bot API/Mini Apps/deep-link/share contracts, требуемая BotFather-конфигурация,
frontend launch parsing, backend onboarding boundary, deterministic tests и документация. Не входит:
изменение модели invite/access profile или Remnawave contract.

## Acceptance

- Ссылка соответствует одному точному официальному формату и доступной capability бота.
- Invite принимается только из подписанного Telegram `start_param` либо другого прямо
  документированного transport; парсинг случайного текста не заменяет контракт.
- Не настроенная обязательная Telegram capability выявляется явно, а не скрывается другим UX.
- Success, missing/malformed payload, duplicate execution и API failure покрыты тестами.
- Live dev повторно запущен только после полного локального gate; остающийся BotFather-шаг указан
  точно, если его нельзя выполнить через Bot API.

## Approach

1. Полностью прочитать primary official Telegram sections: bot deep linking, Main Mini App, Direct
   Mini App, BotFather setup, init data/start_param, sharing/prepared messages и link constraints.
2. Сопоставить варианты с текущей конфигурацией/кодом Flowvy; письменно выбрать один transport и
   удалить временные обходы.
3. Реализовать минимальный контракт end-to-end, обновить tests/docs и выполнить full gate.

## Progress

- [x] 2026-08-04 — работа остановлена после live failure; временные решения признаны
  неподтверждёнными.
- [x] 2026-08-04 — завершена official-contract matrix: bot `start`, Main Mini App, Direct Mini App,
  menu/inline button, signed `initData`, `getMe.has_main_web_app` и Telegram share link сверены с
  primary documentation и установленными aiogram/Telegram Apps SDK.
- [x] 2026-08-04 — выбран Main Mini App transport: backend проверяет capability через `getMe`,
  выдаёт только `t.me/<bot>?startapp=ref_<code>`, а redeem использует только подписанный
  `initData.start_param`.
- [x] 2026-08-04 — server-validated Main Mini App flow, fail-closed capability UI, deterministic
  backend/frontend tests и документация реализованы; полный gate прошёл.
- [x] 2026-08-04 — Telegram-enabled dev перезапущен; bounded `getMe` подтвердил для текущего test
  bot `has_main_web_app=false`, backend/frontend готовы и не публикуют нерабочую ссылку.
- [x] 2026-08-04 — named-Tunnel origin contract проверен на safe local preview: public
  root/health/readiness `200`, debug route `404`; dev lifecycle получает URL явно, не управляя
  системным connector. Проверочный hostname затем исключён: владелец уточнил, что он принадлежит
  другому проекту; Flowvy preview и dev остановлены.
- [x] 2026-08-04 — создан отдельный Flowvy published application route на local port `80`; public
  root/health/readiness/production asset `200`, debug route `404`, чужой route не изменён.
- [x] 2026-08-04 — Main App включена в BotFather на отдельном Flowvy HTTPS hostname; свежий startup
  подтвердил `telegram_main_app_ready` / `has_main_web_app=true`.
- [ ] 2026-08-04 — провести new-account live handoff по свежей `?startapp=` ссылке.

## Surprises & Discoveries

- Bare `t.me/<bot>?startapp=…` требует включённой Main Mini App; Direct Mini App использует
  `t.me/<bot>/<short_name>?startapp=…`. Наличие обычной `web_app` inline button этого не доказывает.
- Если Main Mini App не настроена, Telegram по официальному client contract обрабатывает
  `?startapp` как обычную username-ссылку. Это не потеря payload в Flowvy, а отсутствующая
  capability бота.
- `tgWebAppStartParam` и client launch params пригодны для раннего UI, но Telegram прямо запрещает
  доверять `initDataUnsafe`; регистрационное решение должно использовать server-validated raw
  `initData`, где locked aiogram 3.26.0 предоставляет `WebAppInitData.start_param`.
- Первый live startup получил transient Bot API failure, а немедленный read-only `getMe` успешно
  вернул `has_main_web_app=false`. Capability discovery теперь делает не более двух попыток только
  для timeout/network/Telegram 5xx; auth и другие API errors не повторяются.

## Decision Log

- 2026-08-04 — не считать raw `/start` text parsing или автоматический fallback между разными
  Telegram products итоговым решением.
- 2026-08-04 — Flowvy является одним полноценным приложением бота, поэтому выбран Main Mini App, а
  не Direct Mini App с дополнительным `short_name`.
- 2026-08-04 — frontend не конструирует Telegram launch link и не передаёт найденный в URL code в
  auto-redeem body. Backend проверяет bot capability, строит ссылку и извлекает code из уже
  проверенного `initData.start_param`; manual code остаётся отдельным явным flow.
- 2026-08-04 — `t.me/share/url` оставлен как официальный Telegram share link. Более новый
  `WebApp.shareMessage` требует отдельного `savePreparedInlineMessage` lifecycle и не исправляет
  launch capability, поэтому не добавляется в этот corrective change.

## Verification

- `E:\mini-app\backend`: focused bot/onboarding tests, затем full pytest/ruff.
- `E:\mini-app\frontend`: mobile Playwright, lint/type/unit/build.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5196; .\scripts\verify.ps1 -Scope Full`.
- Live: новый Telegram account, новая ссылка, privacy-safe logs без payload/identity.

## Recovery and rollback

Схема БД не меняется. Telegram/BotFather state не изменять до явной фиксации точной команды и
целевого test bot. Кодовые изменения обратимы в пределах referral helper/handler/tests/docs.

## Outcomes & Retrospective

Кодовая часть подтверждена fresh Full gate: Alembic one-head/upgrade/downgrade/drift, 298 backend,
41 Remnawave contract, frontend lint/type/unit/build, 43 mobile Chromium и docs прошли. Предыдущий
live failure объяснён официальным Telegram client contract: без Main Mini App `?startapp` становится
обычной username-ссылкой. Safe origin, отдельный Flowvy hostname и BotFather capability проверены;
остаётся live handoff новым аккаунтом. Quick Tunnel намеренно не используется как скрытый fallback.
