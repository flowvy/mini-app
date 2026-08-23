# Welcome discount price presentation

## Purpose

Make the existing Tribute welcome discount understandable and commercially useful without claiming
that Flowvy controls Tribute pricing. The admin records the promo percentage that they configured in
Tribute; eligible invited users see the original subscription price, Flowvy's discounted calculation,
and a clear first-payment benefit before opening the shared Tribute promo link.

## Source and product contract

- Official Tribute documentation checked 2026-08-22:
  <https://wiki.tribute.tg/for-content-creators/subscriptions/promo-codes-for-subscriptions.md>.
- Tribute allows 1–99%, applies a promo to the first subscription payment and all billing-period
  options, enforces a minimum final subscription price of EUR 1, and may adjust the effective
  discount when a period would fall below that minimum.
- Flowvy stores the operator-entered percentage and calculates display prices in integer minor units,
  rounded to the nearest minor unit. The checkout card states that Tribute confirms the final price.
- Eligibility and checkout URL selection remain backend-owned. No provider write API is introduced.

## Implementation

- [x] Add nullable `welcome_discount_percent` to provider settings with database and schema bounds
  1–99, plus a reversible migration after the existing referral migration.
- [x] Require offer, promo URL, and percentage whenever the welcome discount is enabled.
- [x] Expose the percentage only on the eligible offer and freeze it into checkout snapshots.
- [x] Add the conditional percentage field to the existing referral-benefits admin section.
- [x] Present a dedicated first-payment benefit block, struck original prices, calculated prices for
  every billing period, and a discount-specific CTA on the Home offer card.
- [x] Align the final Home composition with the owner-selected desktop system: neutral secondary
  benefit surface with positive border and bare `TicketPercent`, plus a separately framed secondary
  price shell with `border-secondary` on the primary offer surface; `Basic access` and standalone
  donation-price rows use the same neutral framing, while internal separators remain
  `border-tertiary`; struck source prices use readable secondary text.
- [x] Cover settings validation, eligibility/snapshot contracts, price arithmetic, admin save flow,
  Home rendering, ineligible state, and multi-period presentation.
- [x] Inspect light/dark UI at 320 px, 430 px, WebKit and desktop; check overflow, focus, Axe,
  console and network failures.
- [x] Run fresh migration, backend, contract, frontend and full repository verification, then update
  durable docs and move this plan to `plans/completed/`.

## Risks and boundaries

- The entered percentage can drift from Tribute; the admin owns keeping it current.
- Flowvy's calculated amount is informative. Tribute remains authoritative because its EUR 1 minimum
  and currency conversion can adjust the real checkout amount.
- All Home subscription cards share the accepted secondary price-shell hierarchy; Admin
  `tone="plain"` price lists retain their pre-change primary background and tertiary border.

## Verification

- Focused backend settings/sponsor: 73 passed.
- Focused admin/Home Playwright: 8 passed across mobile, small mobile, iOS WebKit and desktop.
- Light/dark offer and admin evidence inspected at the required viewports without overflow.
- Fresh Full gate: one-head/zero/predecessor/downgrade/re-upgrade/drift migration checks; Ruff;
  533 backend tests; 56 pinned Remnawave contracts; frontend lint, typecheck, 78 unit tests and
  production build; 150 mobile Playwright scenarios; local Markdown links.
