# Phase 9 Public Trust Design

Status: approved, implemented, and locally verified on 2026-08-17. Phase 10 requires
separate user approval.

## Scope

Phase 9 adds five unauthenticated public trust routes:

- `/privacy`
- `/terms`
- `/accessibility`
- `/contact`
- `/your-privacy-choices`

The pages share one responsive public layout and remain available before, during, and
after authentication. The sign-in page links to the public trust routes.

## Product Decisions

- These are pre-release trust pages, not finished production legal instruments.
- Copy describes only behavior supported by the clean rebuild. It does not import old
  Newfork policies, promises, legal conclusions, or compliance claims.
- Privacy copy separates current product data categories from items that still require a
  deployment-specific production notice: operating entity, contact details, retention,
  subprocessors, jurisdictional rights, and effective date.
- The accessibility page reports the product as not formally assessed. It does not claim
  WCAG conformance without evaluation evidence.
- The privacy choices page does not present a fake opt-out control. Optional analytics,
  advertising, and cross-context behavioral tracking are not configured in the clean
  rebuild, so the page states that current boundary and identifies essential auth and
  preference storage.
- Public contact uses the configured support email when available. It does not create a
  public message database, email provider, spam surface, or silent data submission path.

## Deferred

- Billing settings, prices, plans, checkout, invoices, and subscriptions.
- Marketing, product, feature, solution, resource, FAQ, and sitemap pages.
- Cookie-consent infrastructure, preference centers, analytics, advertising, or tracking
  SDKs.
- A production privacy notice, final terms, legal entity identity, governing law,
  jurisdiction-specific rights workflow, or regulatory certification.
- Every time, payroll, pay-entity, kiosk, labor, and compliance blank-slate domain.

## Research Boundary

- W3C guidance says an accessibility statement should disclose the standard used,
  conformance status, contact route, and known limitations; an unassessed product should
  not claim conformance: <https://www.w3.org/WAI/planning/statements/>.
- California Privacy Protection Agency materials distinguish privacy policies from notice
  at collection and require notices to reflect actual practices and choices:
  <https://cppa.ca.gov/pdf/general_notices.pdf>.
- FTC business guidance emphasizes that published privacy promises must match actual data
  practices: <https://www.ftc.gov/business-guidance/privacy-security>.

These references inform honesty and structure only. They are not treated as legal advice
or proof that the pre-release pages satisfy any deployment's legal obligations.

## Verification Contract

- Route tests cover unauthenticated access, headings, shared navigation, no false
  conformance text, configured contact behavior, and sign-in discoverability.
- Browser UAT covers all five routes at desktop and 390 by 844 mobile dimensions.
- Accessibility checks cover landmarks, heading order, focus-visible navigation, link
  names, contrast sanity, and document-level horizontal overflow.

## Approval Boundary

Approval covers this Phase 9 contract only. Phase 10 verification and readiness remains a
separate user approval gate.
