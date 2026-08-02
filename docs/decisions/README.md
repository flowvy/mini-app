# Архитектурные решения

Здесь хранятся решения, которые меняют устойчивую границу, безопасность, данные, внешний контракт
или эксплуатацию и которые нельзя восстановить только из кода. Текущая архитектура описана в
[`../ARCHITECTURE.md`](../ARCHITECTURE.md); на момент создания каталога отдельных ADR ещё нет.

## Когда нужен ADR

- изменение auth/role/debug trust model;
- новая внешняя интеграция или смена provider contract;
- ownership данных, cache/failure strategy, migration/recovery policy;
- deployment/runtime topology или значимый framework/tooling выбор;
- решение с несколькими реалистичными альтернативами и долгим последствием.

Мелкая реализация и временный task plan остаются в коде/ExecPlan.

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
