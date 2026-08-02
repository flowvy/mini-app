# Безопасность Flowvy

Flowvy управляет подписками, HWID-устройствами и административными действиями. Критичный
debug/auth/device/Telegram-webhook контур закрыт 2026-08-01 и покрыт regression tests, но MVP **не
прошёл полный production security hardening**. Оставшиеся подтверждённые проблемы перечислены в
[`PROJECT_STATE.md`](PROJECT_STATE.md).

## Чувствительные данные

- Telegram bot token, raw `initData`, webhook secrets и provider API tokens;
- Telegram IDs/usernames, Remnawave UUID, email, connection/subscription URLs;
- HWID, webhook payloads, admin actions, media `file_id` и runtime logs.

Не выводите их в terminal/tool output, Git, планы, screenshots, test artifacts или публичные ошибки.
В examples используйте только явно фиктивные `.example.test`, `000000:TEST` и synthetic IDs.

## Trust model

- Frontend и Telegram-supplied fields недоверенные. Backend обязан проверять signature, TTL, текущего
  user, active state и актуальные права; current-code gaps перечислены в `PROJECT_STATE.md`.
- Admin mode/route не даёт полномочий. Каждая admin operation авторизуется server-side непосредственно
  перед side effect.
- Provider UUID из локальной БД — cache связи, не вечное доказательство ownership.
- Redis не является источником ролей. Его сбой не должен разрешать доступ и по возможности не должен
  ломать уже проверенный read request.
- Ответы Remnawave/Kuma/Beszel и webhook payloads — недоверенный внешний ввод: schema, size,
  timeout, SSRF, replay, retention и safe logging проверяются явно.

## Обязательные инварианты

- Пустой или отсутствующий `BOT_TOKEN`/webhook secret останавливает защищённый flow; никакой пустой
  ключ не используется для HMAC.
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
- Upload ограничивается при streaming, до полного чтения в память; type/size проверяются server-side.
- Unknown provider status/enum обрабатывается безопасно, а не считается активным.
- Все внешние calls имеют finite timeout, bounded concurrency и безопасное error mapping.

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
