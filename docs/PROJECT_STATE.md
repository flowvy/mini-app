# Текущее состояние Flowvy

Последняя полная проверка: **2026-08-30**. Прошли exact-toolchain, lock и полный PostgreSQL 18
migration cycle, Ruff, `580` backend tests, `56` pinned integration contracts, frontend
lint/typecheck, `114` unit tests, production build и `254/254` mobile Chromium Playwright tests.
Отдельный production container smoke собрал non-root image, применил migrations в disposable
Compose, подтвердил healthy PostgreSQL/Redis/app, same-origin frontend/API и public debug `404` без
внешних credentials. Предыдущая полная browser matrix прошла `735/735` на трёх Chromium viewports и
`245/245` на iOS WebKit; Axe, overflow, console/network guards и visual evidence зелёные без retries,
suppression, allow-list или completion exception. GitHub Actions на `dev` commit `e4dfd26` полностью
прошёл 2026-08-27: Backend, Frontend и проверка контейнера зелёные
([run 33031388529](https://github.com/flowvy/mini-app/actions/runs/33031388529)). Container job собрал
временный образ с `push: false` и проверил изолированный Compose-контур; образ в GHCR не
публиковался.

Public release `0.1.0` опубликован 2026-08-30 из exact `main` commit
`dc99e5bdae0d0625953e85a3c07f1733d37c2ad2`. Exact-main CI зелёный
([run 33285710447](https://github.com/flowvy/mini-app/actions/runs/33285710447)), release workflow
успешно опубликовал GitHub Release и GHCR image
([run 33287435197](https://github.com/flowvy/mini-app/actions/runs/33287435197)). Repository и package
public; anonymous registry inspection подтверждает один digest
`sha256:04b2710dcba6d5d6809e7e7c6816f55c9bd7266fa8e5d3dffed6d6a0e0315d35` для тегов `0.1.0`,
`0.1` и `latest`, с runnable `linux/amd64` и `linux/arm64` manifests и provenance attestations.

Стадия: **незавершённый MVP; production readiness не подтверждена**.

Этот файл — короткий handoff текущих проверенных фактов и известных пробелов. Код, migrations,
lockfiles и executable configuration имеют приоритет. Исторические журналы проверок здесь не
хранятся.

## Реализовано и подтверждено локально

### Platform и trust boundaries

- FastAPI BFF владеет Telegram authentication, PostgreSQL/Redis state и обращениями к Remnawave,
  Uptime Kuma/Beszel, Tribute, Telegram Bot API и optional Cloudflare R2. React frontend обращается
  только к BFF.
- Telegram Mini App `initData` проверяется backend по signature, TTL, future timestamp и user data.
  Полностью неизвестный user не создаётся чтением `/api/me`; registration происходит явным
  open/invite flow либо безопасным импортом exact provider-only Remnawave match.
- Admin authorization требует одновременно active local user, сохранённую роль и актуальное
  присутствие Telegram ID в server configuration. Client mode и route не являются полномочием.
- Debug routers отсутствуют вне explicit local debug mode. Telegram и Remnawave webhooks используют
  secret/signature, freshness, bounded payload, replay/idempotency и safe persistence contracts.
- Device reads и mutations заново подтверждают ownership в Remnawave. External failures имеют
  bounded timeouts и не раскрывают upstream body, credentials или sensitive payloads.
- PostgreSQL schema имеет линейную reversible Alembic chain; Redis используется для cache, metrics,
  activity и bounded coordination, но не является источником auth/role truth.

### Пользовательские и административные потоки

- Universal Telegram `/start`, Main Mini App `startapp`, open/invite-only onboarding, reusable invite
  codes, prepared invite sharing, referral attribution и registration access profiles реализованы.
- Subscription, HWID devices и provider-neutral Pulse доступны пользователю. Admin управляет users,
  access profiles, Pulse provider, branding, localized content и Telegram Welcome configuration.
- Remnawave client сохраняет version-aware contracts для locked 2.8.1 и официальных 3.0.0/3.1.0
  shapes, numeric provider identity, bounded retry/reconciliation и fail-closed unknown-major
  behavior. Подробные версии и primary sources принадлежат [`INTEGRATIONS.md`](INTEGRATIONS.md).
- Tribute sponsor offers поддерживают donation/subscription rules, multiple billing periods,
  immutable checkout snapshots, exact tag exclusions, referral reward/discount benefits и local
  pending/provisioning/review/paid/base states. Redirect или browser return не доказывают оплату.
- Owner-controlled legacy import безопасно сопоставляет old-bot и Remnawave snapshots, регистрирует
  exact Telegram identities без provider mutation и для legacy BELIEVER создаёт explicit Flowvy
  access provenance, frozen FREE baseline и idempotent scheduled restore на provider expiry. Импорт
  dry-run-first, fail-closed при конфликте и не создаёт Tribute payment facts.
- Private production seed локально восстановлен и проверен: он сохраняет 47 exact legacy
  users/subscriptions, 9 BELIEVER restore chains, singleton settings, 3 access profiles, configured
  commerce rule/offer и 6 FAQ articles, но не содержит test checkouts, webhook/payment
  events, support activity, invites и dev metrics. Dump содержит PII и не является repository
  или GitHub Release artifact.
- Signed Tribute events проходят durable inbox/ledger/outbox pipeline. Provider mutation выполняет
  отдельный worker с frozen rule/profile state, reconciliation и base-access restoration;
  ambiguous/anonymous cases остаются review-only.
- Support реализует durable requests, conversations, reply-driven lifecycle, Quick Answers,
  role-aware admin queue, Telegram notifications и optional private R2 attachments. При вводе
  заголовка нового тикета отдельный authenticated endpoint предлагает до трёх локализованных FAQ:
  PostgreSQL FTS учитывает словоформы и веса полей, locale-owned поисковые фразы — формулировки
  юзеров, а `pg_trgm` — типичные однословные опечатки. Без R2 система остаётся явной text-only
  установкой; credentials и signed object operations server-only.
- Broadcast явно исключён владельцем из MVP scope 2026-08-26 и остаётся product-owned `Coming Soon`
  маршрутом для post-MVP разработки; отсутствие отправки рассылок не блокирует этот MVP release.

### Frontend и UX

- React/TanStack Router/Query приложение имеет user/admin routes, direct URL и Back/Forward behavior,
  loading/empty/denied/error/retry/mutation states и same-origin typed API boundary.
- Полные `en.json` и `ru.json` catalogs выбираются из Telegram `language_code` или browser preference
  с English fallback. Product copy отделён от typed operator/provider runtime data; key и placeholder
  parity проверяются автоматически.
- Telegram adapters используют поддерживаемые Main/Back button, Popup, prepared sharing, viewport и
  haptic contracts с browser fallbacks. IME, dirty-form, dialog focus-return и keyboard-aware TabBar
  behavior покрыты deterministic tests.
- Shared Desktop/Mini App semantic palette, responsive content contract, light/dark themes и
  accessibility matrix зелёные. ADR 0004 хранит прежний contrast ledger только как historical
  evidence и не разрешает исключений.
- Standalone controls и rich-text/Telegram HTML editor shells используют один muted secondary
  border contract; глобальный `text-size-adjust: 100%` сохраняет authored type scale при iOS WebKit
  text autosizing после изменений viewport, не добавляя JS keyboard/geometry behavior.
- CommonMark и Telegram HTML editors используют allow-listed serialization; raw HTML и unsafe links
  не проходят в user-visible render.

### Repository и verification

- Checked-in PowerShell 7 workflows поддерживают Apple Silicon macOS: locked bootstrap, safe dev
  lifecycle, migrations, changed/full verification, local data reset и Tunnel checks. GitHub Actions
  остаётся Linux-based CI runtime и не использует local lifecycle scripts.
- GitHub Actions выполняет backend gates и focused `@ci-smoke` browser subset на каждом push в
  `dev`/`main` и в pull requests. Полный Playwright suite и live Telegram/Swiftgram acceptance
  остаются отдельными local release gates.
- Production `Dockerfile` собирает один non-root image с frozen FastAPI backend и React frontend.
  Root Compose запускает PostgreSQL, непостоянный Redis, health-gated Alembic migration и один app на
  host loopback; `scripts/verify-container.ps1` подтверждает этот контур без внешних credentials.
  Короткая серверная установка и команда обновления описаны в [`DEPLOYMENT.md`](DEPLOYMENT.md),
  архитектура и эксплуатационные границы — в ADR 0006 и [`OPERATIONS.md`](OPERATIONS.md).
- Repository pins latest compatible stable stack: Python 3.14.7/uv 0.12.6,
  Node 24.19.0 LTS/pnpm 11.24.0, PostgreSQL 18.6 и Redis 8.10.1. Frontend и backend lockfiles
  являются executable source
  of truth для exact framework/library versions; preview/RC releases не используются.
- Documentation verification derives toolchain, infrastructure, and named library versions from
  version files, manifests, lockfiles, Compose, and CI; contradictory exact-version prose fails the
  docs gate instead of remaining a manual review concern.
- Root и scoped `AGENTS.md`, пять Flowvy skills, custom read-only agents, Codex config и command
  rules имеют отдельные responsibilities. Опасные Git/data commands остаются prompt/forbidden.
- Bare-SemVer tag release mechanism хранит synchronized English/Russian changelogs, проверяет
  frontend/Python versions и exact `main` CI, публикует multi-platform
  `ghcr.io/flowvy/mini-app` и затем создаёт GitHub Release. Stable release обновляет `latest`,
  prerelease — нет; workflow не подключается к серверу и не выполняет production migrations.
- Собственный код подготовлен к публикации под `AGPL-3.0-only`: root license, package metadata,
  отдельные Flowvy trademark rules и third-party notices зафиксированы ADR 0005. Коммерческий
  self-hosting разрешён, но изменённая сетевая версия должна предоставлять соответствующий source;
  AGPL не передаёт права на название, логотип и фирменные промоизображения Flowvy.
- Большие task plans являются только локальной Git-ignored памятью в `/plans`; после handoff их
  устойчивые результаты переносятся в canonical docs/instructions/ADR, а сами plans удаляются.
- Full responsibility review не подтвердил механические split для cohesive `support.module.css`,
  transactional commerce/sponsor editors и backend registration/entitlement/provider state
  machines: их current owners держат единый visual/state/security contract. Они остаются явным
  oversized baseline и не должны расти без повторного cohesion decision; tests выше mandatory
  threshold уже разделены.
- Production clone review не подтвердил массовый copy-paste. Повторения между authenticated/debug
  adapters, provider contracts и symmetric theme/CSS surfaces сохраняются там, где abstraction
  смешала бы security boundaries или скрыла protocol/visual symmetry.

## Не завершено или не доказано

### External и device evidence

- Live Remnawave 3.x и настроенные Kuma/Beszel environments не подтверждены текущим repository
  evidence. Locked deterministic contracts остаются локальным доказательством, не live acceptance.
- Tribute требуют внешнего события для period-end donation/subscription cancellation и renewal;
  приложение не должно синтезировать эти provider facts.
- Support Telegram notifications после deployment требуют controlled recipient/button acceptance.
  Любая отправка test-bot сообщений требует отдельного action-time разрешения.
- Keyboard-aware TabBar, native popup/editor lifecycle и IME actions требуют повторной acceptance в
  реальном Telegram iOS/Swiftgram WebView.

### Production readiness

- Container/Compose topology, loopback ingress, host allowlist, migration-before-app и GHCR delivery
  реализованы и проверены локально; anonymous package inspection после public release подтверждён.
  Не подтверждены реальный reverse proxy/TLS rollout, secret rotation, production
  observability/alerting, backup/restore rehearsal, capacity/load limits, on-call и incident
  runbooks.
- Не завершены независимый security review и production recovery test. Локальные `pip-audit`,
  `pnpm audit --prod`, Bandit и dependency/dead-code scans зелёные, но не заменяют внешний review.
- Локальный named Tunnel и dev R2 acceptance не являются доказательством production deployment.
- Repository и GHCR package публичны с 2026-08-30. Repository-level immutable releases механизмом
  не включаются и отдельно не подтверждены.

## Следующее действие

Развернуть exact release `0.1.0` на production host по [`DEPLOYMENT.md`](DEPLOYMENT.md), восстановить
проверенный private production seed до запуска пользовательского трафика и выполнить deployment
acceptance для reverse proxy/TLS, health и Telegram entrypoint. Broadcast остаётся post-MVP работой.
