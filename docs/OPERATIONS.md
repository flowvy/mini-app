# Эксплуатация Flowvy

В репозитории есть воспроизводимая локальная разработка, validation CI и production container/Compose
для самостоятельной установки. Пошаговая серверная инструкция находится в
[`DEPLOYMENT.md`](DEPLOYMENT.md). Контейнерный путь не доказывает готовность MVP к публичной нагрузке:
требования безопасности находятся в [`SECURITY.md`](SECURITY.md), а незавершённые операции — в конце
этого документа.

## Localhost-only lifecycle

После создания безопасного `backend/.env`:

```powershell
./scripts/bootstrap.ps1 -InstallBrowsers
./scripts/dev-up.ps1
./scripts/dev-down.ps1
```

`dev-up` проверяет ports `8001`/`5173`, поднимает PostgreSQL/Redis, принудительно использует Compose
URL вместо случайных process-level `DATABASE_URL`/`REDIS_URL`, применяет Alembic migrations,
запускает backend/frontend и ожидает API readiness/Vite. По умолчанию Telegram отключён для
запускаемых процессов. `-EnableTelegram` использует защищённый webhook при полной конфигурации либо
long polling при пустом `WEBHOOK_URL`; одновременно должен работать только один polling-процесс
test bot. PID и stdout/stderr находятся в `.artifacts/dev`. `dev-down` останавливает только
записанные process trees и Compose services, не удаляя `pgdata18`.
Lifecycle работает в PowerShell 7 на macOS и использует `pgrep` вместе с PID/start-time ownership
contract; неизвестный или переиспользованный PID останавливать запрещено.

Это намеренно непубличный режим без Telegram. На машине владельца запрос **полноценного** или
**штатного** Flowvy dev означает named-Tunnel lifecycle из раздела
[Cloudflare Tunnel](#cloudflare-tunnel), с `-EnableTelegram` и `https://dev-app.flowvy.io`.

Не удаляйте process file вручную, пока процессы живы. Не используйте `docker compose down -v` как
обычное исправление: volume содержит локальные данные и удаляется необратимо.

Для явно запрошенного чистого dev-сценария используйте только
`./scripts/dev-reset-data.ps1 -ConfirmDevDataReset` после `dev-down`. Script очищает application schema
в database `flowvy` и Redis DB 0, повторно применяет migrations, сбрасывает singleton settings к
defaults и сохраняет test database, Docker volume и все внешние provider data. Ручной
`DROP DATABASE`, `docker compose down -v` и очистка provider не являются частью dev lifecycle.

## Проверка состояния

- `GET /api/health` подтверждает только liveness FastAPI и не обращается к зависимостям.
- `GET /api/ready` параллельно проверяет `SELECT 1` в PostgreSQL и Redis `PING` с двухсекундными
  timeout. Возвращает только `ok/error` по компонентам, без внутренних адресов/ошибок. `dev-up`
  ждёт именно этот route; Remnawave/Kuma/Beszel намеренно не входят в базовую readiness приложения.
- `docker compose -f docker-compose.dev.yml ps` показывает dev infrastructure.
- `.artifacts/dev/backend.stderr.log` и соседние logs — первая локальная диагностика, но в них не
  должны попадать secrets/payloads.
- `scripts/verify.ps1 -Scope Full` проверяет validation-контур; он не является runtime monitor.

## Миграции

Alembic загружает отдельный `MigrationSettings`, содержащий только `DATABASE_URL`, с тем же
приоритетом process environment → `backend/.env` → local default. Он не валидирует и не выводит
остальные application secrets. Перед ручной командой всё равно подтвердите точную target database. Локальный
`verify-migrations.ps1` создаёт случайную disposable БД, проверяет upgrade/downgrade/re-upgrade,
сохранение legacy Kuma-enabled настройки при переходе к Pulse provider selector и drift, затем
удаляет её; CI делает zero-to-head на ephemeral PostgreSQL.

## Tribute entitlement worker

Durable entitlement worker является обычной частью runtime и запускается вместе с приложением.
Автоматизацию будущих платежей включает и выключает enabled-тогл соответствующего commerce rule в
Mini App; published-тогл sponsor offer независимо управляет только видимостью payment choice на Home.
Identified donation планируется после полного checkout/rule match. Anonymous donation и любые
неоднозначные или несовпавшие payment facts всегда остаются review-only.

Для безопасной локальной проверки donation semantics из корня используется
`./scripts/verify-tribute-entitlements.ps1`. Команда работает только с disposable test PostgreSQL
и fake credentials, не читает runtime key и не выполняет внешние provider requests. Fixture
проверяет signed HTTP intake, dedupe, planner decisions, bands и review paths.

Параметры worker:

- `TRIBUTE_ENTITLEMENT_WORKER_INTERVAL_SECONDS` — пауза пустой очереди, default 10 секунд;
- `TRIBUTE_ENTITLEMENT_LEASE_SECONDS` — после этого interrupted `processing` возвращается в retry,
  default 120 секунд;
- `TRIBUTE_ENTITLEMENT_MAX_ATTEMPTS` — предел transient provider attempts, default 5.
- `SPONSOR_CHECKOUT_PENDING_MINUTES` — срок одного локального redirect intent, default 30 минут,
  допустимый диапазон 5–180. Это не provider payment timeout и не доказательство оплаты.

Admin может сохранять sponsor offer как hidden draft. Publish доступен только при enabled commerce
rule, active access profile и валидном Creator destination/catalog item. Home никогда не читает
draft и не вызывает Tribute catalog; published offer использует frozen snapshot. Для одной Tribute
subscription публикуется один offer со всеми period/price из catalog.

Минимальный controlled rollout:

1. Создать в Tribute subscription либо donation destination; donation использовать автоматически
   только при принятом identity/fingerprint риске.
2. Сохранить destination, создать и preview automation rule, затем создать hidden sponsor offer.
3. Прогнать `verify-tribute-entitlements.ps1`, migration verifier и browser matrix.
4. Только по отдельному разрешению опубликовать один offer на test target и выполнить одну реальную
   оплату тем же Telegram account. Redirect сам по себе не успех: должны
   появиться authenticated inbox event, одна operation, confirmed checkout и applied access.
5. Проверить duplicate delivery, exact expiry, cancellation и base restoration до расширения
   rollout. Не создавать второй payment, пока Home показывает pending/provisioning/review.

Creator contract не документирует failed-charge/retry или next-charge state. Их нельзя выводить из
таймера checkout либо отсутствия webhook.

Остановка/перезапуск процесса не удаляет очередь. Stale lease возвращается в retry, а сохранённый
absolute target позволяет сначала reconciliate provider state и не повторять уже применённое
продление. Для временной остановки side effects выключают gate и штатно перезапускают backend;
pending/retry/review history сохраняется. Ledger вручную не редактируют. В Admin → Settings →
Tribute → Payment activity backend предлагает только допустимые решения:

- первый paid grant для active local user без Remnawave link выполняет exact Telegram lookup и
  создаёт provider user только при доказанном miss; create timeout повторно проверяется чтением;
- перед первым paid mutation создаётся один `entitlement_baselines` snapshot. Его нельзя править
  вручную: scheduled `effective_access_restore` использует его для полного возврата base profile;
- pending paid grant/refund блокирует due restore того же user. Новый applied paid state отменяет
  предыдущую scheduled restore и ставит новую на актуальный paid expiry;
- `provider_state_not_restorable`, `baseline_missing` и `provider_state_conflict` требуют
  расследования; автоматический overwrite в этих состояниях не выполняется.

- `Retry` существует только для исчерпавшего автоматические попытки `provider_unavailable`. Он
  ставит ту же idempotent operation в очередь, не сбрасывает счётчик попыток и при выключенном gate
  остаётся queued без Remnawave mutation;
- `Resolve` требует понятную заметку и закрывает review без изменения доступа. Это не ручной grant,
  revoke или подтверждение provider state.

Каждый submit содержит новый client request UUID. UI повторяет тот же UUID после неопределённой
HTTP-ошибки, backend блокирует operation и сохраняет одну append-only action с actor и previous
state. После первой real baseline/restore записи или operator action соответствующий migration
downgrade намеренно прекращается, чтобы не потерять effective-access либо audit history. Включение
worker на production-like target требует отдельной проверки
backup/rollback, одного контролируемого donation/subscription сценария и наблюдения журнала;
текущий MVP не имеет готового production rollout runbook.

## Cloudflare R2 для Support attachments

R2 optional: без него Support сохраняет text requests/replies, а attachment picker показывает
`Not configured`. Credentials не вводятся в Mini App и не хранятся в PostgreSQL. Admin route
`/admin/settings/support` служит инструкцией/status surface и выполняет только read-only access
check.

Первичная настройка выполняется оператором вне Flowvy:

1. В Cloudflare Dashboard открыть **R2 Object Storage** и создать private Standard bucket. Не
   включать `r2.dev` и public custom domain. Имя: 3–63 lowercase letters/numbers/hyphens, без hyphen
   в начале/конце.
2. Создать S3 API credential с **Object Read & Write**, ограниченный только этим bucket. Account-wide
   token не нужен.
3. В bucket settings добавить CORS только для exact Mini App origin. Для текущего dev origin:

```json
[
  {
    "AllowedOrigins": ["https://dev-app.flowvy.io"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "x-amz-checksum-sha256"],
    "MaxAgeSeconds": 3600
  }
]
```

Для другого deployment заменяется только origin; wildcard запрещён. `GET` не нужен для текущего
browser contract: Mini App получает authenticated one-minute download URL и открывает его как file
navigation. `HEAD`/`DELETE` выполняет backend через S3 endpoint.

4. Сохранить credentials только в server secret environment и перезапустить Flowvy:

```dotenv
R2_ACCOUNT_ID=<32-character-account-id>
R2_BUCKET_NAME=<private-bucket-name>
R2_ACCESS_KEY_ID=<bucket-scoped-access-key-id>
R2_SECRET_ACCESS_KEY=<bucket-scoped-secret-access-key>
```

Все четыре значения должны появиться или исчезнуть атомарно: partial configuration останавливает
startup. Limits и retention описаны в `backend/.env.example`; default — 5 files, 50 MiB каждый,
100 MiB combined, pending intent 1 час, attachments 3 дня после текущего Resolve, conversation 90
дней после activity.

После restart открыть Admin → Settings → Support attachments: status должен быть `Configured`,
bucket name — точным, `Check access` — successful. Затем controlled test user загружает небольшой
TXT, создаёт request, owner/admin скачивают его, Resolve/Reopen проверяет сохранение до cleanup.
Этот smoke создаёт реальный billable R2 object и требует отдельного разрешения. Signed URLs и
credentials нельзя копировать в logs/screenshots. При provider outage cleanup оставляет DB reference
и повторяется позже; вручную удалять DB rows раньше objects запрещено. R2 lifecycle не заменяет
resolved-at worker, потому что считает возраст object.

## Cloudflare Tunnel

`scripts/tunnel-up.ps1 -ConfirmPublic` принимает только backend с недоступными debug routes,
собирает frontend без mock auth, запускает preview на `127.0.0.1:4173` и отдельный Quick Tunnel.
`scripts/tunnel-down.ps1` останавливает только сохранённые PID; установленная системная служба
`cloudflared` не изменяется. Quick Tunnel — только временный dev/test канал без SLA. Официальные
ограничения: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

На машине с WARP локальное имя `trycloudflare.com` может разрешаться в `198.18.0.0/15` и не замыкаться
назад через TLS. `scripts/verify-tunnel.ps1` обходит только эту локальную петлю через внешний DNS для
проверки публичного edge.

Для заранее созданного named Tunnel published application route должен указывать exact test
hostname на `http://localhost:4173`. Repository поднимает только безопасную production-сборку и не
управляет connector/DNS/route:

```powershell
./scripts/dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://<test-host>'
```

Текущий hostname Flowvy на машине владельца — `https://dev-app.flowvy.io`. Поэтому канонический
полноценный запуск здесь использует exact URL, а не placeholder:

```powershell
./scripts/dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://dev-app.flowvy.io'
```

Полный preflight перечислен в
[`DEV_ENVIRONMENT.md`](DEV_ENVIRONMENT.md#штатный-flowvy-dev-контур).

Команда передаёт тот же origin backend как `WEBAPP_URL`, разрешает Vite только этот hostname,
проверяет public root и `/api/health`. `dev-down` останавливает repo-owned preview, но не системный
`cloudflared`. Public hostname/BotFather URL и Cloudflare Service URL `http://localhost:4173`
остаются внешней явной конфигурацией. Контракт повторно сверён 2026-08-21 с
[Cloudflare published application routes](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/)
и [Vite `server.allowedHosts`](https://vite.dev/config/server-options#server-allowedhosts); глобальный
`allowedHosts: true` запрещён.

## Telegram Main Mini App для referral testing

Flowvy использует Main Mini App, а не bot deep link и не Direct Mini App. Для точного test bot
откройте `@BotFather` → `/mybots` → нужный bot → **Bot Settings** → **Configure Mini App** →
**Enable Mini App**, затем сохраните постоянный HTTPS URL именованного Tunnel. Это точный путь из
официальной Telegram Mini Apps documentation. Quick Tunnel для настройки не подходит: его hostname
меняется, а Telegram хранит URL в конфигурации бота.

После изменения BotFather-конфигурации перезапустите Telegram-enabled backend:

```powershell
./scripts/dev-down.ps1
./scripts/dev-up.ps1 -SkipInstall -EnableTelegram `
    -NamedTunnelUrl 'https://<test-host>'
```

На startup backend выполняет Bot API `getMe`. Только событие `telegram_main_app_ready` означает,
что `GET /api/me/invite` может выдать `t.me/<bot>?startapp=...`. События
`telegram_main_app_not_configured` и `telegram_main_app_capability_unavailable` означают, что ссылка
намеренно скрыта; не заменяйте её `?start=` или `/<short_name>` без отдельного изменения продуктового
контракта. Проверяйте новый link новым Telegram account: Telegram должен открыть Mini App, а backend
получить invite из подписанного `initData.start_param`. В logs нельзя искать или печатать сам payload,
Telegram ID либо token.

Downgrade, очистка volume и production migration требуют отдельного плана, backup и явного
разрешения. Проверенного restore procedure пока нет.

## CI и артефакты

GitHub Actions выполняет backend/frontend validation на pull request и push в `dev`/`main`. Browser failure
artifacts сохраняются как `playwright-artifacts`; локальные `test-results`, `playwright-report`,
coverage и `.artifacts` игнорируются Git. После этих gates job `Production container` собирает image
без публикации и запускает disposable Compose smoke: migration, PostgreSQL/Redis readiness,
same-origin frontend/API и отсутствие debug routes. CI ничего не deploy-ит и не использует реальные
Telegram/provider credentials.

## Ветки и релизы

- `dev` — единственная рабочая ветка: текущая разработка коммитится и пушится прямо в неё.
- `main` — только релизное состояние. Обычная разработка напрямую туда не отправляется.
- Отдельные task/feature/agent-ветки не создаются без явного изменения этого правила пользователем.
- Перед релизом состояние `dev` проходит свежую полную проверку и требуемую сборку. После переноса в
  `main` создаётся и публикуется согласованный version tag; имя/версия тега не придумываются
  автоматически.

Release version использует bare SemVer без префикса `v`: stable `X.Y.Z`, prerelease
`X.Y.Z-(alpha|beta|rc|pre).N`. До подготовки exact version должен назвать владелец или активный
release plan. Английский [`CHANGELOG.md`](../CHANGELOG.md) и русский
[`CHANGELOG.ru.md`](../CHANGELOG.ru.md) содержат одинаковые version/date/categories/item counts;
GitHub Release получает exact English section. Changelog описывает user-visible net delta от
предыдущего stable release, не внутренний журнал commit.

Подготовка выполняется на `dev` без tag и внешней публикации:

```powershell
$releaseVersion = '<agreed-version>'

# Сначала заполнить обе секции: ## X.Y.Z — YYYY-MM-DD
uv version $releaseVersion --project backend --no-sync
Push-Location frontend
pnpm version $releaseVersion --no-git-tag-version
Pop-Location

./scripts/release.ps1 -Version $releaseVersion
./scripts/verify.ps1 -Scope Full
```

`uv` синхронно обновляет `backend/pyproject.toml` и `backend/uv.lock`; PEP 440 нормализует
prerelease (`X.Y.Z-beta.N` становится `X.Y.ZbN`). `frontend/package.json` хранит исходный SemVer.
`scripts/release.ps1` учитывает это различие, проверяет оба manifests, lockfile, exact changelog
sections, реальные даты, допустимый порядок категорий и отсутствие рассинхронизированных пунктов.

После review/commit/push `dev`, зелёного CI и отдельного разрешения состояние переносится в `main`.
Нужно дождаться зелёного CI на exact `main` SHA. Создание и push согласованного annotated tag —
необратимая граница автоматической публикации и требует action-time подтверждения:

```powershell
git tag -a $releaseVersion -m "Flowvy $releaseVersion"
git push origin $releaseVersion
```

`.github/workflows/release.yml` повторно fail-closed проверяет metadata, принадлежность tagged commit
ветке `main` и successful `main` CI для того же SHA. Затем job с `packages: write` публикует
`ghcr.io/flowvy/mini-app` для `linux/amd64` и `linux/arm64`: exact SemVer и `major.minor` tags создаются
для каждого выпуска, а `latest` — только для stable. После успешной публикации image workflow
выполняет `gh release create --verify-tag`; prerelease не становится `Latest`.

Механизм не deploy-ит приложение, не подключается к серверу, не запускает production migrations и не
обращается к Telegram/provider. После workflow нужно вручную сверить tag/SHA, image tags/digest,
package visibility, title, prerelease/latest state, notes и source archives, затем записать
run/release evidence в [`PROJECT_STATE.md`](PROJECT_STATE.md). Failed tag/release нельзя перемещать,
удалять или переиспользовать без нового решения владельца. Публикация container до создания GitHub
Release не является транзакцией: если финальный шаг упал, неизменяемый tag image остаётся evidence
того же Git tag и workflow нужно расследовать, а не перезаписывать версию.

GitHub contract повторно сверён 2026-08-26 с официальными
[workflow tag filters](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore),
[`GITHUB_TOKEN` permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token),
[`gh release create`](https://cli.github.com/manual/gh_release_create) и
[immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).
Repository-level release immutability является отдельной GitHub setting и этим workflow не
включается.

Container publication contract повторно сверён 2026-08-27 с официальными
[GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
и [Docker multi-platform build](https://docs.docker.com/build/ci/github-actions/multi-platform/).
Visibility GHCR package проверяется отдельно от repository visibility.

## Что остаётся незавершённым для production

- реальный reverse proxy/TLS rollout, secret store/rotation и проверка anonymous GHCR pull;
- включённая repository-level release immutability;
- production platform wiring для liveness/readiness и monitoring/alerting;
- structured log redaction, tracing и retention;
- PostgreSQL/Redis backup, проверенный restore, disaster recovery и rollback;
- migration rollout/compatibility strategy;
- capacity/rate/timeout budgets и Remnawave/Kuma/Beszel outage policy;
- реальные incident runbooks и ownership/on-call;
- controlled acceptance с настоящими Telegram, Remnawave и выбранными optional integrations.

Compose installation теперь воспроизводима, но публичный rollout всё ещё требует осознанного принятия
этих рисков, backup и внешней проверки. Архитектурное решение хранится в
[`decisions/0006-production-container-and-delivery.md`](decisions/0006-production-container-and-delivery.md).
