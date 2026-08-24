# Консистентная иерархия Support и сервисных уведомлений

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-24

## Purpose

Привести уже работающий Support к визуальной и компонентной системе Flowvy: убрать route-action из
глобального Header, дать администратору контекстный вход в Quick Answers, выровнять очередь,
conversation и Support attachments с существующими UI primitives, а фиксированные Telegram
уведомления сделать легче сканируемыми без изменения их продуктового flow.

## Current state

- `/support` уже role-aware: user видит Quick Answers, active/resolved requests и CTA; admin видит
  queue и открывает управление статьями отдельной круглой кнопкой рядом с mode switch в
  `frontend/src/components/layout/header.tsx`.
- Support использует часть shared primitives, но admin filter и несколько поверхностей повторно
  реализованы в `frontend/src/pages/support.tsx` и `support.module.css`.
- `/admin/settings/support` корректно read-only и не принимает R2 secrets, но собран из
  `SettingsSection` и собственных inset/setup shells, тогда как nested Settings routes используют
  `SettingsPanel`, `SettingsFields`, `SettingsStatusRow` и общий `settings.module.css`.
- `backend/src/flowvy/locales/en.json` содержит fixed product-owned Telegram templates. Locked
  sender использует HTML parse mode и безопасно экранирует динамические значения.
- Официальный Telegram Bot API на 2026-08-24 подтверждает HTML `<blockquote>` и обязательное
  экранирование `<`, `>` и `&`: https://core.telegram.org/bots/api#formatting-options.

## Scope

Входит:

- иерархия user/admin Support overview, queue, request conversation и article management entry;
- консистентная композиция Support attachments из существующих Settings primitives;
- фиксированные user/admin Telegram Support templates и deterministic tests;
- responsive/light/dark/browser проверка затронутых маршрутов и свежая build/runtime проверка.

Не входит:

- изменение Support API, модели данных, R2 policy, retention или auth;
- кастомизация уведомлений оператором;
- реальные Telegram/provider/storage mutations;
- переработка общей дизайн-системы или принятого ADR 0004 contrast debt.

## Acceptance

- В Header рядом с admin/user mode switch нет Support-specific create/manage action.
- Admin Support содержит понятный контекстный row для Quick Answers, а создание статьи остаётся на
  management route внутри содержимого страницы.
- Support не дублирует shared segmented-control и использует neutral surfaces; positive color
  остаётся для action/status emphasis.
- `/admin/settings/support` визуально и семантически повторяет nested Settings pages, secrets
  остаются только env-owned, configured/missing/test states сохраняются.
- Telegram user/admin notifications показывают subject, reply/request body и metadata как три
  различимых уровня; dynamic HTML остаётся escaped; кнопки остаются ровно `Reply` и `Open`.
- Focused tests, lint, typecheck, unit/backend notification tests и production build проходят;
  Support проверен в light/dark на 320x568, 430x932, iOS WebKit и desktop без новых Axe findings,
  console/network errors или horizontal overflow.

## Approach

1. Снять deterministic baseline и сопоставить Support с существующими Header, Settings, form,
   segmented-control и Desktop-derived surface owners.
2. Минимально перестроить композицию: удалить Header actions, добавить admin management row,
   переиспользовать shared controls и нормализовать neutral/semantic color roles.
3. Пересобрать Support attachments на nested Settings primitives без изменения backend contract.
4. Обновить fixed Telegram HTML templates с `<blockquote>`, усилить escaping/render tests.
5. Выполнить focused browser matrix, fresh static/backend/build gates, review diff, обновить
   `docs/PROJECT_STATE.md` и перезапустить стандартный dev через tracked scripts.

## Progress

- [x] 2026-08-24 06:08 +03:00 — прочитаны действующие Support plans, source flow, shared UI
  primitives, Settings references, UI/integration/verification skills и официальный Telegram HTML
  formatting contract.
- [x] 2026-08-24 06:11 +03:00 — снято и просмотрено deterministic baseline UI evidence для
  user/admin overview, conversation и Support attachments.
- [x] 2026-08-24 06:18 +03:00 — реализована UI и notification hierarchy, обновлены deterministic
  tests и integration/project-state documentation.
- [x] 2026-08-24 06:25 +03:00 — выполнены свежие Changed/backend/browser gates и clean standard
  dev restart с local/public acceptance.

## Surprises & Discoveries

- Support-specific action добавлен прямо в shared Header и виден рядом с mode switch; это не
  ограничение Header component, а локальное route exception, которое можно удалить без изменения
  глобальной navigation contract.
- Telegram HTML parse mode уже поддерживает нативный block quotation, поэтому более выразительное
  сообщение не требует Rich Messages, media или нового sender contract.
- Расширенная light-theme Axe matrix обнаружила, что positive success notice на Support attachments
  создавал новый contrast finding 2.55:1. Finding не подавлялся: passive access result переведён в
  neutral informational surface, а hover action проверяется после deterministic pointer reset.

## Decision Log

- 2026-08-24 — Quick Answers management становится обычным context row внутри admin Support;
  Header сохраняет только page identity и глобальный mode switch.
- 2026-08-24 — Support status/accent использует semantic color точечно; крупные cards и hover states
  остаются neutral, как в Settings/FormSection references.
- 2026-08-24 — Telegram templates остаются fixed product copy и обычным `sendMessage` HTML; body
  оформляется `<blockquote>`, чтобы не расширять integration surface на Rich Messages 10.x.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/backend`:
  `PYTHONPATH=src uv run pytest -q tests/test_support_notifications.py` → 6 passed; relevant Ruff
  format/check → exit 0.
- Repository root: `pwsh -NoProfile -File ./scripts/verify.ps1 -Scope Changed -SkipE2E` → 438
  service-free backend tests, Ruff and lock checks, frontend lint/typecheck, 20 Vitest files with
  100 tests, production build and documentation links passed.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`:
  `PLAYWRIGHT_PORT=5204 pnpm exec playwright test tests/e2e/support.spec.ts --workers=4` → 56/56
  passed on mobile 430x932, small 320x568, iOS WebKit and desktop 1280x900.
- Ручная проверка evidence: user/admin overview, article list, configured/missing Support attachments
  и conversation в light/dark; отсутствие overflow, console/network errors и новых Axe findings.
- Repository root: clean tracked `dev-down.ps1` / standard `dev-up.ps1`; local frontend/backend/preview
  и public root/health/ready вернули 200, public debug — 404, ports 5173/8001/4173 принадлежат tracked
  processes, PostgreSQL/Redis healthy, `telegram_main_app_ready` присутствует. Preview использует
  свежий `index-DZ10XmSv.js`.

## Recovery and rollback

Изменения не меняют данные, provider state или schema. Повторная browser проверка использует mocked
API и отдельный Playwright port. Runtime останавливается и поднимается только `dev-down.ps1` /
`dev-up.ps1`; неизвестные PID не завершаются вручную. Откат выполняется только точечным возвратом
изменённых UI/template/test/doc hunks, без destructive Git commands.

## Outcomes & Retrospective

Support теперь сохраняет глобальный Header для identity/mode, а локальные действия находятся в
контексте соответствующего экрана. Очередь и Support attachments используют существующих владельцев
композиции, conversation читается как диалог без лишней positive заливки, а Telegram сообщения
получили устойчивую subject/body/metadata hierarchy на штатном HTML `sendMessage`. Контракты API,
recipients, R2, retention, кнопки `Reply`/`Open` и provider behavior не менялись. Реальные Telegram
messages и R2/provider mutations не выполнялись; commit/push не выполнялись.
