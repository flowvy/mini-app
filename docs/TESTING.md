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

`tests/conftest.py` автоматически маркирует тесты с fixtures `engine` или `session` как
`integration`. Они используют отдельную PostgreSQL database/user `test:test`; SQLite не является
заменой. Remnawave, Kuma, Beszel, Tribute, Telegram, clock и transport должны быть fake/mock.

Kuma/Beszel tests подменяют resolver и HTTPX transport, проверяя pinned IP/Host/SNI без сети.
Beszel fixtures фиксируют v0.18.7 auth/systems/system_stats contracts, pagination limits,
credential isolation и 1m/20m Pulse mapping. Tribute fixtures проверяют fixed-origin read-only
products request, server-only key, auth/non-2xx, timeout, oversized/malformed/schema-drift response
без сети. Отдельный Tribute webhook suite строит HMAC локальным placeholder key и проверяет
fail-closed missing key/signature, content type, raw/declared size, strict envelope, timestamp window,
malformed normalized fields, отдельный authenticated `test_event` ping без persistence, safe
schema-shape diagnostics без values, ignored unknown event, exact replay, конкурентный DB duplicate
и retention без raw payload/signature/username или внешних side effects. Commerce fixtures отдельно
проверяют conditional rule validation, active-profile gate,
CRUD, no-match/fixed/volume preview и целочисленные 500/1000/3500/4000 RUB boundaries без webhook
или access side effect. Media tests сканируют ложный declared size и действительно читают aiogram `InputFile`
chunks. Remnawave tests
используют locked 2.8.1/3.0.0/3.1.0 response fixtures: проверяют выбор route/body, metadata version,
cursor stream, UUID-less 3.x user, `204`, ownership и safe future-major failure. Они отдельно
доказывают, что upstream body/extra dashboard fields не проходят в BFF. Ни один из этих suites не
должен использовать значения из `.env`.

Текущие fixtures создают таблицы через `Base.metadata.create_all()`, поэтому pytest сам по себе не
доказывает Alembic chain. `scripts/verify-migrations.ps1` создаёт случайно названную disposable БД,
проверяет один head, zero-to-head, downgrade-to-base, previous-head upgrade с legacy data, повторный
upgrade и `alembic check`, затем удаляет БД в `finally`. Fixture отдельно доказывает webhook
delivery-key backfill, удаление legacy raw payload, timezone conversion, создание уникального
числового Remnawave identity, сохранность старого nullable UUID и перенос старого `kuma_enabled` в
новый Pulse provider selector с обратимым downgrade.

## Frontend unit

Из `frontend/`:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Vitest настроен на `tests/unit/**/*.test.ts` в Node environment. Текущий seed проверяет decisions в
`src/lib/format.ts`, same-origin API path, `204 No Content` и безопасное отображение JSON/HTML ошибок.
Component DOM tests пока отсутствуют. Для новой логики
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
commerce-rule empty/create/edit/toggle/delete/save failure, fixed/volume preview/no-match,
раскрытие focused input внутри visual viewport, непрерывный touch-editing lifecycle при закрытии
клавиатуры, loading spinner без SVG backing box, light-mode axe, overflow и визуальные evidence
screenshots.

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
