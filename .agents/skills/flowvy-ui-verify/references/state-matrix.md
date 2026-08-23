# Flowvy UI state matrix

Use this inventory to select cases; not every change requires every cell, but every affected cell needs evidence.

## Routes

| Area | Routes |
| --- | --- |
| User | `/`, `/devices`, `/pulse`, `/support` |
| Admin | `/admin/dashboard`, `/admin/users`, `/admin/users/search`, `/admin/users/:id`, `/admin/broadcast`, `/admin/settings`, `/admin/settings/pulse`, `/admin/settings/kuma`, `/admin/settings/beszel`, `/admin/settings/tribute`, `/admin/settings/tribute/{connection,payment-links,referral-benefits,automation-rules,sponsor-offers,activity}`, `/admin/settings/communication`, `/admin/settings/content`, `/admin/settings/branding`, `/admin/settings/access`, `/admin/settings/welcome` |

## Identities and navigation

- User, active admin, inactive/denied user, and unauthenticated request.
- Unknown user in open/invite-only onboarding; manual invite failure/success; valid and malformed
  Main Mini App `startapp` referral payload; automatic redeem must execute at most once.
- Direct protected URL, user/admin mode switch, Back/Forward, Telegram Back Button, and refresh on a nested route.
- Telegram SDK absent in a normal browser and present with light/dark dynamic theme and safe-area values.

## Data states

| Surface | Required representative states |
| --- | --- |
| Subscription | active, limited, expired, unlimited traffic/expiry/devices, none, very long identifiers |
| Sponsor access | no/base access, no published offers, one-time active/expired, subscription recurring trial/active/cancelled/expired, subscription access-first paid state before a delayed cancellation webhook, one commercial subscription card with read-only multi-period price comparison and a separate provider CTA, alternative subscription offers visible but locked until current paid expiry, recurring donation paid with provider billing status unverified, exact donation amount/mode/period instructions before redirect, amount/mode/period mismatch review without grant, identical paid-period UI before/after user cancellation, period-end donation cancellation/expiry, recurring state without one-time Extend, branded provider-timing note, pending checkout, pending-to-active status refresh, provisioning, review/attention, refund, checkout conflict, identified donation warning, neutral inactive/accent active indicator, multi-type renewal chooser |
| Devices | empty, one, several, limit reached, remove cancel/success/failure, remove-all cancel/success/failure |
| Pulse | operational, partial, down, maintenance, incidents, disabled, Kuma/Beszel timeout/schema error |
| Dashboard | full data, Remnawave unavailable, zero metrics, large values, backend error |
| Users | 0, 1, and large virtualized list; search; every status filter; no results; detail missing |
| Settings | unconfigured/configured, source selection, dirty/save/failure, Kuma/Beszel/Tribute read-only check pass/fail, server credential presence without secret values, Tribute payment-destination loading/empty/error/retry/save/clear/unavailable-ID/validation/discard states, commerce rule loading/empty/error/create/edit/toggle/delete, sponsor-offer loading/empty/error/draft/create/edit/delete/publish-guard/focusable missing-destination guard/stable-code race fallback/full multi-period preview/legacy duplicate disclosure/formatted-description inline-WYSIWYG/always-visible fixed toolbar/WAI-ARIA keyboard navigation/link-validation/safe-render states, donation offer exact one-time/recurring mode and weekly/monthly/quarterly/halfyearly/yearly frequency controls, truthful Creator-link limitation copy, donation fixed/volume preview/no-match, subscription provider-expiry rule without local day calculation, late Telegram-authenticated preview mutation, stale preview-error clearance and safe status copy, explicit payment-unit amount bands, compact amount-band rows, aligned currency/priority fields, action-scoped native `Search`/`Next`/`Done`/`Go` focus behavior without global keyboard or geometry rewrites, Telegram Main-only editor and dedicated settings save actions with no DOM replacement, unavailable-capability state, modal suppression and route cleanup, section-scoped Tribute payment-link DOM save, CSS loading indicators without SVG backing boxes, unavailable access profile, responsive editor and nested confirmation, Tribute operation applied/review/resolved/retry states, server-approved retry/resolve actions, required resolution note, mutation failure/retry/success, focus return and safe audit copy, registration open/invite-only, local/timed/fixed/lifetime/automation-managed access, automation profile excluded from registration defaults, native input plus compact select/date typography, touch picker focus cleanup and overflow, provider tag/squad options pass/fail, upload/reset pass/fail, discard dialog |

For applicable requests also cover loading, `401`, `403`, `404`, `500`, timeout/offline, malformed JSON/schema, mutation `200`/`204`, and mutation failure.

## Environments

- Primary mobile: Chromium at `430x932`.
- Small mobile: Chromium at `320x568`.
- Representative iOS: WebKit at `390x844` when the full browser matrix is requested.
- Desktop Telegram/admin: Chromium at `1280x900`.
- Light and dark themes; fixed timezone and clock for screenshot suites.

## Evidence checklist

- No unexpected console errors, page errors, failed requests, or unknown API calls.
- No horizontal overflow; critical controls remain visible and reachable.
- Keyboard focus is visible and ordered; dialogs trap focus and return it to the trigger.
- Automated accessibility scan runs on stable screens. Known strict desktop-parity findings are
  documented without filtering and keep the scan red; they are never reported as passed.
- Screenshots were opened and visually inspected, not merely generated.
