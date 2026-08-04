# 0001: Пользовательские инвайты и профили доступа

Status: accepted
Date: 2026-08-02
Owners: Flowvy

## Context

Flowvy поддерживает открытую и invite-only регистрацию. После регистрации человек может получить
только локальный аккаунт либо пользователя Remnawave с заданными оператором сроком, трафиком,
устройствами, статусом, тегом и squads. Правило доступа должно быть одинаковым независимо от того,
пришёл человек сам или по приглашению.

Инвайтом делится зарегистрированный пользователь, а не администратор. Продукту нужны простой
Telegram-переход, ручной запасной путь и прозрачный счётчик прямых приглашений, но пока не нужны
награды, уровни, квоты или лидерборд.

Проверенные внешние контракты:

- Telegram Main Mini App настраивается через BotFather и открывается ссылкой
  `t.me/<bot>?startapp=<parameter>`. Payload приходит как signed `initData.start_param` и
  `tgWebAppStartParam`; при отсутствующей Main Mini App клиент обрабатывает ссылку как обычный bot
  username. Direct Mini App `t.me/<bot>/<short_name>?startapp=...` является другим продуктовым
  контрактом, а bot `?start=` требует отдельного нажатия Start:
  [Main Mini App](https://core.telegram.org/bots/webapps#launching-the-main-mini-app),
  [Telegram link contract](https://core.telegram.org/api/links#main-mini-app-links) и
  [bot links](https://core.telegram.org/api/links#bot-links).
- Raw Mini App `initData` должен проверяться на backend; `initDataUnsafe` и client launch params
  нельзя использовать для identity или attribution:
  [официальная проверка init data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
- Bot API `getMe` возвращает `has_main_web_app`, позволяя проверить capability до публикации ссылки:
  [Bot API User](https://core.telegram.org/bots/api#user).
- Telegram share URL открывает выбор чата и позволяет пользователю отредактировать текст перед
  отправкой: [официальный Sharing Button](https://core.telegram.org/widgets/share).
- Актуальный referral UX рекомендует держать вход и отправку простыми, показывать понятную обратную
  связь после копирования и видимый прогресс: [Voucherify, 2025](https://www.voucherify.io/blog/referral-programs-ux-and-ui-best-practices).
- Поля создания пользователя сверены по exact tags Remnawave
  [2.8.1](https://github.com/remnawave/backend/blob/2.8.1/libs/contract/commands/users/create-user.command.ts),
  [3.0.0](https://github.com/remnawave/backend/blob/3.0.0/libs/contract/commands/users/create-user.command.ts) и
  [3.1.0](https://github.com/remnawave/backend/blob/3.1.0/libs/contract/commands/users/create-user.command.ts).

## Decision

1. Telegram authentication, разрешение регистрации и чтение текущего пользователя разделены.
   Полностью неизвестный пользователь не создаётся побочным эффектом `GET /api/me`; exact
   Remnawave match по подписанному Telegram ID импортируется как уже существующий пользователь.
2. Singleton policy хранит режим `open`/`invite_only` и один optional default access profile.
   Администратор из `ADMIN_TELEGRAM_IDS` может bootstrap-иться без инвайта.
3. Каждый зарегистрированный пользователь получает ровно один постоянный случайный код. Код
   является публичным referral identifier, а не authentication secret, поэтому хранится в явном
   виде и показывается владельцу повторно.
4. Один код можно использовать много раз. При первой успешной регистрации в
   `users.invited_by_id` навсегда фиксируется непосредственный пригласивший; считаются только прямые
   регистрации. Повторный запрос того же Telegram identity не создаёт пользователя заново и не
   меняет attribution.
5. Flowvy использует один referral transport — Main Mini App
   `t.me/<bot>?startapp=ref_<compact-code>`. Backend выдаёт ссылку только после
   `getMe.has_main_web_app=true`; frontend не конструирует её из environment и не переключается на
   bot/Direct Mini App fallback. Auto-redeem endpoint не принимает code в body и извлекает его
   только из HMAC-проверенного `WebAppInitData.start_param`. Ручной ввод остаётся отдельным явным
   flow. Кнопка отправки использует официальный `t.me/share/url`, а копирование показывает краткое
   подтверждение.
6. Неактивный владелец не может приглашать. Отсутствующий код, выключенный код и код неактивного
   владельца дают одинаковую ошибку. Попытки ограничиваются по Telegram ID и fail closed при сбое
   Redis.
7. Access profile выбирает только оператор. Он одинаково применяется к open и invited registration;
   пригласивший не может назначить тариф. Отсутствующий профиль означает локальный аккаунт без
   Remnawave-доступа.
8. Профиль хранит status, traffic/reset strategy, срок, device limit, tag, description и squads.
   `duration`, `fixed` и `lifetime` преобразуются в точный create-user contract; lifetime означает
   `2099-12-31T23:59:59Z` из-за обязательного `expireAt`.
9. Регистрация сериализуется PostgreSQL advisory transaction lock по Telegram ID. Перед Remnawave
   create выполняется exact lookup по `telegramId`; после timeout выполняется bounded reconciliation
   lookup, чтобы не создать дубль.
10. В карточке владельца показываются код, copy/share и число приглашённых. В admin user detail
    показывается только число; отдельных admin endpoints для выпуска/списка/отзыва кодов нет.
11. Если локальной записи нет, Flowvy до invite/open policy выполняет exact read-only lookup по
    `telegramId`. Найденный Remnawave user получает только локальные user/invite/subscription rows:
    referral не учитывается, default access profile не применяется, provider user не создаётся и не
    изменяется. Ошибка или неоднозначность lookup закрывает регистрацию временной недоступностью,
    чтобы прежний пользователь не был ошибочно принят за нового.

## Alternatives

- Admin-generated одноразовые коды отвергнуты: это другой продукт и заставляет оператора вручную
  обслуживать каждое приглашение.
- Персональный профиль от пригласившего отвергнут: referral не должен незаметно менять тариф нового
  пользователя.
- Повторное применение default profile к существующему Remnawave user отвергнуто: оно могло бы
  затереть оплаченный либо вручную настроенный доступ. Для такой миграции потребуется отдельное
  явное admin-действие, если продукт решит его добавить.
- Многоуровневая сеть и награды отложены: сначала нужна проверенная прямая attribution без лишней
  игровой механики и fraud surface.
- Только код без ссылки отвергнут как лишний ручной шаг; только ссылка без кода — как плохой fallback
  при пересылке текстом или открытии не на том устройстве.

## Consequences

Код нельзя считать секретом и нельзя использовать как доказательство личности. Доступ всё равно
разрешает только подписанный Telegram initData или bot update. Удаление пользователя удаляет его код,
а `invited_by_id` у приглашённых становится `NULL`; исторический счётчик после такого удаления не
сохраняется. Если позже понадобятся выплаты или аудит lifetime referrals, потребуется отдельная
неудаляемая event/ledger model.

Forward migration после прежней незарелизенной схемы удаляет старые admin invite rows, выдаёт код
каждому существующему пользователю и добавляет self-reference attribution. Dev данные перед этим
проверены: старых invite rows не было.

## Verification

- PostgreSQL tests: один код на владельца, несколько приглашённых, direct count, inactive owner,
  rate limit, concurrent registration и provider timeout reconciliation.
- Bot tests: обычный `/start` не принимает referral payload, ручной ввод и стабильные безопасные
  ошибки.
- Backend auth tests: signed `start_param` auto-redeem без request body, missing/malformed payload и
  fail-closed Main Mini App capability.
- Browser tests: invite-only onboarding, server-confirmed `startapp` auto-redeem, Main Mini App
  share URL, состояние неподтверждённой capability, карточка владельца, copy, admin count,
  mobile/WebKit/desktop overflow и accessibility.
- Migration gate: zero-to-head, previous-head-to-head, downgrade/re-upgrade, single head и model drift.
