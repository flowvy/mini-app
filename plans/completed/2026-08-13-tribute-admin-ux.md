# Админский UX настройки Tribute

Status: completed
Owner: Codex
Started: 2026-08-13
Updated: 2026-08-13

## Purpose

Администратор Flowvy сможет понять возможности Tribute, пройти понятный сценарий подключения,
проверить server-side API key read-only запросом без реальных платежей и увидеть, какие платёжные сценарии
будут доступны: подписки, цифровые товары и донаты. На этом этапе реализуется и проверяется только
админский UX/UI, минимальная server-side read-only проверка и детерминированные smoke-тесты; приём
платежей, webhook и выдача доступа не входят в результат.

## Current state

- Ветка `dev` чистая и совпадает по рабочему дереву с `origin/dev` на старте задачи.
- Admin Settings уже имеет overview и вложенные маршруты Kuma, Beszel, Identity, Welcome и Access.
- Вложенные настройки используют общие `SettingsPanel`, `SettingsFields`, `SettingsStatusRow`,
  `FormField`, `FormSaveButton`, `InlineFeedback` и единый `settings.module.css`.
- Playwright перехватывает весь FastAPI boundary в `frontend/tests/e2e/fixtures/mock-api.ts` и
  отклоняет неизвестные запросы; это безопасная граница для smoke без Tribute credentials.
- Официальный Tribute API использует `Api-Key`, а webhook подписывает raw body заголовком
  `trbt-signature`. `GET /api/v1/products?page=1&size=1` является документированным read-only
  способом проверить API access. Документированный sandbox или test payment не найден.

## Scope

Входит:

- provider-ready информационная архитектура раздела платежей в Admin Settings;
- отдельный маршрут и экран настройки Tribute в текущей дизайн-системе;
- server-only `TRIBUTE_API_KEY`, safe credential-presence flag и read-only API check;
- понятное разделение секрета, будущего webhook setup и поддерживаемых сценариев;
- UX для missing/configured credential и API check loading/success/failure;
- детерминированные frontend fixtures, smoke/E2E и light/dark visual evidence;
- документация проверенного UI-контракта и явно отложенной backend-части.

Не входит:

- реальные запросы к Tribute, реальные API keys, реальные Telegram/Tribute аккаунты и платежи;
- persistence/ввод секрета через Mini App, webhook endpoint, signature/replay/idempotency и выдача доступа;
- каталог, создание, возврат или отмена реальных продуктов, подписок и донатов;
- пользовательский checkout UX.

## Acceptance

- Settings overview показывает отдельную платёжную секцию и статус Tribute без смешения с Pulse.
- Direct URL, Back/Forward и заголовок вложенного маршрута работают как у существующих Settings.
- Экран объясняет, где взять API key, не отображает сохранённый секрет, не публикует callback URL
  раньше готовности receiver и не обещает неподтверждённый sandbox.
- Администратор видит три поддерживаемые категории и их будущую роль в Flowvy без настройки одной и
  той же сущности в нескольких местах.
- API check доступен только при server-side credential, имеет loading/success/failure и не
  выполняет реальный provider call в детерминированных тестах.
- Webhook receiver явно отмечен как неготовый и UI не публикует ложный callback URL.
- Проверены 320x568, 430x932, 1280x900, light/dark, overflow, serious Axe, console и network guards.

## Approach

1. Зафиксировать официальный Tribute contract и UX-следствия, включая невозможность безопасно
   симулировать то, чего провайдер не документирует.
2. Проследить существующий Settings flow и выбрать минимальный переиспользуемый composition layer.
3. Добавить provider-neutral payment overview, Tribute nested route и минимальный BFF contract:
   credential presence плюс fixed-origin read-only API check с finite timeout и bounded response.
4. Расширить deterministic mock и focused Playwright cases для всех изменённых состояний.
5. Выполнить frontend и repository verification, визуально просмотреть evidence и закрыть план.

## Progress

- [x] 2026-08-13 — проверено чистое дерево `dev`; прочитаны корневые/frontend/e2e/docs правила,
  `PROJECT_STATE.md`, три применимых repo skills и UI state matrix.
- [x] 2026-08-13 — начато исследование официальной Tribute документации и существующей Settings
  архитектуры без внешних side effects.
- [x] 2026-08-13 — зафиксирован UI contract: server-only secret, read-only products API check,
  webhook receiver без ложной готовности, три capability rows без обещания Flowvy processing.
- [x] 2026-08-13 — реализованы админский Payments overview, nested Tribute flow и минимальный
  server-side status/test contract без payment mutations.
- [x] 2026-08-13 — добавлены deterministic backend transport tests, frontend smoke,
  error/accessibility/overflow coverage и visual evidence.
- [x] 2026-08-13 — пройдены Changed/Full gates и 244-case browser matrix; документы обновлены,
  plan завершён.

## Surprises & Discoveries

- В официальной Tribute документации не найден sandbox/test payment; UI называет `GET /products`
  проверку `API check`, а не тестовым платежом.
- Первоначально планировался frontend-only draft, но существующий mock PATCH принимает произвольные
  поля, которых нет в реальном BFF. Чтобы не создать ложный success, этап включает минимальный
  реальный BFF status/test contract без persistence и payment mutations.
- Первый all-project Playwright запуск с четырьмя workers дал один инфраструктурный
  `net::ERR_NO_BUFFER_SPACE` на существующем Pulse `page.goto`: 243/244 прошли. Тот же test прошёл
  4/4 изолированно, а свежий полный повтор с двумя workers завершился 244/244.

## Decision Log

- 2026-08-13 — отделить Payments от существующей секции Integrations/Pulse: выбор Pulse является
  взаимоисключающим источником мониторинга, а Tribute — платёжным провайдером с другим жизненным
  циклом и не должен попадать в тот же segmented control.
- 2026-08-13 — не выполнять реальные Tribute вызовы и не хранить ключ в UI-фазе; smoke проверяет
  BFF contract через mocked HTTP transport/Playwright interception. Реальный read-only test endpoint
  доступен оператору только после явной server-side настройки `TRIBUTE_API_KEY`.
- 2026-08-13 — не показывать webhook URL до появления аутентифицированного, replay-safe и
  idempotent receiver; экран показывает `Not available` и не предлагает настраивать Tribute раньше.

## Verification

- `E:\mini-app\frontend`: focused Tribute Playwright → 16/16 на четырёх проектах, без unknown
  requests, console/page errors и serious Axe findings.
- `E:\mini-app\backend`: focused Tribute/provider settings pytest → success, missing key,
  auth/non-2xx, timeout, transport error, oversized/malformed/schema drift покрыты fake transport
  без live Tribute.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5264; scripts/verify.ps1 -Scope Full` → exit code 0; migrations,
  Ruff, 328 backend tests, 53 Remnawave contract tests, frontend lint/typecheck, 33 unit tests,
  production build, 61 mobile E2E и docs прошли.
- `E:\mini-app\frontend`: `PLAYWRIGHT_PORT=5267; pnpm exec playwright test --workers=2` →
  244/244 на 430x932 mobile Chromium, 320x568 small-mobile Chromium, iPhone 13/WebKit и 1280x900
  desktop Chromium.
- UI: configured/missing-key, light/dark и desktop/mobile screenshots открыты и просмотрены;
  hierarchy, contrast, wrapping и fixed bottom chrome согласованы, horizontal overflow отсутствует.

## Recovery and rollback

Изменение не обращается к Tribute и не меняет данные. Любая проверка повторяется на фиксированном
mock boundary. Откат ограничивается новыми frontend route/components/types/fixtures/tests и
связанными locale/docs правками; предшествующие изменения пользователя не затрагиваются.

## Outcomes & Retrospective

Админ получает один честный provider-onboarding flow: ключ настраивается вне Mini App, API access
проверяется отдельным read-only действием, а три Tribute capability и будущий webhook lifecycle
видны без смешения со status monitoring. Общие Settings primitives и generic provider-test contract
переиспользованы вместо копий. Следующий этап обязан начать с webhook security/idempotency и
entitlement mapping; до этого UI намеренно не выдаёт callback URL и не заявляет payment readiness.
