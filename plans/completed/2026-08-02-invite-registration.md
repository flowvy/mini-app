# Инвайты и управляемая регистрация в Flowvy

Status: completed
Owner: Codex
Started: 2026-08-02
Updated: 2026-08-02

## Purpose

Flowvy сможет работать в открытом или invite-only режиме. Новый Telegram-пользователь до создания
локальной учётной записи увидит понятный onboarding, сможет активировать одноразовый инвайт в боте
или Mini App и, если политика регистрации это предусматривает, атомарно получить пользователя в
Remnawave с выбранными администратором ограничениями. Та же политика выдачи доступа будет применима
к открытой регистрации без инвайта.

## Starting state

- `GET /api/me` сейчас автоматически создаёт любого Telegram-пользователя после валидной проверки
  `initData`; режима регистрации и состояния onboarding нет.
- `/start` всегда отправляет общий welcome template и не проверяет локального пользователя.
- Таблица `invites` и минимальный `InviteRepository` существуют, но поддерживают только plaintext
  code и один `used_by_id`; API, сервисного слоя и интерфейса управления нет.
- Flowvy читает и изменяет существующих пользователей Remnawave, но ещё не создаёт их.
- Локальная `subscriptions` связывает Telegram user с числовым Remnawave ID и optional legacy UUID.
- Поддерживаются Remnawave 2.7/2.8 и 3.0/3.1, поэтому create-user contract должен быть
  version-aware и покрыт exact-version fixtures.

## Scope

В задачу входят исследование официальных Remnawave контрактов и актуальных практик инвайтов,
настраиваемый режим регистрации, шаблоны выдаваемого доступа, безопасная генерация/активация
инвайтов, создание Remnawave user, bot/Mini App onboarding, admin UI, миграции, тесты и документация.

Не входят платежи, продление уже выданного доступа, полноценная реферальная программа, Broadcast и
Support. Автоматическое удаление Remnawave user при откате локальной транзакции не выполняется без
доказанного идемпотентного provider contract; вместо этого нужен безопасный reconciliation path.

## Acceptance

- Admin может выбрать `open` или `invite_only`; admin из `ADMIN_TELEGRAM_IDS` не блокируется
  собственным invite-only режимом.
- Неизвестный пользователь не создаётся побочным эффектом `GET /api/me` до успешной регистрации.
- В invite-only режиме бот и Mini App предлагают ввести код; неверные, истёкшие, выключенные и уже
  использованные коды дают стабильный безопасный ответ и не меняют данные.
- Один код нельзя успешно активировать двумя конкурентными запросами.
- Admin создаёт и отзывает коды и выбирает для регистрации отсутствие provider-доступа либо шаблон
  доступа Remnawave.
- Шаблон способен выразить бессрочный/временный доступ, unlimited/limited traffic, device limit,
  traffic strategy, tag, description и поддерживаемые Remnawave squads после проверки exact API.
- Успешная регистрация создаёт локального пользователя, при необходимости создаёт Remnawave user и
  сохраняет его identity; повтор запроса не создаёт дубль.
- Секретный код не попадает в логи, URL, browser storage или повторные API-ответы.
- Миграции, backend contract tests, frontend checks и детерминированные browser scenarios проходят.

## Approach

1. Проследить текущие auth/invite/subscription/admin/bot потоки и зафиксировать точные create-user
   contracts Remnawave 2.8.1, 3.0.0 и 3.1.0 из official source/OpenAPI.
2. Зафиксировать product/domain решение: registration mode, reusable access profiles, single-use
   invite lifecycle, Telegram identity mapping, retry/reconciliation и операторские ограничения.
3. Добавить обратимую Alembic migration, ORM/repositories и атомарный registration service.
4. Расширить version-aware Remnawave client и deterministic contract fixtures без real mutations.
5. Добавить public onboarding API, admin API и bot flow; затем Mini App/admin UI с TanStack Query.
6. После каждого этапа выполнять узкие проверки; перед завершением — полный gate и UI verification.

## Progress

- [x] 2026-08-02 13:51 +03:00 — проверены исходный invite model/repository, auto-create `/api/me`,
  `/start`, локальная subscription identity и отсутствие invite API/UI.
- [x] 2026-08-02 14:15 +03:00 — exact 2.8.1/3.0.0/3.1.0 create-user/squad contracts сверены с
  official tags; изучены OWASP, GitHub и Discourse invite practices.
- [x] 2026-08-02 14:15 +03:00 — доменная модель, security boundary, lifetime mapping и
  reconciliation зафиксированы в `docs/decisions/0001-invite-registration-and-access-profiles.md`.
- [x] 2026-08-02 14:25 +03:00 — реализованы migration, schema/repository/service, public/admin API,
  version-neutral Remnawave create-user и deterministic tests.
- [x] 2026-08-02 14:38 +03:00 — реализованы bot/Mini App onboarding, admin profiles/invites,
  one-time code display, revoke/deactivate confirmation и Query cache handoff без reload.
- [x] 2026-08-02 14:47 +03:00 — полный gate и browser matrix пройдены, каноническая документация и
  ADR обновлены.

## Surprises & Discoveries

- Существующая таблица `invites` выглядит как ранний seed: она связывает один code с одним user, но
  не защищает code at rest, не содержит атомарного consume и не задаёт выдаваемый доступ.
- Текущий read endpoint `/api/me` одновременно аутентифицирует и создаёт пользователя; invite gate
  требует разделить проверку Telegram identity и разрешение на регистрацию.
- Remnawave требует `expireAt` даже для unlimited service user; официальный guide использует 2099.
- Remnawave не делает `telegramId` unique, зато `username` unique. Idempotency должна опираться на
  локальную сериализацию, `tg_<telegram_id>` и reconciliation lookup, а не на upstream constraint.
- 3.0 удалил user UUID, но create-user product fields в exact 3.0.0 и 3.1.0 совпадают с 2.8.1 за
  исключением legacy optional `uuid` и изменённой identity response.

## Decision Log

- 2026-08-02 — сохраняем поддержку Remnawave 2.8 и 3.0/3.1; реализация не будет зависеть только от
  установленной 2.8.1 панели.
- 2026-08-02 — provider mutations проверяются fake transport/official fixtures; реальный Remnawave
  не изменяется автоматическими тестами.
- 2026-08-02 — принята ADR 0001: single-use hashed invites, reusable access profiles со snapshot,
  explicit open/invite-only policy и local-only registration без профиля.

## Verification

- `E:\mini-app\backend`: focused pytest для invite/registration/Remnawave routes и repositories.
- `E:\mini-app`: `scripts/verify-migrations.ps1` → zero-to-head, downgrade/re-upgrade, один head и
  отсутствие model drift.
- `E:\mini-app\frontend`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `E:\mini-app\frontend`: Playwright onboarding/admin invite scenarios на mobile light/dark,
  включая direct URL, reload, keyboard, invalid/expired/used/concurrent states и unexpected errors.
- `E:\mini-app`: `scripts/verify.ps1 -Scope Full` перед финальным handoff.

## Recovery and rollback

Миграция сохраняет существующих users/invites и имеет явный downgrade. Переключение режима обратно
в `open` немедленно снимает gate для новых регистраций. Отзыв invite/profile запрещает новые
активации, но не удаляет уже созданных users. Provider creation использует детерминированную identity
и reconciliation, чтобы повтор после частичного сбоя не создавал второй Remnawave account.

## Outcomes & Retrospective

Flowvy теперь разделяет Telegram authentication и регистрацию. Обычный пользователь не создаётся
чтением `/api/me`; open и invite-only paths используют одну атомарную registration service. Access
profile выражает local-only, временный, fixed или lifetime Remnawave grant со всеми релевантными
access fields, а invite хранит immutable snapshot.

Секретные коды CSPRNG, одноразовые и expiring; БД хранит только digest/hint. Concurrent consume
сериализован PostgreSQL locks, brute-force ограничен Redis fail-closed, provider timeout проходит
reconciliation. Admin управляет политикой, профилями, squads и пакетами codes в отдельном mobile
экране; бот и Mini App имеют согласованный onboarding.

Свежая проверка: 274 backend tests, disposable migration upgrade/downgrade/re-upgrade/model drift,
36 Remnawave contract tests, frontend lint/typecheck/11 unit/build, 30 mobile smoke и 120/120 browser
matrix. Реальный create-user намеренно не вызывался: live mutation оставлена для отдельного ручного
dev-invite владельца.
