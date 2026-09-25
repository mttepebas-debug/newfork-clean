# Phase 9 Public Trust

Status: implementation and local acceptance completed on 2026-08-17. Phase 10 has not
started and requires separate user approval.

## Preserved

- Public trust routes remain minimal and separate from the authenticated restaurant
  operations product.
- Existing sign-in, account, onboarding, workspace, and employee routing behavior remains
  unchanged.
- The support email continues to come from `VITE_SUPPORT_EMAIL`, with the existing local
  development fallback only in development mode.
- Forbidden time, payroll, pay-entity, kiosk, labor, and compliance domains remain absent.

## Changed And Improved

- Added unauthenticated `/privacy`, `/terms`, `/accessibility`, `/contact`, and
  `/your-privacy-choices` routes under one responsive public layout.
- Added shared trust navigation, footer links, auth-aware sign-in/workspace return, and
  trust links on the sign-in screen.
- Each route has one semantic `h1`, ordered sections, header/main/footer landmarks,
  route-specific document title, and description metadata.
- Contact opens only the configured mail client and never silently attaches workspace or
  diagnostic data. No unapproved public form, storage table, or delivery provider was
  added.
- Privacy Choices accurately reports that advertising, optional analytics, and
  cross-context tracking are not configured. It does not show a fake opt-out switch.
- Accessibility reports the product as not formally assessed and makes no unsupported
  WCAG conformance claim.
- Shared and API health contracts now report `phase-9`.

## Intentionally Omitted

- Billing, plans, pricing, checkout, invoices, subscriptions, and payment providers.
- Marketing product/features/solutions/resources/FAQ/sitemap pages.
- Cookie banners, consent vendors, analytics SDKs, advertising SDKs, and preference-center
  backends.
- Final production privacy notices, final commercial terms, legal entity identity,
  governing law, regulatory certification, or jurisdiction-wide rights claims.
- Public contact-form ingestion and external email delivery infrastructure.

## Research-Derived Ideas

- W3C accessibility statement guidance informed the explicit `not formally assessed`
  status and the separation of current measures from future evaluation evidence.
- California Privacy Protection Agency notice guidance reinforced separating current data
  practices from deployment-specific notice-at-collection and rights procedures.
- FTC privacy guidance reinforced publishing only promises that match current product
  behavior.
- The React best-practices review kept the public layout and pages in small lazy chunks,
  used a single unconditional metadata effect, and avoided new data-fetch waterfalls.

## Verification

- Focused public-page tests: 8 passed.
- Shared, API, web, and UI tests: 86 passed in total.
- Full database suite: 16 files and 420 assertions passed.
- Root Prettier check, lint, typecheck, and production build passed.
- PublicTrustLayout builds as a 1.35 kB lazy chunk and PublicTrustPages as a 10.00 kB lazy
  chunk. The existing main JavaScript chunk advisory remains at 622.42 kB.
- Desktop browser UAT verified all five routes, route headings, shared landmarks, contact
  `mailto`, privacy-choice status, visible keyboard focus, metadata, and no console errors.
- Mobile browser UAT inspected all five routes at 390 by 844. The browser content width was
  375 px after scrollbar allocation; every document matched that width and no visible
  element overflow was detected.

## Unverified

- No attorney or privacy professional reviewed the text.
- No production legal entity, verified public contact, retention schedule, subprocessor
  list, jurisdictional rights workflow, or effective date was supplied.
- No formal WCAG audit, assistive-technology matrix, hosted deployment, hosted smoke,
  crawler/SEO validation, or production-domain check was performed.
- These pre-release pages must not be treated as production legal compliance evidence.

## Approval Gate

Phase 10 Verification and Readiness must be discussed and explicitly approved before
implementation.
