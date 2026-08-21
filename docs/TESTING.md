# Проверка Flowvy

Цель проверок — воспроизводимо доказать изменённое поведение без реальных Telegram, Remnawave,
Kuma, Beszel и пользовательских данных. Последние фактические результаты находятся в
[`PROJECT_STATE.md`](PROJECT_STATE.md); здесь описан устойчивый процесс.

## Основная команда

Из корня репозитория:

```powershell
.\scripts\verify.ps1 -Scope Changed
.\scripts\verify.ps1 -Scope Backend
.\scripts\verify.ps1 -Scope Frontend
.\scripts\verify.ps1 -Scope Docs
.\scripts\verify.ps1 -Scope Full
```

Команды требуют PowerShell 7. На macOS замените префикс `.\scripts\` на `./scripts/`; scopes и
результаты одинаковы. Tooling/full gate дополнительно парсит все `.ps1` и проверяет Windows/macOS
port selection через `scripts/verify-tooling.ps1`.

`Changed` выбирает области по tracked/untracked diff. `Full` добавляет Compose services, Alembic,
полный pytest, Remnawave snapshot/client check и Playwright smoke. `-SkipE2E` допустим только когда
UI не менялся либо browser binary объективно недоступен; пропуск нужно указать в handoff.

## Backend

Из `backend/`:

```powershell
uv lock --check
uv run --frozen ruff format --check .
uv run --frozen ruff check .
uv run --frozen pytest -m "not integration" -q
uv run --frozen pytest -q
```

Узкий сквозной smoke Tribute запускается из корня и не использует реальные provider credentials:

```powershell
.\scripts\verify-tribute-entitlements.ps1
```

Команда поднимает только disposable PostgreSQL test service и запускает production-boundary
donation fixture. Он проводит через реальный FastAPI/inbox/planner boundary подписанные
`new_donation + once`, initial
`new_donation + monthly`, renewal `recurrent_donation + monthly`, exact duplicate, anonymous и
unknown-user события; он проверяет выбор one-time/recurring rule, amount bands и review outcomes.
Donation fixture включает planner flag только в process-local test environment, оставляет executor
выключенным и подтверждает отсутствие provider link/mutation. Реальные Tribute и Remnawave
endpoints не вызываются.

`tests/conftest.py` автоматически маркирует тесты с fixtures `engine` или `session` как
`integration`. Они используют отдельную PostgreSQL database/user `test:test`; SQLite не является
заменой. Remnawave, Kuma, Beszel, Tribute, Telegram, clock и transport должны быть fake/mock.

Kuma/Beszel tests подменяют resolver и HTTPX transport, проверяя pinned IP/Host/SNI без сети.
Beszel fixtures фиксируют v0.18.7 auth/systems/system_stats contracts, pagination limits,
credential isolation и 1m/20m Pulse mapping. Tribute fixtures проверяют fixed-origin read-only
subscriptions catalog, strict API `1.0.0` shapes, BFF allow-list,
server-only key, auth/non-2xx, timeout, oversized/malformed/schema-drift response без сети. Отдельный
provider-settings suite проверяет payment-destination HTTPS normalization, запрет
credentials/fragment, subscription ID bounds, clear/persist response и отсутствие Tribute/cache
side effect при сохранении. Отдельный
Tribute webhook suite строит HMAC локальным placeholder key и проверяет
fail-closed missing key/signature, content type, raw/declared size, strict envelope, timestamp window,
malformed normalized fields, typed documented event payloads, обязательный cancellation reason,
отдельный authenticated `test_event` ping без persistence, safe schema-shape diagnostics без values,
ignored unknown event, exact replay, конкурентный DB duplicate и retention без raw
payload/signature/username. Entitlement tests отдельно доказывают subscription absolute `expires_at`
state, safely matched identified-donation fingerprint, anonymous review, unknown-user fail closed,
rule/profile snapshots,
generic compensation/recovery semantics, first paid provider create,
base/lifetime overlay, full-profile/disabled restoration, paid-work priority над due restore,
per-user worker serialization, absolute-target reconciliation после timeout, explicit nullable
provider clears и отсутствие второго provider mutation.
Sponsor fixtures отдельно проверяют one-rule/one-offer contract со всеми subscription periods,
identified donation bands, exact one-time/recurring donation schedule и immutable checkout snapshot,
trial/cancellation exact expiry, review visibility поверх active access, provisioning priority,
повтор того же pending offer, conflict другого offer и idempotent abandon только своего pending
intent. PostgreSQL repository suite доказывает, что abandoned/`expired` intent остаётся доступен для
позднего matching signed event, а чужой checkout не изменяется. Она также доказывает, что
subscription подтверждает только matching signed user/family/item/mode event, а donation — только
bounded user/family/time/amount/currency/mode/provider-period match. Mismatch попадает в
review до planner grant, а подтверждённый checkout разрешает только linked offer rule. Provider `donation_request_id` не
сравнивается с opaque `startapp` destination; событие старше checkout, анонимность или неверная
сумма/валюта fail closed. Sponsor-state regression восстанавливает пропущенную checkout/event связь
только из уже applied operation и сохранённого authenticated event.
Operator-action tests дополнительно проверяют server-computed eligibility, обязательную bounded
resolve note, retry без сброса attempt history, повтор одного request UUID без второй audit row,
запрет reuse для другого решения и конкурентные retry/resolve под operation row lock. HTTP fixture
проверяет active-admin boundary, safe projection и `409` для stale action.
Commerce fixtures отдельно проверяют conditional rule validation, active-profile gate,
CRUD, атомарное удаление rule со всеми linked offers, authenticated admin boundary,
no-match/fixed/volume preview и целочисленные 500/1000/3500/4000 RUB boundaries без webhook или
access side effect. Browser regression дополнительно проверяет честное consequence confirmation,
client cache invalidation, retryable safe failure и light/dark contrast/overflow/Axe matrix. Media tests сканируют ложный declared size и действительно читают aiogram `InputFile`
chunks. Remnawave tests
используют locked 2.8.1/3.0.0/3.1.0 response fixtures: проверяют выбор route/body, metadata version,
cursor stream, UUID-less 3.x user, version-specific 2.8.1/3.1.0 update identity, absolute
`expireAt`, `204`, ownership и safe future-major failure. Они отдельно
доказывают, что upstream body/extra dashboard fields не проходят в BFF. Ни один из этих suites не
должен использовать значения из `.env`.

Registration/access-profile fixtures отдельно доказывают, что `automation` не хранит дни/дату,
принимается commerce/entitlement snapshots, не появляется среди registration defaults и fail-closed
отклоняется даже при повреждённой policy-ссылке. Browser matrix проверяет создание, summary,
отсутствие expiry inputs/default option и блокировку перевода текущего registration default.

Текущие fixtures создают таблицы через `Base.metadata.create_all()`, поэтому pytest сам по себе не
доказывает Alembic chain. `scripts/verify-migrations.ps1` создаёт случайно названную disposable БД,
проверяет один head, zero-to-head, downgrade-to-base, previous-head upgrade с legacy data, повторный
upgrade и `alembic check`, затем удаляет БД в `finally`. Fixture отдельно доказывает webhook
delivery-key backfill, удаление legacy raw payload, timezone conversion, создание уникального
числового Remnawave identity, сохранность старого nullable UUID и перенос старого `kuma_enabled` в
новый Pulse provider selector с обратимым downgrade. После каждого zero-to-head fixture выполняет
rollback-only реальные INSERT профиля `automation`, `sponsor_offers` и `sponsor_checkouts` без явных
ID, поэтому расхождение ORM и Alembic constraints/defaults не может пройти migration gate.
`test_sponsor_checkout_repository.py` отдельно выполняет published → draft переход на PostgreSQL и
проверяет, что nullable JSONB snapshot становится SQL `NULL`, а не JSON-скаляром `null`.

## Frontend unit

Из `frontend/`:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Vitest настроен на `tests/unit/**/*.test.{ts,tsx}` в Node environment. Текущий seed проверяет
decisions в `src/lib/format.ts`, same-origin API path, `204 No Content` и безопасное отображение
JSON/HTML ошибок. Formatted-text cases проверяют нормализацию допустимых http/https ссылок,
CommonMark semantic render и отказ от raw HTML/опасных URL через React server render.
Полноценные component DOM tests пока отсутствуют. Для новой логики
добавляйте success/boundary/error case и фиксируйте clock/locale, если они влияют на результат.

## Browser smoke

```powershell
pnpm test:e2e       # 430x932 Chromium
pnpm test:e2e:all   # primary, 320x568, iPhone/WebKit, desktop
pnpm test:e2e:live  # существующие dev-up frontend/backend и реальный read-only provider
```

Обычный Playwright suite запускает только Vite с `VITE_MOCK_AUTH=true`; stateful fixture перехватывает
каждый `/api/*` request. Неизвестный запрос, `console.error`, `pageerror` или network failure валит
тест. Матрица покрывает auth/role, loading/empty/error/malformed/retry, device mutation, Pulse,
dashboard/users/settings, выбор Kuma/Beszel, Tribute credential/API-check states без секретов,
commerce-rule empty/create/edit/toggle/delete/save failure, donation fixed/volume
preview/no-match, subscription provider-expiry без локального расчёта дней,
subscription catalog loading/select/empty/error/retry и сохранение legacy item ID,
payment destination loading/empty/error/retry/save/clear, unavailable subscription mapping,
local URL validation, dirty/discard, safe mutation failure и success,
admin sponsor-offer empty/draft/create, focusable missing-destination publish guard, сохранение
destination без reload и stable-code race fallback, donation amount/mode/frequency
controls, один постоянно видимый fixed toolbar и link validation во всех input modes, отсутствие
pointer-dependent app popup, немедленное WYSIWYG-форматирование, roving tab stop и
arrow/Home/End-навигацию toolbar, сохранение CommonMark source и тот
же semantic result на Home,
truthful предупреждение о том, что Creator link их не
фиксирует, Home no/base access, one-time
renewal, recurring active/cancelled, pending/provisioning/review duplicate-payment guard,
identified-donation exact amount/schedule/anonymity instructions и redirect-intent POST без
client-side payment proof,
pending check loading/unchanged result, локальный abandon dialog с focus return, success/failure и
немедленный возврат published offers без provider mutation,
pending donation → status check → one-time active transition, совместный sponsor/subscription
refetch, исчезновение stale pending controls, multi-type renewal chooser и neutral/active icon states,
payment-activity loading/empty/populated/error/retry и безопасные applied/review reason codes,
server-approved operator retry/resolve, обязательную resolution note, dialog cancel/focus,
mutation failure с повтором того же request UUID, success feedback и resolved/retry audit copy,
нативные input/IME semantics без synthetic blur, отсутствие application-owned viewport CSS
variables и неизменную shell/dialog geometry при visual viewport resize, loading spinner без SVG
backing box, Telegram-native Main-only editor actions с enabled/loading/cleanup bridge events,
отсутствие DOM replacement при недоступном client bridge, light-mode axe, overflow и визуальные
evidence screenshots.

`test:e2e:live` намеренно исключён из обычного/CI suite. Сначала запустите `scripts/dev-up.ps1`,
проверьте redacted target и только затем выполняйте его: сценарий читает Home, Devices, admin
dashboard/users/settings через настоящий BFF, но не нажимает изменяющие действия и не сохраняет
реальные данные в assertions/screenshots.

Для изменённого flow добавляйте соответствующие role, loading, empty, denied, timeout, malformed,
mutation success/failure состояния. Functional assertions и visual inspection — разные проверки;
screenshot baseline нельзя обновлять автоматически. Полная матрица описана в
`frontend/tests/e2e/AGENTS.md` и `.agents/skills/flowvy-ui-verify/references/state-matrix.md`.

Публичная граница Tunnel проверяется без реальных secrets/providers:

```powershell
.\scripts\verify-tunnel.ps1
```

Verifier запускает синтетический backend с `DEBUG=false`, production preview и отдельный Quick
Tunnel; затем через внешний DNS edge проверяет `health=200`, unauthenticated API `401`, debug/webhook
`404` и отсутствие выдачи исходного TypeScript. Все созданные процессы останавливаются в `finally`.

## CI

`.github/workflows/ci.yml` запускается на pull request и push в `main`:

- backend: locked Python 3.12 environment, PostgreSQL/Redis, Ruff, Alembic и pytest;
- frontend: Node 22/pnpm, Biome, TypeScript, Vitest, build и Chromium smoke;
- failure artifacts: Playwright traces/screenshots/video/report.

Workflow пока не заменяет локальную focused проверку и не подтверждает production deployment. Его
первый успешный удалённый run должен быть зафиксирован в `PROJECT_STATE.md`.

## Доказательство готовности

В handoff перечисляются свежие команды и результаты, протестированные маршруты/состояния/viewports,
console/network/accessibility/visual результат и каждый пропуск. Build без behavior test, mocked
success без error paths или старый CI result не считаются достаточным подтверждением.
