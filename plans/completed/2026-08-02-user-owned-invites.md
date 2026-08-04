# Персональные пользовательские инвайты

Status: completed
Owner: Codex
Started: 2026-08-02
Updated: 2026-08-02

## Purpose

Каждый зарегистрированный пользователь Flowvy получает постоянный многоразовый invite code и
удобную Telegram-ссылку, которой может делиться с другими. Новый пользователь регистрируется по
этому коду, Flowvy навсегда фиксирует непосредственного пригласившего, а количество приглашённых
видно владельцу кода и администратору в карточке пользователя.

## Current state

Предыдущая незакоммиченная реализация ошибочно создала одноразовые коды от имени администратора.
Она уже отделила Telegram authentication от регистрации, добавила open/invite-only policy,
access profiles и Remnawave provisioning. В dev-БД наблюдается один существующий user, ноль
access profiles и ноль invite rows, поэтому следующая forward migration может безопасно
инвалидировать неиспользуемый прежний формат без удаления пользователей.

## Scope

Входят персональный reusable code, прямая Telegram bot link, системный share-dialog, ручной ввод,
атрибуция первого уровня, счётчик, пользовательская карточка приглашения, admin user detail,
миграция, bot/API/UI/tests/docs. Admin продолжает управлять только registration mode и общим
профилем доступа новых пользователей; admin code issuance/list/revoke удаляются.

Не входят награды, многоуровневая реферальная сеть, лидерборд, персональные квоты и платежи.

## Acceptance

- У каждого existing/new active user есть ровно один стабильный активный code.
- Один code регистрирует несколько разных пользователей; повторный запрос одного Telegram identity
  не создаёт дубль и не меняет inviter.
- Получатель может применить код вручную или через `/start ref_<code>`; открытая регистрация также
  сохраняет referral, если пользователь пришёл по валидной ссылке.
- Владелец видит code, copy/share controls и число прямых регистраций; admin detail показывает то же
  число, но не получает отдельной системы кодов.
- Invalid code не раскрывает наличие/статус пользователя, попытки ограничены, inactive inviter не
  может приглашать новых пользователей.
- Remnawave access определяется общей registration policy/access profile, а не inviter.

## Approach

1. Заменить одноразовую доменную модель на один reusable invite row на user и immutable
   `users.invited_by_id`; сохранить access profiles и registration mode.
2. Упростить admin API/UI, добавить `/api/me/invite`, referral count и bot deep-link handling.
3. Добавить user invite card с copy/share feedback и admin statistic.
4. Обновить deterministic backend/frontend/Playwright tests, ADR и source-of-truth docs.
5. Проверить forward/backward migrations на disposable DB, полный backend/frontend/contract/UI gate
   и только затем обновить dev-БД до нового head.

## Progress

- [x] 2026-08-02 15:35 +03:00 — уточнена продуктовая модель: codes принадлежат users, admin codes
  отсутствуют, нужна статистика в user card.
- [x] 2026-08-02 15:43 +03:00 — подтверждены official Telegram bot/startapp/share contracts и
  установленный aiogram `CommandObject.args`; выбран bot deep link с ручным fallback.
- [x] 2026-08-02 15:45 +03:00 — dev data audit: users=1, access_profiles=0, invites=0.
- [x] Переделать schema/service/API/bot и миграцию.
- [x] Переделать user/admin UI и fixtures.
- [x] Завершить проверки и документацию.

## Surprises & Discoveries

- `VITE_BOT_USERNAME` уже предусмотрен в frontend env и локально настроен, но нигде не
  использовался; новую зависимость или backend network lookup для share URL добавлять не нужно.
- Telegram bot start parameter допускает до 64 base64url symbols; формат `ref_<normalized-code>`
  помещается в лимит и явно отделяет referral payload от будущих deep-link команд.

## Decision Log

- 2026-08-02 — code многоразовый и постоянный; это приглашение/атрибуция, а не одноразовый
  администраторский credential.
- 2026-08-02 — считаются только прямые регистрации; inviter фиксируется один раз и не меняется.
- 2026-08-02 — один общий default access profile применяется к open и invited registration;
  пригласивший не определяет тариф приглашённого.
- 2026-08-02 — primary sharing использует official Telegram share URL и bot `/start` deep link;
  copy code остаётся независимым fallback.

## Verification

- `E:\mini-app`: `scripts/verify-migrations.ps1` → один head, zero/previous-head,
  downgrade/re-upgrade и model drift.
- `E:\mini-app\backend`: Ruff и полный pytest с reusable/concurrent/deep-link/referral count cases.
- `E:\mini-app\frontend`: lint, typecheck, unit, build.
- `E:\mini-app\frontend`: Playwright на 430x932, 320x568, WebKit iPhone и desktop; user invite card,
  copy/share, manual onboarding, admin statistic, loading/error/overflow/axe/console guards.

## Recovery and rollback

Новая revision следует после уже применённой `k1l2m3n4o5p6`, не переписывая историю. Upgrade
инвалидирует старые admin invite rows, но сохраняет users/access profiles и выдаёт каждому existing
user персональный code. Downgrade восстанавливает форму предыдущей таблицы с новыми кодами как
неактивными legacy records; referral attribution при downgrade не сохраняется, что документируется
как потеря только новой функциональности. Dev-БД обновляется только после disposable migration gate.

## Outcomes & Retrospective

- Персональная reusable модель полностью заменила незарелизованную admin-issued модель; admin
  управляет только mode и общим access profile.
- Dev migration `l2m3n4o5p6q7` применена: 1 existing user, 1 invite, 0 users without a code.
- Полный результат: migration gate green, Ruff green, 274/274 backend, frontend lint/typecheck,
  11/11 unit/build, 124/124 Playwright на четырёх проектах.
- Первый широкий browser run случайно переиспользовал текущий Vite с real debug env и тем самым
  доказал недостаточную test isolation. Playwright теперь принимает отдельный `PLAYWRIGHT_PORT` и
  всегда поднимает собственный server; повторный изолированный run полностью зелёный.
- Реальный create-user/referral не запускался, чтобы не создавать тестового пользователя в живой
  Remnawave. Tunnel проверен read-only: root/health 200, unauthenticated invite endpoint 401,
  актуальный invite locale asset 200.
