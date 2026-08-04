# Надёжный referral-вход через Main Mini App

Status: completed (corrected after live verification)
Owner: Codex
Started: 2026-08-04
Updated: 2026-08-04

## Purpose

Новый пользователь, открывший актуальную referral-ссылку, должен автоматически применить invite и
войти в Mini App; ручной ввод остаётся только fallback, если Telegram-клиент потерял launch payload.

## Current state

Карточка формирует bot deep link `?start=ref_<code>` и вкладывает его в `t.me/share/url`. Локальный
invite валиден и активен, bot parser работает для `/start ref_…`, но в наблюдаемом live-сценарии
Telegram прислал обычный `/start`. Официальная документация описывает `start`, однако публичный bug
tracker Telegram фиксировал client-specific потери payload. Текущий Main Mini App contract
поддерживает `?startapp=<payload>` и передаёт его в `tgWebAppStartParam`/`start_param`.

## Scope

Входит: новые share links через `startapp`, автоматический redeem на onboarding, видимый код в
share-тексте как fallback, frontend unit/Playwright tests и документация. Старые bot `?start=` links
остаются поддержаны. Не входит: изменение invite schema, BotFather configuration или Remnawave.

## Acceptance

- Новая share URL содержит `startapp=ref_<compact-code>`, а не `start=`.
- Invite-only onboarding с допустимым launch payload автоматически вызывает существующий защищённый
  redeem и входит без ручного ввода/reload.
- Malformed/отсутствующий payload не запускает автоматический запрос; manual form остаётся доступна.
- Share-текст содержит форматированный invite code как Telegram-client fallback.
- Frontend и полный repository gate проходят свежо.

## Approach

1. Вынести pure referral URL/payload helpers и закрыть unit tests.
2. Прочитать `tgWebAppStartParam` через pinned Telegram Apps SDK и один раз вызвать существующую
   redeem mutation после загрузки onboarding status.
3. Обновить browser scenario, integration docs и project state; выполнить полный gate и
   перезапустить dev.

## Progress

- [x] 2026-08-04 — подтверждено: один active invite длиной 23, active owner, новых referred users
  нет; backend не отклонял код, а не получил payload.
- [x] 2026-08-04 — реализованы optional startapp/autoredeem, default bot deep link,
  visible-code fallback, unit и browser regression scenarios.
- [x] 2026-08-04 — исправленный полный gate: migrations, 292 backend, 17 frontend unit,
  41 mobile Chromium,
  build и docs passed.

## Surprises & Discoveries

- Existing Playwright проверял только наличие `ref_...` внутри nested share URL, но не launch mode и
  не автоматическое применение payload получателем.

## Decision Log

- 2026-08-04 — исправлено после live-проверки: `startapp` разрешён только с явно заданным BotFather
  app short name; иначе ссылка использует официальный bot `start`.
- 2026-08-04 — frontend передаёт launch code в существующий `/api/onboarding/redeem`: код уже
  является вводимым пользователем bearer value, а Telegram identity по-прежнему проверяется BFF и
  попытки ограничиваются Redis.

## Verification

- `E:\mini-app\frontend`: `pnpm test`; `pnpm lint`; `pnpm typecheck`; `pnpm build`.
- `E:\mini-app\frontend`: isolated mobile Playwright registration scenario.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5196; .\scripts\verify.ps1 -Scope Full`.

## Recovery and rollback

Схема/данные не меняются. Старые `?start=` ссылки продолжают работать. Откат ограничен helper,
InviteCard, onboarding effect, tests и docs.

## Outcomes & Retrospective

Live-проверка показала, что bare `?startapp=` без зарегистрированного Main Mini App не запускается.
Текущий dev поэтому использует совместимый bot `?start=`; Direct Mini App включается только явным
short name. Точный URL shape, optional auto-redeem, fallback code и отсутствие двойного redeem
защищены тестами.
