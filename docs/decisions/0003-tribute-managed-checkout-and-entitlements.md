# 0003: Tribute Creator checkout и источник sponsor-доступа

Status: Accepted
Date: 2026-08-15

## Context

Flowvy должен показывать пользовательские варианты поддержки, принимать подписанные Tribute
webhooks и безопасно выдавать временный Remnawave-доступ. Creator API не создаёт платёж из Flowvy:
он предоставляет подписки для read-only catalog, а оплата завершается по provider-hosted ссылке.
Donation link не фиксирует сумму, режим или период, и отдельный donation payment не имеет
документированного уникального transaction ID.

Redirect либо возврат пользователя в Mini App не являются доказательством оплаты. Provider mutation
не должна выполняться внутри webhook HTTP request. Admission остаётся отдельной границей: платёжный
flow доступен только уже существующему active Flowvy user.

## Decision

1. Поддерживаем только donation и subscription commerce types.
2. Admin создаёт provider-neutral `commerce_rule`, который связывает signed payment facts с active
   access profile. Donation использует fixed/volume calculation; subscription использует absolute
   signed `expires_at`.
3. User-facing `sponsor_offer` хранит presentation отдельно от rule. Subscription destination
   сохраняется по exact subscription ID; donation offer хранит собственную destination, exact
   amount, one-time/recurring mode и recurring period.
4. `POST /api/me/sponsor/checkouts` создаёт только expiring local redirect intent с immutable
   snapshot. Он не создаёт и не подтверждает provider payment.
5. Только аутентифицированный matching webhook может подтвердить checkout. Browser return и refresh
   лишь перечитывают local state.
6. Webhook записывает bounded normalized inbox metadata и durable entitlement decision в одной DB
   transaction. Внешний Remnawave HTTP выполняет отдельный feature-gated worker.
7. Subscription idempotency строится на exact item, user и absolute expiry. Donation automation
   использует normalized fingerprint и отдельный default-off flag; anonymous donation всегда review.
8. Любое иное корректно подписанное event name сохраняется как `ignored` audit metadata без checkout
   matching, entitlement planning или provider mutation.
9. Перед первым paid overlay сохраняется base state. После окончания последнего paid term scheduled
   restore возвращает base profile либо отключает account, созданный только платёжным grant.
10. Home показывает только доказанное server state: choose, pending, provisioning, review,
    one-time active, recurring donation, subscription active/expired. Неизвестные provider billing
    состояния не угадываются.
11. Пользовательская copy использует configured app name; фиксированное Flowvy допустимо только в
    admin UI.

## Consequences

- Donation требует явной инструкции использовать тот же Telegram account и не скрывать имя.
- Несовпавшие amount/mode/period/item события не выдают доступ автоматически и переходят в review.
- Текущую subscription нельзя заменить вторым checkout до paid expiry; Home оставляет управление в
  Tribute и блокирует другие subscription offers до окончания периода.
- Отмена recurring donation отражается только после period-end webhook, как подтвердил Tribute
  support; до этого Flowvy правдиво показывает уже оплаченный срок.
- Creator contract не даёт failed-charge, retry или next-charge state, поэтому UI их не симулирует.

## Verification and rollout

- Contract tests покрывают fixed-origin API access, HMAC/freshness, strict schemas, duplicates,
  unsupported-event ignore, checkout matching, planner, executor, operator actions и base restore.
- `scripts/verify-tribute-entitlements.ps1` использует disposable PostgreSQL и fake providers.
- Playwright проверяет admin rules/offers/activity и Home states без реальных платежей.
- Runtime gates безопасно выключены по умолчанию; controlled enablement требует отдельного решения и
  проверки журнала.
