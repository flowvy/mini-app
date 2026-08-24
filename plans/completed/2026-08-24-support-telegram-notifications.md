# Transactional Support notifications in Telegram

Status: completed
Owner: Пятница
Started: 2026-08-24
Updated: 2026-08-24

## Purpose

Deliver actionable Support updates in the existing private bot chat while keeping the conversation
and reply composer inside the Mini App. A user receives an escaped product-owned service message
when support replies. Every currently active administrator receives a service message for a new
request or user reply. Each notification opens the exact authorized Support request.

## Current state

Durable `support_requests` and `support_messages` already store one subject up to 120 characters and
message bodies up to 4000 characters. `/support/requests/:id` already renders the conversation and
open composer for both roles. The locked backend uses aiogram 3.26.0 and `MessageSender` already
sends HTML messages with inline `WebAppInfo` buttons. No Support notification is emitted today.

Official Telegram Bot API checked 2026-08-24:

- `sendMessage` accepts 1-4096 characters after entity parsing:
  https://core.telegram.org/bots/api#sendmessage
- an inline `web_app` button opens an HTTPS Mini App URL and is available in private bot chats:
  https://core.telegram.org/bots/api#inlinekeyboardbutton

## Scope

In scope: product-owned English notification copy; HTML escaping; bounded message preview; exact
request `WebAppInfo` URL; new-request/user-reply fan-out to every active administrator; support-reply
delivery to the requester; self-notification suppression when an administrator acts as a user;
best-effort provider failure isolation; deterministic Bot API mocks; integration/security docs.

Out of scope: operator customization, a notification permission prompt, push APIs outside Telegram,
notifications for manual Resolve/Reopen, attachment bytes or filenames in Telegram, administrator
assignment/presence/locking, retry queues and delivery analytics.

## Acceptance

- A new request and every user reply send one notification to each active administrator except the
  requester themselves; inactive/non-admin users never receive it.
- A support reply sends one notification to the request owner and does not notify other admins.
- Reply-driven Reopen produces only the message notification; manual Resolve/Reopen is silent.
- User copy contains subject, bounded reply, request number/topic, optional attachment count and a
  `Reply` button. Admin copy uses `New support request` or `New user reply`, requester identity,
  subject, bounded message, request number/topic, optional attachment count and an `Open` button.
- Dynamic text is HTML-escaped. No filename, signed URL, credential, account/device/subscription
  context or provider body enters Telegram or logs.
- A Telegram failure cannot roll back or change the already accepted Support mutation, cannot block
  delivery to other admins and returns no provider detail to the API caller.
- The button opens the existing exact request route, whose BFF authorization still fails closed.

## Approach

1. Trace transaction ownership, admin selection, bot DI and current message sender failure behavior.
2. Add one dedicated notification service that renders fixed templates and dispatches bounded,
   isolated messages through the existing `MessageSender`.
3. Trigger notifications only after successful request/reply persistence, without changing response
   schemas or frontend state.
4. Add deterministic success, escaping, truncation, recipient and provider-failure tests.
5. Run focused Telegram/Support tests, Ruff, the change-aware gate and live Mini App notification
   acceptance only with explicit authorization for real bot messages.

## Progress

- [x] 2026-08-24 — accepted user/admin templates, `Reply`/`Open` labels, all-active-admin fan-out and
  product-owned service-copy boundary.
- [x] 2026-08-24 — confirmed locked aiogram 3.26.0, existing `MessageSender` WebAppInfo support,
  Support field limits and official current Bot API button/message constraints.
- [x] 2026-08-24 — traced request-scoped commit timing, role authorization and bot DI: Support rows
  currently flush inside the service but commit only when the Dishka request scope exits; existing
  `UserRepository.get_admins()` does not filter active/env-authorized identities.
- [x] 2026-08-24 — implemented fixed escaped notifications, active-admin selection, exact request
  buttons, post-commit dispatch and deterministic success/failure/ordering tests.
- [x] 2026-08-24 — completed repository verification, documentation and standard Telegram-enabled
  runtime handoff; optional authorized live Telegram acceptance remains external evidence.

## Surprises & Discoveries

- The existing exact request route means the inline `web_app` button can open the composer directly;
  no new frontend route or `startapp` parser is required.
- Telegram delivery inside `SupportRequestService` would run before the request-scope transaction
  commits. The notification boundary therefore needs an explicit successful commit before dispatch.

## Decision Log

- 2026-08-24 — button labels are exactly `Reply` for users and `Open` for admins.
- 2026-08-24 — templates are product-owned service flow copy, not operator content and not exposed in
  Settings.
- 2026-08-24 — manual Resolve/Reopen is silent; reply-driven Reopen emits only the reply event.
- 2026-08-24 — notification body preview is bounded to 1200 visible characters at a word boundary;
  the Mini App remains the full source of truth.
- 2026-08-24 — request/reply endpoints explicitly commit their mutation before synchronous
  best-effort dispatch. Dispatch catches provider failures per recipient and uses bounded
  concurrency; the outer request-scope commit remains an idempotent no-op. This avoids false
  notifications without adding an outbox migration. A process crash in the narrow post-commit,
  pre-send window can still lose a notification and is accepted for this MVP.
- 2026-08-24 — inline `web_app` buttons are omitted unless `WEBAPP_URL` is a credential-free HTTPS
  URL without query or fragment. Text delivery remains available for localhost/text-only installs.

## Verification

- `backend/`: targeted Support notification and `MessageSender` tests with `AsyncMock`, then Ruff
  format/lint and the full backend gate because DI/shared Support service changes.
- Repository root: `pwsh -NoProfile -File ./scripts/verify.ps1 -Scope Changed`; Full before final
  handoff when the environment supports it.
- Live Telegram: one controlled user request/reply and one admin reply, checking every recipient and
  exact-route button. This sends real bot messages and needs action-time owner approval.

## Recovery and rollback

The implementation adds no schema or provider configuration. Rollback is a targeted inverse patch
to notification wiring and tests. Support writes remain authoritative even if Telegram is down;
delivery is best effort and cannot be used as the persistence transaction boundary.

## Outcomes & Retrospective

Focused Telegram/Support tests passed 39/39 and the final full backend suite passed 558/558. Ruff
format/lint passed for every touched Python file. One pre-existing test-isolation gap surfaced after
live R2 configuration: app-level tests read the developer `.env` and incorrectly enabled
attachments. The autouse test fixture now explicitly blanks all four R2 environment values, while
individual configured-R2 tests continue to inject fake credentials. Changed verification confirmed
437 service-free backend tests, frontend lint/typecheck, 100 unit tests and production build. Its
mobile Playwright result remained 187/202: 12 exact accepted ADR 0004 contrast failures and three
known stale Tribute notice expectations; every Support scenario passed. Markdown links resolve.
Standard Telegram dev then restarted with preserved volumes: local frontend/backend/preview and
public root/health/ready returned 200, public debug returned 404, PostgreSQL/Redis were healthy and
`telegram_main_app_ready` was present. No real bot message was sent. Live Telegram recipient/button
acceptance remains pending explicit action-time authorization; it does not block the deterministic
implementation handoff.
