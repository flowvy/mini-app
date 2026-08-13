# Безопасность Flowvy

Flowvy управляет подписками, HWID-устройствами и административными действиями. Критичный
debug/auth/device/Telegram-webhook контур закрыт 2026-08-01 и покрыт regression tests, но MVP **не
прошёл полный production security hardening**. Оставшиеся подтверждённые проблемы перечислены в
[`PROJECT_STATE.md`](PROJECT_STATE.md).

## Чувствительные данные

- Telegram bot token, raw `initData`, webhook secrets и provider API tokens;
- Telegram IDs/usernames, Remnawave UUID, email, connection/subscription URLs и invite codes;
- HWID, webhook payloads, admin actions, media `file_id` и runtime logs.

Не выводите их в terminal/tool output, Git, планы, screenshots, test artifacts или публичные ошибки.
В examples используйте только явно фиктивные `.example.test`, `000000:TEST` и synthetic IDs.

## Trust model

- Frontend и Telegram-supplied fields недоверенные. Backend обязан проверять raw Mini App `initData`,
  signature, TTL, текущего user, active state и актуальные права; `initDataUnsafe`, URL query и
  client launch params не являются доказательством identity или referral attribution. Current-code
  gaps перечислены в `PROJECT_STATE.md`.
- Admin mode/route не даёт полномочий. Каждая admin operation авторизуется server-side непосредственно
  перед side effect.
- Provider UUID из локальной БД — cache связи, не вечное доказательство ownership.
- Redis не является источником ролей. Его сбой не должен разрешать доступ и по возможности не должен
  ломать уже проверенный read request.
- Ответы Remnawave/Kuma/Beszel/Tribute и webhook payloads — недоверенный внешний ввод: schema, size,
  timeout, SSRF, replay, retention и safe logging проверяются явно.

## Обязательные инварианты

- Пустой `BOT_TOKEN` останавливает Telegram-auth. Если задан `WEBHOOK_URL`, непустой валидный webhook
  secret обязателен; polling-режим не притворяется webhook и не использует пустой ключ для HMAC.
- `DEBUG=false` — безопасный default. Debug routers не регистрируются либо недостижимы вне явно
  изолированного localhost, даже при ошибке environment.
- Admin dependency проверяет текущий список разрешённых ID/роль и `is_active`; отзыв применяется без
  обязательного предварительного `/api/me`.
- Device mutation заново сопоставляет authenticated Telegram user и provider user/устройство.
- Telegram и Remnawave webhooks проверяют secret/signature, freshness и replay/idempotency.
- Kuma/Beszel URL не дают доступ к loopback, link-local, metadata и внутренним сетям. Redirects и
  DNS rebinding учитываются в выбранной защите; private origin допускается только точным
  operator-controlled allow-list entry.
- Beszel credential хранится только в server environment; frontend/БД получают лишь URL и признак
  наличия credential. Интеграция использует отдельного пользователя с ролью `readonly`.
- Tribute API key хранится только в server environment; frontend получает лишь признак наличия.
  Read-only check использует fixed HTTPS origin, не следует redirects, не доверяет proxy environment,
  ограничивает тело и не возвращает upstream body. Тот же key по контракту Tribute подписывает
  webhook, поэтому будущий receiver нельзя включать без отдельной replay/idempotency и rotation
  модели; текущий UI не публикует callback URL.
- Commerce-rule CRUD требует актуального active admin и повторно проверяет active access profile
  перед каждым save. Draft preview не пишет БД и не вызывает provider/user mutations. Money приходит
  и хранится как bounded integer minor units; bands, currency, commerce/payment shape, duration и
  priority schema-validated, а calculator JSONB никогда не принимается напрямую в ORM.
- Сохранённое правило не является разрешением выдать доступ: webhook receiver/executor отсутствует.
  Будущий executor должен отдельно аутентифицировать raw event, reconcile identity, сделать
  idempotent ledger write и только затем применить snapshot rule/profile.
- Upload ограничивается при streaming, до полного чтения в память; type/size проверяются server-side.
- Unknown provider status/enum обрабатывается безопасно, а не считается активным.
- Все внешние calls имеют finite timeout, bounded concurrency и безопасное error mapping.
- Invite code создаётся CSPRNG и принадлежит зарегистрированному пользователю. Это публичный
  многоразовый referral identifier, а не credential: он хранится в БД и может показываться владельцу,
  но никогда не заменяет проверку Telegram initData/update.
- Автоматическое применение invite разрешено только из `WebAppInitData.start_param`, полученного
  после HMAC-проверки raw `initData`; endpoint не принимает launch code в request body. Main Mini
  App referral URL выдаётся только после Bot API `getMe.has_main_web_app=true`. Ошибка проверки или
  ненастроенная capability закрывает share flow без fallback на другой тип Telegram-ссылки.
- Отсутствующий/выключенный code и code неактивного владельца дают один ответ, чтобы API не раскрывал
  состояние аккаунта. Попытки ограничены Redis; сбой лимитера закрывает новую регистрацию.
- Регистрация сериализуется PostgreSQL advisory lock по Telegram ID. Remnawave grant берётся из
  общей server-side policy, а неизвестный результат provider timeout сначала reconciled exact lookup.

## Локальная разработка

`VITE_MOCK_AUTH=true` и `DEBUG=true` допустимы только на изолированном localhost с fake/mock API.
Обычный Vite dev server не публикуется. `tunnel-up.ps1` собирает frontend с same-origin `/api`,
принудительно выключенным mock auth и отказывается запускаться, если debug endpoint не даёт `404`.
`.env` игнорируется Git, но это не разрешение читать или копировать его содержимое.

## Перед production

Минимально требуются: закрытие всех P0, regression tests auth/debug/ownership/webhooks, secrets
management/rotation, CORS/host/TLS policy, CSRF/replay analysis применимых endpoints, SSRF defense,
PII retention/redaction, admin audit log, rate/size limits, dependency scan, readiness probes,
backup/restore test и независимый security review. Production deployment до этого документом не
разрешается.

При обнаружении уязвимости не проверяйте её на реальных users. Зафиксируйте минимальную локальную
reproduction с synthetic data, impact, затронутый trust boundary и безопасный regression test; затем
обновите `PROJECT_STATE.md` после подтверждения.
