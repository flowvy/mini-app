# Flowvy UI state matrix

Use this inventory to select cases; not every change requires every cell, but every affected cell needs evidence.

## Routes

| Area | Routes |
| --- | --- |
| User | `/`, `/devices`, `/pulse`, `/support` |
| Admin | `/admin/dashboard`, `/admin/users`, `/admin/users/:id`, `/admin/broadcast`, `/admin/settings`, `/admin/settings/kuma`, `/admin/settings/beszel`, `/admin/settings/tribute`, `/admin/settings/branding`, `/admin/settings/access`, `/admin/settings/welcome` |

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
| Devices | empty, one, several, limit reached, remove cancel/success/failure, remove-all cancel/success/failure |
| Pulse | operational, partial, down, maintenance, incidents, disabled, Kuma/Beszel timeout/schema error |
| Dashboard | full data, Remnawave unavailable, zero metrics, large values, backend error |
| Users | 0, 1, and large virtualized list; search; every status filter; no results; detail missing |
| Settings | unconfigured/configured, source selection, dirty/save/failure, Kuma/Beszel/Tribute read-only check pass/fail, server credential presence without secret values, commerce rule loading/empty/error/create/edit/toggle/delete, fixed/volume preview/no-match, late Telegram-authenticated preview mutation, stale preview-error clearance and safe status copy, explicit payment-unit amount bands, compact amount-band rows, aligned currency/priority fields, focused-input reveal inside the visual viewport, touch editing that keeps editor actions hidden through viewport restoration without blocking button activation, CSS loading indicators without SVG backing boxes, unavailable access profile, responsive editor and nested confirmation, registration open/invite-only, local/timed/fixed/lifetime access, compact resting input/select/date typography, touch picker focus cleanup and overflow, provider tag/squad options pass/fail, upload/reset pass/fail, discard dialog |

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
- Automated accessibility scan passes for stable screens; known exceptions are documented.
- Screenshots were opened and visually inspected, not merely generated.
