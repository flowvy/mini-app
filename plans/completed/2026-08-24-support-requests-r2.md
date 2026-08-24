# Durable Support requests and optional R2 attachments

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-24

## Purpose

Turn the accepted Support request UI into a durable in-app conversation shared by the requesting
user and active administrators. Text requests work on every installation. When an operator supplies
a complete Cloudflare R2 server configuration, users and administrators can attach screenshots,
screen recordings, TXT and opaque ZIP files without routing their bytes through FastAPI.

## Current state

The branch now contains the accepted role-aware Support frontend, administrator-managed Quick
Answers, durable request/message/attachment persistence, optional R2 signing and cleanup, real
frontend upload/finalize calls and read-only admin storage settings. On 2026-08-24 the owner
authorized and completed the live provider setup: private Standard bucket `flowvy-support`, no
public URL or custom domain, exact-origin `PUT` CORS and an Object Read & Write account credential
limited to that bucket. Flowvy loaded the complete server-env configuration and its signed
`HEAD bucket` access check succeeded. A separately authorized controlled TXT smoke then passed exact
CORS preflight, presigned upload, checksum/type/size `HEAD`, presigned download and exact-object
deletion; the final `HEAD` returned `404`, so no smoke object remains.

Current Cloudflare documentation, accessed 2026-08-24, confirms that R2 is S3-compatible, private by
default, supports bucket-scoped Object Read & Write credentials, browser uploads through presigned
`PUT` URLs, SHA-256 upload checksums, CORS for browser access and lifecycle expiration. Presigned URLs
are bearer tokens and support one operation on one object, so Flowvy must issue short expiries and
server-generated opaque keys. Sources:

- https://developers.cloudflare.com/reference-architecture/diagrams/storage/storing-user-generated-content/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/tokens/
- https://developers.cloudflare.com/r2/buckets/cors/
- https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- https://developers.cloudflare.com/r2/pricing/

## Scope

In scope: PostgreSQL request/message/attachment-intent models; authenticated owner/admin read and
mutation routes; reply-driven reopen; Resolve/Reopen by both roles; safe request context snapshot;
optional R2 configuration and admin-visible status/test; direct checksum-bound presigned uploads;
authenticated short-lived admin download URLs; pending upload cleanup; attachment deletion three
days after resolution; whole-request deletion 90 days after last activity; frontend capability-aware
upload flow; deterministic fake-R2/backend/browser tests; migrations, docs and operational setup.

Out of scope: creating a live bucket/token without action-time owner approval, public R2 access,
Cloudflare Workers, antivirus/content inspection, ZIP extraction, archive password handling,
thumbnails/transcoding, Telegram notifications, administrator assignment/presence/locking and
collaborative-editing controls.

## Acceptance

- An authenticated user can create and read only their requests; an active administrator can read
  the shared queue and any request. Backend authorization is authoritative on every operation.
- Either role can resolve or reopen. A reply to a resolved request automatically reopens it; a user
  reply waits for support and an administrator reply waits for the user.
- Text-only requests and replies work when R2 is absent. Attachment controls explain that storage is
  unavailable, while forged upload-intent requests fail with a stable `503` code.
- R2 credentials stay in env and never enter PostgreSQL, API responses, logs or browser storage.
  The Mini App exposes only configured/available status, non-secret limits and a read-only check.
- Upload intents accept at most five files and only the agreed image/video/TXT/ZIP extensions and
  MIME contracts. Object keys are generated server-side; SHA-256, exact byte size and content type
  are bound to the upload and verified before attachment.
- ZIP remains opaque. Flowvy never reads, extracts, previews or scans file contents.
- Downloads require a freshly authorized owner or active administrator and return a short-lived
  single-object signed URL. The bucket remains private.
- Pending intents expire and are cleaned. Resolve schedules attachments for deletion after three
  days; reopen cancels a not-yet-executed schedule; requests and messages expire 90 days after last
  activity. Cleanup retries provider failures without deleting the only durable object reference.
- The existing Support UI, Quick Answers and accepted section order remain intact in configured and
  unconfigured installations.

## Approach

1. Fix the typed request/status/retention contract and create one linear Alembic revision after the
   new Support-article head.
2. Add R2 settings with all-or-none validation, a fixed account-derived endpoint and an async storage
   adapter that uses the locked AWS signer only for local URL generation and injected `httpx` for
   network I/O.
3. Implement repositories/services/routes with immediate owner/admin checks, atomic local state,
   provider error mapping and a bounded retention worker.
4. Replace multipart BFF uploads with upload-intent → direct signed PUT → JSON finalize, add
   capability/status UI and preserve text-only behavior.
5. Add PostgreSQL, auth, storage-failure, retention, frontend and four-project browser coverage;
   inspect light/dark mobile/desktop evidence and run migration/Changed/Full gates.

## Progress

- [x] 2026-08-24 — read current Support contracts, repository instructions and completed plans;
  verified the authenticated Cloudflare account read-only and current primary R2 documentation.
- [x] 2026-08-24 — implemented and focused-tested the PostgreSQL request/message/attachment boundary.
- [x] 2026-08-24 — implemented optional R2 signing, HEAD verification, download and deletion-before-
  DB-cleanup boundaries with fake provider tests.
- [x] 2026-08-24 — connected capability-aware direct uploads, text-only fallback and read-only admin
  R2 setup/status UI; focused mobile Chromium Playwright is 14/14.
- [x] 2026-08-24 — completed migration/backend/frontend/four-project UI verification, corrected
  the Support status color hierarchy and made the application scroll region keyboard-accessible in
  Safari; updated architecture, security, integration, operations and project-state documentation.
- [x] 2026-08-24 — with action-time owner approval, created the private Standard R2 bucket,
  exact-origin CORS and bucket-limited Object Read & Write credential; restarted standard Flowvy and
  confirmed the configured state with a successful signed `HEAD bucket` check.
- [x] 2026-08-24 — with separate owner approval, completed one controlled TXT CORS/PUT/HEAD/GET/
  DELETE smoke against live R2 and confirmed exact-object `404` after cleanup.

## Surprises & Discoveries

- Initial inspection found R2 entitlement active but no bucket. This made a first-class unconfigured
  state mandatory rather than a hypothetical fallback; the owner later configured the live dev
  deployment without changing that open-source fallback.
- Cloudflare explicitly recommends presigned direct uploads for user-generated content. Browser use
  also requires bucket CORS even when the URL signature is valid.
- R2 lifecycle expiry is based on object age, not a Flowvy request's `resolved_at`. Exact three-day
  post-resolution deletion therefore belongs to Flowvy's durable cleanup worker. A bucket lifecycle
  could only be an independently reviewed maximum-retention backstop, not this implementation.
- Boto3 includes `x-amz-checksum-mode` in the signed `HEAD` headers rather than the query string;
  the async transport must send that exact header or R2 rejects the signature.
- A long read-only settings page has no naturally focusable descendants. Axe correctly exposed that
  the app-owned overflow `main` was not keyboard-scrollable in Safari; the shell now gives the
  region a visible neutral focus state.

## Decision Log

- 2026-08-24 — text Support is independent of object storage; incomplete R2 configuration disables
  attachments but never disables request/message persistence.
- 2026-08-24 — R2 credentials and bucket identity are deployment secrets/configuration in env. The
  Mini App gets a read-only operational status instead of storing secrets in PostgreSQL.
- 2026-08-24 — use private Standard-class R2 with direct checksum-bound presigned PUTs. Do not enable
  `r2.dev` or a public custom domain.
- 2026-08-24 — default limits are conservative and server-authoritative: five files, 50 MiB each and
  100 MiB total per message; operators may lower them through validated env values.
- 2026-08-24 — request/message retention is 90 days from last activity. Attachment cleanup is the
  earlier of whole-request expiry or three days after the current resolved transition.
- 2026-08-24 — an authorized owner can download their own attachment as well as an active admin;
  authorization is rechecked before every one-minute presigned GET.

## Verification

- Repository root: `pwsh -NoProfile -File ./scripts/verify-migrations.ps1` and
  `pwsh -NoProfile -File ./scripts/verify.ps1 -Scope Changed`, then Full.
- `backend/`: Ruff, focused Support/R2/config/retention tests, full pytest and deterministic fake-R2
  HTTP behavior; no live object mutation.
- `frontend/`: lint, typecheck, unit, build and focused Support Playwright across 430x932, 320x568,
  iOS WebKit and desktop Chromium.
- Manual artifacts: configured/unconfigured new-request and conversation states in light/dark;
  console, unexpected network, overflow and scoped Axe review.

## Recovery and rollback

No live provider mutation is authorized by this plan. Tests use disposable PostgreSQL and fake R2
transport. Migration downgrade is exercised only on the disposable verifier database. Cleanup keeps
DB object references until R2 confirms deletion; provider outage therefore delays deletion rather
than creating untraceable objects. Source rollback must be a targeted inverse patch that preserves
the existing uncommitted Support and unrelated branch changes.

## Outcomes & Retrospective

The accepted Support frontend now has one durable backend contract instead of fixture-only request
state. PostgreSQL owns conversations and retention metadata; private R2 is optional and owns only
opaque attachment bytes. Operators configure credentials in server env and inspect/test the
non-secret state in Mini App. Missing configuration leaves requests and replies fully usable.

Fresh verification completed on 2026-08-24:

- migration one-head, fresh upgrade, predecessor upgrade, downgrade/re-upgrade and drift checks
  passed;
- Ruff, 551 backend tests and 56 pinned Remnawave contracts passed;
- frontend lint, typecheck, 100 unit tests and production build passed;
- focused Support passed 56/56 across mobile Chromium, small-mobile Chromium, iOS WebKit and desktop
  Chromium, including configured/missing R2 Axe and overflow coverage;
- Changed and Full mobile suites both produced 187/202. The 15 failures exactly preserve the prior
  boundary: 12 test groups contain only ledgered ADR 0004 `color-contrast` findings and three are
  stale Tribute success/info-notice expectations. All 14 Support scenarios passed, with no new
  Support accessibility node or rule.

The owner subsequently authorized the live dev setup. Private bucket `flowvy-support`, exact dev
origin CORS and a credential limited to Object Read & Write on that bucket are configured; Flowvy's
read-only signed `HEAD bucket` check succeeds. The separately authorized controlled TXT smoke passed
CORS, upload, verified metadata/checksum, download byte equality and exact deletion; final `HEAD`
returned `404`. Telegram notifications remain the next Support milestone. No commit or push was made.
