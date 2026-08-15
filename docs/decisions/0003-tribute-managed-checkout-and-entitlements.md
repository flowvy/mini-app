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
   signed `expires_at`. Access profile может использовать `automation` validity: тогда он хранит
   только benefits, а срок всегда предоставляет правило и не маскируется фиктивными днями/датой.
3. User-facing `sponsor_offer` хранит presentation отдельно от rule. Subscription destination
   сохраняется по exact subscription ID; donation offer хранит собственную destination, exact
   amount, one-time/recurring mode и recurring period.
4. `POST /api/me/sponsor/checkouts` создаёт только expiring local redirect intent с immutable
   snapshot. Он не создаёт и не подтверждает provider payment.
5. Только аутентифицированный matching webhook может подтвердить checkout. Browser return и refresh
   лишь перечитывают local state.
6. Webhook записывает bounded normalized inbox metadata и durable entitlement decision в одной DB
   transaction. Внешний Remnawave HTTP выполняет отдельный durable worker.
7. Subscription idempotency строится на exact item, user и absolute expiry. Donation automation
   использует normalized fingerprint только после полного checkout/rule match; anonymous donation
   всегда review.
8. Любое иное корректно подписанное event name сохраняется как `ignored` audit metadata без checkout
   matching, entitlement planning или provider mutation.
9. Перед первым paid overlay сохраняется base state. После окончания последнего paid term scheduled
   restore возвращает base profile либо отключает account, созданный только платёжным grant.
10. Home показывает только доказанное server state: choose, pending, provisioning, review,
    one-time active, recurring donation, subscription active/expired. Неизвестные provider billing
    состояния не угадываются.
11. Пользовательская copy использует configured app name; фиксированное Flowvy допустимо только в
    admin UI.
12. Одна Tribute subscription соответствует одному rule и одному опубликованному offer. Offer
    показывает все catalog periods/prices до перехода как нейтральные платёжные факты, не создаёт
    локальные названия plan/period и не подделывает недокументированный `periodId` URL-предвыбор:
    окончательный выбор выполняется в Tribute.
13. Operator-authored offer description использует ограниченный CommonMark content contract и общий
    safe renderer. HTML и Telegram MarkdownV2 не являются storage format; будущий Broadcast
    переиспользует editor/renderer и получает отдельную server-side Telegram serialization boundary.
14. Authoring использует pinned Tiptap 3.30.1 inline WYSIWYG и один официальный fixed-menu pattern:
    toolbar постоянно расположен над editor surface во всех input modes. Приложение не пытается
    расширить или заменить системный selection popup и не использует pointer-dependent contextual
    menus. Toolbar следует WAI-ARIA semantics и keyboard navigation. Beta Markdown bridge не определяет storage schema: он обслуживает
    только ограниченный, покрытый regression tests CommonMark subset; БД продолжает хранить строку.

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
- Rule toggle управляет автоматизацией будущих платежей; offer toggle независимо управляет только
  публичной видимостью способа оплаты.
