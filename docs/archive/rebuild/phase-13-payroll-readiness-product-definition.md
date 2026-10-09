# Phase 13 Payroll Readiness Product Definition

Status: drafted on 2026-08-18. No runtime implementation, payroll provider integration, tax
filing, wage calculation, compliance engine, or legal rule is approved by this document.

## Purpose

Define the narrow bridge between the completed Time domain and a future payroll workflow without
importing legacy payroll, pay-entity, jurisdiction, overtime, break-compliance, or provider
assumptions.

The first payroll-adjacent product should help authorized managers prepare an auditable time export
from reviewed Time records. It must not claim that the records are legally compliant, wage-ready,
tax-ready, overtime-classified, or accepted by any payroll provider.

The canonical distinction is:

- a Time event is the append-only operational claim captured in Phase 11,
- a work session is the current projection of those events,
- a review window is an operational manager review,
- a payroll export snapshot is an immutable packaging of selected reviewed sessions,
- a payroll provider handoff is a future integration decision,
- payroll correctness and legal compliance remain unimplemented high-risk domains.

## Product Position

Phase 13 should start with payroll readiness, not payroll processing. The product may export raw
reviewed time data and its provenance so an operator can reconcile it in an external payroll system.
It does not calculate gross wages, taxes, overtime premiums, paid or unpaid break treatment, tip
credits, deductions, final pay, accruals, leave balances, or employer filings.

This keeps the clean rebuild useful after Time capture while preserving the boundary that payroll
and compliance require separate legal, security, and provider review.

## Users And Jobs

### Owner Or Payroll Operator

- Select a reviewed date range and location scope.
- See which sessions are exportable, blocked, changed since review, or missing required operational
  fields.
- Create an immutable export snapshot with a required reason or memo.
- Download a plain CSV suitable for manual reconciliation outside Newfork.
- Re-download prior snapshots and inspect who created them, when, and from which session versions.

### Manager

- Fix operational Time issues before export when they have the relevant Phase 11 permissions.
- See that export blockers are operational blockers, not legal conclusions.
- Understand when a post-export amendment invalidates or supersedes a previous snapshot.

### Employee

- Continue to see their own time record and correction history.
- Not receive a false claim that an exported record means payroll is complete, compliant, or final.

## Product Model

### Payroll Readiness Window

A payroll readiness window is a workspace-local date range and selected location set used to gather
reviewed sessions for export. It may align with an employer payroll period later, but Phase 13 does
not define pay-period policy.

State:

- `draft`: selected scope is being previewed,
- `blocked`: one or more sessions cannot be exported without operational review,
- `ready`: all selected sessions have an approved review-window version and no blocking operational
  issue,
- `exported`: at least one immutable snapshot exists,
- `superseded`: a later correction or amendment changed one or more included session versions.

### Export Snapshot

An export snapshot freezes the selected session identifiers, session versions, raw event references,
review-window identifiers, generated columns, creator, timestamp, and memo. It is append-only.

The snapshot should include raw operational values only:

- employee identifier and display name,
- location identifier and name,
- session date,
- raw clock-in and clock-out timestamps,
- raw break start and break end timestamps where present,
- raw elapsed duration,
- session status and attention flags,
- review-window approval reference,
- amendment and correction provenance,
- export snapshot identifier and generated-at timestamp.

It must not include:

- wage rates,
- regular or overtime earnings,
- tax amounts,
- deduction amounts,
- paid-break or unpaid-break classification,
- compliance status,
- payroll provider employee mapping,
- bank, SSN, tax, or direct-deposit data.

### Export Format

The first format is a plain CSV generated server-side from the immutable snapshot. Column order and
headers are versioned. A later format change creates a new export schema version rather than
silently changing old downloads.

Provider-specific files, APIs, SDKs, SFTP delivery, webhooks, or marketplace apps require a separate
provider-integration phase.

## Core Workflows

### Preview

1. The operator selects workspace, locations, and date range.
2. The server resolves current Time sessions and review windows.
3. The preview classifies rows as exportable, blocked, warning, or changed since review.
4. The UI explains blockers with operational reasons only.

Hard blockers:

- open or `needs_attention` sessions,
- pending employee corrections,
- stale review-window approval after an amendment,
- missing employee or location reference needed for the CSV,
- cross-location scope the actor is not authorized to export.

Warnings:

- sessions with amendments,
- sessions far from scheduled context,
- sessions with manager-created manual entries,
- sessions already included in a previous snapshot.

Warnings do not become legal labels. The operator may export with warnings only after recording a
memo.

### Snapshot And Download

1. The operator reviews the preview and supplies a required memo.
2. The server revalidates the selected scope inside the creation transaction.
3. The server writes an immutable snapshot and rows with the export schema version.
4. The CSV download is generated from the snapshot rows, not from live mutable projections.
5. The audit log records actor, scope, row count, schema version, and snapshot id.

### Post-Export Changes

If a later correction or amendment changes an included session, the product marks the snapshot as
superseded for that session and surfaces a follow-up action. It does not mutate the old CSV. A new
snapshot can be created for the changed scope.

## Authorization Contract

New permissions should remain narrow and independently assignable:

- `time.export.preview.location`
- `time.export.create.location`
- `time.export.read.location`
- `time.export.audit.read`

The actor must also have effective location access for every selected location. Browser database
roles receive no direct table access. Server operations must carry authenticated actor, workspace,
location scope, selected date range, and export snapshot id explicitly.

Export creation does not grant permission to amend Time records, approve review windows, manage
employees, view private documents, access SSNs, or configure payroll providers.

## Privacy And Data Minimization

Phase 13 exports only the minimum operational time fields needed for manual reconciliation. It
does not introduce employee tax profiles, wage rates, bank details, direct-deposit data, provider
tokens, or payroll administrator PII.

Downloaded CSV files leave Newfork's access-control boundary. The UI and audit trail should make
that explicit before download. Future hosted delivery, encrypted exports, retention policy, and
deletion requests require separate deployment and privacy decisions.

## Research Basis

- The U.S. Department of Labor's FLSA recordkeeping fact sheet lists time and pay records employers
  may need to keep and says records must be accurate. This supports preserving raw hours and
  provenance, while not treating Newfork's first export as a legal compliance engine:
  <https://www.dol.gov/agencies/whd/fact-sheets/21-flsa-recordkeeping>.
- The IRS employment tax recordkeeping page says employers should retain employment tax records
  and lists payroll-related records such as wage payments, reported tips, W-2 returns, and employee
  identifying information. This supports keeping tax/payroll records out of Phase 13 until a
  dedicated payroll phase defines sensitive data handling:
  <https://www.irs.gov/businesses/small-businesses-self-employed/employment-tax-recordkeeping>.
- The IRS third-party payer guidance distinguishes external payroll service roles such as reporting
  agents. This supports deferring provider handoff, authority, secrets, and filing responsibility
  to a separate provider-integration phase:
  <https://www.irs.gov/businesses/small-businesses-self-employed/outsourcing-payroll-and-third-party-payers>.

These sources are product-boundary inputs only. This document is not legal, tax, payroll, or HR
advice and does not certify that a customer record satisfies federal, state, local, union, or
provider-specific requirements.

## Deliberately Left Behind

- Every legacy payroll setup, payroll handoff, provider mapping, pay entity, jurisdiction, overtime,
  break-compliance, wage, tax, and compliance implementation.
- Payroll provider APIs, SDKs, OAuth, SFTP, webhooks, marketplace apps, and secrets.
- Gross/net pay, taxes, deductions, benefits, tips, tip credits, leave, sick accruals, overtime,
  double overtime, spread-of-hours, predictive scheduling, final paycheck, or wage statements.
- Employee tax forms, direct deposit, bank details, SSNs, garnishments, and benefits deductions.
- Legal labels such as compliant, violation, owed, payroll approved, payroll ready, or tax ready.

## Proposed Implementation Sequence

Each slice requires separate approval before implementation:

1. **Phase 13A - Export snapshot foundation:** shared contracts, export permissions, immutable
   snapshot tables, snapshot-row schema versioning, tenant/location authorization, audit, and
   database tests.
2. **Phase 13B - Payroll readiness UI and CSV:** preview route, blockers and warnings, memoed
   snapshot creation, CSV download, historical re-download, responsive browser proof, and no
   sensitive payroll fields.
3. **Phase 13C - Provider handoff research:** evaluate whether the product should remain export-only
   or support one provider integration; define provider authority, secrets, liability, error
   reconciliation, customer setup, and support cost before code.
4. **Phase 13D - Pay entity and compliance discovery:** only if the user wants payroll or legal
   classification later, run a dedicated high-risk product/legal/security design phase before any
   wage, overtime, break, jurisdiction, or tax logic enters the codebase.

## Acceptance Contract For A Future Implementation

- Unit tests prove preview classification, schema versioning, snapshot immutability, superseded
  detection, and CSV generation from frozen rows.
- Database tests prove cross-tenant and cross-location denial, permission boundaries, no direct
  table writes, immutable old snapshots, and audit creation.
- API tests prove revalidation at snapshot creation, stale preview rejection, safe CSV headers,
  input validation, and no leakage of SSN, wage, tax, bank, or provider fields.
- Web tests prove blocked, warning, ready, exported, superseded, download, re-download, and
  permission-denied states.
- Authenticated browser UAT covers owner/operator and limited manager roles on desktop and 390 px
  mobile, including keyboard operation and visible focus.
- Security review covers CSV injection, bulk data exfiltration, audit access, exported-file
  warnings, row-level authorization, and log redaction.
- Completion requires clean reset, focused and full automated gates, and browser workflows. Static
  source presence, HTTP 200, generated UI, or a single happy-path CSV is not sufficient proof.

## Phase Decision

Phase 13 is the next safe implementation-planning checkpoint if kiosk discovery remains paused.
The recommended first build, after explicit approval, is Phase 13A export snapshot foundation. Do
not implement provider integration, payroll processing, pay entities, or compliance logic from this
document alone.
