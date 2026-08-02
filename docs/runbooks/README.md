# Runbooks

Runbook — проверенная пошаговая процедура для повторяемой эксплуатации или инцидента. Сейчас Flowvy
не имеет production deployment, monitoring, backup/restore или on-call, поэтому **production
runbooks отсутствуют**. Не превращайте предположение в инструкцию, способную изменить реальные
данные.

Перед production понадобятся как минимум:

- deploy/rollback совместимой версии;
- database migration rollout и failure recovery;
- PostgreSQL backup + проверенный restore;
- Redis loss/degraded mode;
- Telegram webhook rotation/outage;
- Remnawave/Kuma outage и credential rotation;
- suspected token leak/user-impacting security incident;
- queue/broadcast stop и повтор без дубликатов, если Broadcast будет реализован.

## Шаблон

```markdown
# <Наблюдаемый симптом или операция>

Last tested: YYYY-MM-DD in <environment>
Owner: ...
Risk: low | medium | high

## Preconditions and authorization
Какая среда, backup, доступ и явное разрешение нужны.

## Diagnose
Read-only сигналы и способ отличить похожие причины.

## Procedure
Нумерованные команды с working directory, exact target и ожидаемым результатом.

## Stop conditions
Когда немедленно остановиться и не продолжать автоматически.

## Verify
Как доказать восстановление без опасного side effect.

## Rollback / recovery
Проверенный обратный путь и влияние на данные.

## Evidence
Ссылка на тест/инцидент/ADR, где процедура реально выполнялась.
```

Каждый runbook сначала проверяется на disposable/test environment. Secrets и реальные payloads в Git
не записываются.
