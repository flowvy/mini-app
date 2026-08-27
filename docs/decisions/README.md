# Архитектурные решения

Здесь хранятся решения, которые меняют устойчивую границу, безопасность, данные, внешний контракт
или эксплуатацию и которые нельзя восстановить только из кода. Текущая архитектура описана в
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

Принятые решения:

- [`0001-invite-registration-and-access-profiles.md`](0001-invite-registration-and-access-profiles.md) —
  пользовательские invites и единый registration access profile;
- [`0002-ui-copy-and-provider-owned-content.md`](0002-ui-copy-and-provider-owned-content.md) —
  граница locale, operator-owned content и provider data;
- [`0003-tribute-managed-checkout-and-entitlements.md`](0003-tribute-managed-checkout-and-entitlements.md) —
  accepted Creator sponsor offers/intents/billing state и восстановление базового доступа;
  недоступный Shop остаётся deferred upgrade;
- [`0004-desktop-color-parity.md`](0004-desktop-color-parity.md) — desktop-authoritative color
  values/roles, ограниченное Header/TabBar glass exception и честная фиксация contrast debt;
- [`0005-open-source-license-and-brand.md`](0005-open-source-license-and-brand.md) — AGPL-3.0-only для
  кода, отдельная защита бренда Flowvy и централизованная third-party attribution;
- [`0006-production-container-and-delivery.md`](0006-production-container-and-delivery.md) — единый
  production image, health-gated Compose, GHCR release и внешний HTTPS reverse proxy.

## Когда нужен ADR

- изменение auth/role/debug trust model;
- новая внешняя интеграция или смена provider contract;
- ownership данных, cache/failure strategy, migration/recovery policy;
- deployment/runtime topology или значимый framework/tooling выбор;
- решение с несколькими реалистичными альтернативами и долгим последствием.

Мелкая реализация остаётся в коде. Временный task plan создаётся только в Git-ignored `plans/`, а
после handoff удаляется; устойчивые решения переносятся в ADR.

## Формат

Имя: `NNNN-short-title.md`. Номер монотонный; статус — `proposed`, `accepted`, `superseded` или
`rejected`.

```markdown
# NNNN: Короткое решение

Status: proposed
Date: YYYY-MM-DD
Owners: ...

## Context
Проверенные факты, ограничения и проблема.

## Decision
Что именно выбирается и где проходит граница.

## Alternatives
Рассмотренные варианты и причина отказа.

## Consequences
Положительные, отрицательные, security/operations/migration последствия.

## Verification and rollout
Как доказать решение, внедрить, наблюдать и откатить.
```

При замене решения не переписывайте историю: создайте новый ADR и свяжите оба файла.
