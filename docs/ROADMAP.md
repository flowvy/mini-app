# Дорожная карта Flowvy

Roadmap описывает порядок намерений, а не реализованные факты и не обещание срока. Текущий baseline и
риски всегда берутся из [`PROJECT_STATE.md`](PROJECT_STATE.md).

## 0. Репозиторий, который можно продолжить после паузы

Состояние: базовый контур создан 2026-08-01.

- root/nested `AGENTS.md`, `PROJECT_STATE.md`, временные local-only ExecPlans и разделённые
  source-of-truth docs;
- Flowvy-specific Codex skills/agents/rules;
- locked bootstrap/dev/verification scripts;
- validation CI, первый Vitest seed и mocked Playwright smoke.

Первый удалённый CI run подтверждён на `dev` 2026-08-26: backend gates и focused deterministic
Playwright smoke зелёные. Найденные tooling gaps должны исправляться как regression, без возврата
широких ручных инструкций.

## 1. Закрыть критический security-контур

Состояние: auth/debug/admin/device/Telegram webhook закрыты локально 2026-08-01; внешний independent
security review ещё не выполнен.

- закрыто: отказ Telegram-auth при пустом token и безопасный `DEBUG=false` default;
- закрыто: debug routers отсутствуют вне debug mode, публичный Tunnel smoke подтверждён;
- закрыто: немедленный отзыв admin, `is_active`, свежая ownership-проверка device mutations;
- закрыто: Telegram webhook secret/config/header;
- закрыто: Remnawave webhook freshness/replay/idempotency;
- закрыто: Kuma/Beszel SSRF, streaming upload, safe provider errors и contract tests;
- осталось: независимый review и production-конфигурация/наблюдаемость.

Критерий выхода: P0 из `PROJECT_STATE.md` закрыты кодом и свежими tests, независимый review не находит
auth bypass или публичный destructive debug path.

## 2. Надёжность данных и внешних контрактов

- previous-head/data compatibility migration tests и recovery decision;
- закрыто локально: webhook timezone/data retention, metrics middleware/collector и readiness;
- закрыто: legacy reference Remnawave 2.7.4, установленная dev-панель 2.8.1 и exact official
  2.8.1/3.0.0/3.1.0 contracts; version-aware client сохраняет 2.x/3.x compatibility, numeric identity
  и safe unknown-major behavior; Kuma 1.x/2.x и Beszel v0.18.7 contracts закрыты, live providers
  ждут URL/credential;
- bounded concurrency/timeouts/degraded behavior для Redis/providers.

Критерий выхода: full local gate и CI воспроизводят schema/contracts без реальных providers.

## 3. Полная матрица интерфейса

- закрыто: API-client unit tests и role/loading/empty/denied/error/malformed/mutation cases для
  критических user/admin routes;
- закрыто: light/dark, small mobile, Telegram-like, WebKit, desktop, keyboard/dialog focus и
  reviewed visual evidence;
- закрыто: shared Desktop/Mini App semantic palette исправила прежний `color-contrast` debt; Axe
  выполняется без suppression/allow-list, а strict-parity scans обязаны оставаться зелёными;
- осталось: component tests критических controls и реальный offline/browser-network pass;
- integrated suite с ephemeral FastAPI/PostgreSQL/Redis и fake Remnawave/Kuma/Beszel.

Критерий выхода: каждое заявленное пользовательское действие имеет deterministic success/failure
evidence, а UI smoke перестаёт быть только happy-path seed.

## 4. Завершить продуктовые потоки

Invite-only flow и профили начального Remnawave-доступа закрыты локально 2026-08-02: открытый/закрытый
режим, явный onboarding в боте и Mini App, постоянный код каждого пользователя, Telegram share/deep
link, direct referral count, local-only grant, срок/трафик/устройства/status/tag/description/squads
и deterministic UI/backend tests.

Support requests, Quick Answers, optional private R2 attachments, Telegram notifications и
Tribute sponsor checkout/entitlement flows закрыты кодом и deterministic tests. Для Tribute ещё
нужны перечисленные в `PROJECT_STATE.md` live lifecycle confirmations. Broadcast явно исключён
владельцем из MVP scope 2026-08-26 и остаётся post-MVP работой: перед реализацией ему понадобятся
аудит, preview, recipient scope, rate limits, retry/idempotency и safe cancellation. Не подключать
незавершённые модели только ради видимости прогресса.

## 5. Production readiness

Архитектура развёртывания, образ выпуска, применение миграций перед запуском приложения и инструкция
самостоятельной установки определены и проверены в изолированном Compose-контуре. Осталось
подтвердить реальное развёртывание обратного прокси/TLS, ротацию секретов, наблюдаемость, резервное
копирование и восстановление, восстановление после неудачной миграции, хранение данных, допустимую
нагрузку, дежурства и регламенты инцидентов. Провести проверку нагрузки, безопасности и
восстановления и только затем менять статус проекта с MVP. Текущие пробелы перечислены в
[`OPERATIONS.md`](OPERATIONS.md).
