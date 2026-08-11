# Нормализованный и локализуемый статус пользователя Remnawave

Status: completed
Owner: Codex
Started: 2026-08-08
Updated: 2026-08-08

## Purpose

Flowvy должен принимать официальный статус пользователя из Remnawave как машинный enum, не
показывать сырой provider-текст, локализовать подпись с учётом UI-контекста и безопасно вести себя,
если будущая версия Remnawave вернёт неизвестное значение.

## Current state

- Официальный Remnawave backend `2.8.1` фиксирует `USERS_STATUS` как `ACTIVE`, `DISABLED`,
  `LIMITED`, `EXPIRED`:
  <https://github.com/remnawave/backend/blob/2.8.1/libs/contract/constants/users/status/status.constant.ts>.
  Контракт повторно просмотрен 2026-08-08; exact tag зафиксирован в `docs/INTEGRATIONS.md` как
  commit `ba51868149362d0b9ac0e23133d0532176ccb5a2`.
- `backend/src/flowvy/schemas/remnawave.py` и BFF response-схемы принимают статус как произвольный
  `str`; admin list дополнительно читает сырой словарь provider response.
- `frontend/src/types/subscription.ts` считает wire status закрытым union без runtime fallback.
  `StatusBadge` выбирает CSS и locale-key прямым `Record` lookup, поэтому неизвестное runtime
  значение не имеет определённого отображения.
- Один и тот же английский текст статуса повторяется в badge, admin dashboard и users filter, но
  будущий русский перевод требует разных грамматических контекстов: подписка, один пользователь и
  множество пользователей.

## Scope

Входит:

- единый backend-тип официального provider enum и нормализованный BFF enum с `UNKNOWN`;
- проверка admin user list/detail и subscription response до выхода из BFF;
- единый frontend status type, безопасный badge и запрет enable/disable при `UNKNOWN`;
- контекстные locale keys и удаление сырого uppercase-текста из access-profile select;
- детерминированные backend/frontend/browser regression-тесты и актуализация интеграционной
  документации/состояния проекта.

Не входит:

- добавление полной русской locale;
- изменение статусов в Remnawave или live-вызовы панели;
- миграция локальной БД: существующий `subscriptions.status` остаётся внутренним lifecycle enum.

## Acceptance

- Все четыре официальных значения проходят BFF без изменения машинного кода.
- Любое отсутствующее, нестроковое или неизвестное provider-значение становится стабильным
  `UNKNOWN`; сырой текст не попадает во frontend.
- Home и admin UI показывают локализуемый `Unknown status`; неизвестный статус не предлагает
  enable/disable mutation.
- Badge использует разные ключи для subscription и single-user контекста; plural dashboard/filter
  labels остаются отдельным контекстом.
- Access profile отправляет только четыре официальных значения, а select показывает locale labels.
- Focused tests, frontend lint/type/unit/build и соответствующий deterministic Playwright сценарий
  проходят свежо; финальный changed-scope gate проходит либо точная причина блокировки зафиксирована.

## Approach

1. Зафиксировать общий provider/BFF status contract и нормализатор на backend.
2. Перевести subscription и admin user responses на типизированные модели; убрать raw admin-user
   mapping.
3. Централизовать frontend types/constants, добавить контекстный badge/fallback и безопасные actions.
4. Добавить contract/unit/E2E coverage, затем обновить канонические документы по фактическому
   результату.
5. Выполнить focused проверки, Flowvy UI verification и change-aware final gate.

## Progress

- [x] 2026-08-08 02:23 +03:00 — проверены текущий end-to-end flow, официальный enum Remnawave
  `2.8.1`, дубли locale и отсутствие unknown fallback.
- [x] 2026-08-08 02:30 +03:00 — backend сохраняет official enum, нормализует неизвестное значение,
  типизирует admin pagination и dashboard counters; 65 focused tests прошли.
- [x] 2026-08-08 02:31 +03:00 — frontend получил общий runtime enum, контекстные locale keys,
  neutral badge, локализованный access select и отсутствие enable/disable для `UNKNOWN`; unit,
  typecheck и focused mobile Playwright прошли.
- [x] 2026-08-08 02:36 +03:00 — browser matrix и `Changed` gate прошли; 12 light/dark
  screenshots просмотрены, документы обновлены, план закрыт.

## Surprises & Discoveries

- Admin list обходит `RemnawaveUserData`: `RemnawaveClient.get_users()` возвращает raw dictionaries,
  а `AdminUsersService` подставляет отсутствующий status как `ACTIVE`. Это не только i18n-дубль, но
  и fail-open contract default.
- Локальный repository намеренно сворачивает `LIMITED` в active lifecycle и неизвестное значение в
  suspended; этот внутренний индекс не должен заменять фактический provider status в BFF response.
- Dashboard `statusCounts` также был открытым `dict[str, int]`; он включён в ту же normalization
  boundary, чтобы будущий provider key не расходился с закрытым frontend type.

## Decision Log

- 2026-08-08 — provider enum и BFF display enum разделяются: outbound create/access-profile
  принимает только четыре официальных значения, inbound response дополнительно допускает только
  нормализованный `UNKNOWN`.
- 2026-08-08 — неизвестный status не вызывает provider mutation и не раскрывается как сырой текст;
  UI остаётся read-only относительно enable/disable, но остальные явно выбранные admin actions не
  скрываются.
- 2026-08-08 — одинаковые английские слова не считаются автоматически одинаковым translation
  context. Badge subscription/user и plural dashboard/filter могут иметь разные русские формы.

## Verification

- `E:\mini-app\backend`: Ruff format/lint и 65 focused Remnawave/subscription/admin/dashboard
  tests прошли; предупреждения только от upstream `pytest-asyncio` для будущего Python 3.16.
- `E:\mini-app\frontend`: Biome, TypeScript, 29/29 unit tests и production build прошли;
  Vite повторяет известное предупреждение о main chunk больше 500 kB.
- `E:\mini-app\frontend`: 9/9 focused Playwright scenarios прошли на 320x568, 430x932 и
  1280x900. Home/admin detail просмотрены в light/dark по 12 свежим screenshots; нет status-action,
  overflow, console/network и serious/critical Axe regressions.
- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Changed` прошёл: Ruff, 263 service-free backend
  tests (`49 deselected` DB-dependent tests), frontend install/lint/type/unit/build, 45/45 mobile
  Chromium scenarios и локальные Markdown links.

## Recovery and rollback

Изменение не выполняет live-вызовы и не меняет данные. Откат — обычный reverse patch файлов contract,
frontend mapping/tests/docs. Если обнаружится дополнительный официальный статус, сначала обновляется
source evidence и provider enum, затем BFF/frontend contract; неизвестный raw текст не разрешается
как временный обход.

## Outcomes & Retrospective

Remnawave остаётся единственным источником машинного status: Flowvy не вычисляет `ACTIVE`,
`LIMITED`, `DISABLED` или `EXPIRED`, а только проверяет официальный enum на BFF boundary. Четыре
известных значения проходят без изменения; отсутствующее, malformed или будущее значение безопасно
сворачивается в BFF-only `UNKNOWN`. Admin list больше не обходит provider schema, dashboard
агрегирует неизвестные counters, frontend использует контекстные locale keys и не предлагает
enable/disable mutation, пока статус неизвестен. Live Remnawave не вызывался и данные не менялись.
