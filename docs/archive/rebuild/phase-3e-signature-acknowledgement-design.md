# Phase 3E: Signature And Acknowledgement Design

Status: approved. The Phase 3E Settings prerequisite slice is implemented; Phase 4
employee execution and evidence remain unimplemented.

## Scope Decision

Phase 3E defines the product, evidence, security, and retention contract for
employee onboarding acknowledgements. Its implemented slice adds workspace template
and retention settings only; it does not add employee execution, evidence envelopes,
receipts, manager review, or evidence-package storage.

The first implementation supports explicit acknowledgements of workspace-authored
policies. It does not claim to satisfy a regulated government, tax, immigration,
benefit, payroll, or work-authorization form.

## Execution Classes

Every template declares one execution class:

- `acknowledgement`: the employee confirms receipt and understanding of workspace content.
- `electronic_signature`: reserved for a separately reviewed form whose signing method,
  disclosures, delivery, retention, and jurisdictional scope have been approved.
- `external_process`: the requirement is completed outside Newfork and only an authorized
  completion reference is recorded.

Only `acknowledgement` is enabled in the first implementation. The other classes
remain fail-closed until their own activation review is recorded.

## Recommended Implementation Sequence

- Phase 3E implementation: workspace template directory, immutable publication,
  retention-policy references, preview, archive, and permissions in Settings.
- Phase 4 implementation: onboarding requirement snapshots, employee execution,
  evidence envelopes and receipts, manual follow-up, manager review, and activation gates.

This keeps workspace-owned prerequisites ahead of employee onboarding without creating
unused employee evidence tables before the Phase 4 vertical slice exists.

## Employee Experience

1. The employee opens one requirement at a time from self-scoped onboarding.
2. The complete final document is readable before the execution controls.
3. The page identifies the document title, workspace, version, effective date,
   and whether completion is required for activation.
4. The employee can download or print the exact version before acting.
5. The employee checks an explicit intent statement and types their full name.
6. The final action names the consequence, for example `Acknowledge policy`.
7. Success returns a receipt and an immediately downloadable evidence copy.
8. Declining or requesting a non-electronic alternative enters `manual_follow_up`;
   it never fabricates completion. A required item may still block activation until
   the workspace completes an approved alternative process.

The first implementation does not use a freehand signature pad. A drawn mark adds
accessibility and mobile friction but does not by itself establish identity, intent,
content integrity, or attribution.

## Template Contract

Draft templates may be edited. Publishing creates an immutable version containing:

- workspace and template identifiers,
- execution class,
- title and plain-language summary,
- canonical document bytes and media type,
- content digest and digest algorithm,
- intent statement version,
- effective date,
- locale,
- activation-blocking flag,
- required delivery/download behavior,
- retention policy identifier,
- reviewer and approval metadata when the class requires external review.

Published bytes, intent language, execution class, and retention policy cannot be
edited in place. Any change creates a new version. Archiving prevents future assignment
but never mutates requirements or evidence already issued.

## Requirement Snapshot

When onboarding starts, each signature requirement snapshots:

- template version identifier and content digest,
- required and activation-blocking flags,
- display order,
- execution class,
- retention policy identifier,
- assigned timestamp.

A later template publication does not silently replace an employee's issued
requirement. An authorized manager must explicitly reissue a new version, preserving
the superseded requirement and its event history.

## Evidence Envelope

Completion creates an immutable server-authored envelope with:

- workspace, onboarding case, requirement, employee, membership, and user identifiers,
- template version, canonical content digest, and intent statement version,
- typed signer name and the exact final action label,
- server-recorded execution timestamp and authenticated-session timestamp,
- authentication method and assurance level available to Newfork,
- request identifier and idempotency key,
- evidence schema version and digest algorithm,
- result state and any superseded-envelope reference.

The envelope is generated only after the server revalidates the self-scoped pending
membership, requirement state, expected revision, template digest, and session freshness.
Client timestamps, employee IDs, content digests, and completion states are never trusted.

Raw access tokens, session cookies, SSNs, document uploads, full IP addresses, and raw
user-agent strings are excluded from the long-lived envelope. Short-lived security logs
remain a separate, access-limited system with their own retention policy.

## Reproducible Evidence Package

The retained evidence package contains:

- the exact canonical document version,
- a human-readable receipt,
- the machine-readable immutable envelope,
- a manifest containing hashes for every package member.

The package must remain accurately reproducible for entitled users throughout its
retention period. Hash verification detects later byte changes; it does not create a
legal conclusion or replace required identity and process evidence.

Employees can access their receipt and exact signed version during onboarding and while
their account is available. Manager access requires a dedicated future permission and
must be audited. Support has no default content access.

## State Model

Signature requirement:

- `not_started`
- `viewed`
- `manual_follow_up`
- `completed`
- `superseded`
- `voided`

Template version:

- `draft`
- `approved`
- `published`
- `archived`

An acknowledgement is append-only after completion. Corrections, invalidation, or a
new policy version create `superseded` or `voided` transitions with reason, actor, and
timestamp; they never overwrite the original envelope.

## Retention And Deletion Contract

Every publishable template must reference an approved retention policy containing:

- retention class and policy version,
- triggering event such as signing or employment end,
- duration and jurisdictional scope,
- authority/source reference and reviewer,
- employee-access period,
- legal-hold behavior,
- purge and evidence-destruction procedure.

Newfork supplies no guessed universal duration. A missing or unapproved retention policy
blocks production publication. Development may use synthetic, clearly labeled policies
that are rejected by production activation checks.

`retain_until` is derived by the server when all triggering facts are known. A legal hold
prevents purge. Expired evidence is deleted only by an auditable background operation
that records package identifiers, policy version, deletion outcome, and timestamp without
copying the deleted content into the audit log.

Workspace deletion does not bypass retention or legal holds. Conversely, retention is
not permission for indefinite storage: evidence with no active hold must enter the approved
purge path when its policy expires.

## Authorization Boundary

Proposed future permissions:

- `signature_templates.read`
- `signature_templates.manage`
- `signature_requirements.review`
- `signature_evidence.read`

Template management, employee execution, manager review, and evidence access are separate
authorities. Owners do not receive employee evidence content merely because they own a
workspace; any built-in grants must be approved with Phase 4 implementation.

Employee execution endpoints are self-scoped and derive the employee identity from the
authenticated membership. Manager routes require workspace, employee, and requirement
scope checks. Database policies deny direct authenticated writes to envelopes and packages.

## Security And Reliability Requirements

- Fresh-session enforcement and origin/CSRF checks precede execution.
- The sign operation is transactional, revision-checked, and idempotent.
- Canonicalization happens before publication; execution hashes stored canonical bytes,
  not browser-rendered HTML.
- Packages use private object storage with workspace/employee scoped paths and short-lived
  downloads.
- Encryption at rest, backup restoration, key rotation, and package hash verification
  require operational tests before production.
- Analytics, error reports, support diagnostics, URLs, and client storage exclude content,
  typed signer names, and evidence packages.
- Accessibility covers keyboard-only operation, screen readers, zoom, long documents,
  explicit focus movement, and non-electronic alternative handling.

## Required Test Evidence

- Cross-tenant and employee-to-employee read/write denial.
- Direct envelope insert/update/delete denial.
- Duplicate, replayed, stale-revision, stale-session, and concurrent execution requests.
- Template edits after publication and requirement changes after assignment.
- Digest mismatch, missing package member, restore from backup, and key rotation.
- Decline/manual-follow-up behavior and activation blocking.
- Supersede, void, legal hold, retention expiry, and purge audit behavior.
- Employee receipt download and unauthorized manager/support access.
- Redaction across logs, traces, analytics, errors, URLs, and browser storage.
- Desktop/mobile accessibility and exact-content reproduction.

## Preserved

- Phase 2B server-derived onboarding progress and requirement snapshots.
- Required acknowledgements as activation gates.
- Separate onboarding-case and membership activation states.
- Save-and-exit without granting normal application access.

## Changed And Improved

- Acknowledgement and regulated electronic-signature classes are explicitly separated.
- Evidence is a reproducible immutable package rather than a checkbox or signature image.
- Content, intent language, attribution, session freshness, and idempotency are part of
  the execution contract.
- Retention policy approval is a publication prerequisite, with legal hold and audited purge.
- A non-electronic alternative is modeled without treating refusal as completion.

## Intentionally Omitted

- Signature-pad drawing and biometric signature analysis.
- I-9, W-4, tax, payroll, immigration, benefit, or work-authorization forms.
- Automatic legal sufficiency claims or jurisdiction inference.
- Third-party signature provider selection or integration.
- Runtime implementation, migrations, storage buckets, routes, or UI.
- A universal retention duration.

## Research-Derived Decisions

- Electronic form alone does not establish the complete product contract; intent,
  attribution, surrounding process, accurate reproduction, and access remain material.
- Retained electronic records must accurately reflect the final information and remain
  accessible and reproducible for the applicable period.
- Substantive legal requirements and excluded transaction types still apply even when an
  electronic record or signature is allowed.
- The product therefore records process evidence and content integrity while leaving form
  legality, duration, and jurisdiction-specific approval to an explicit review gate.

Primary references:

- U.S. Code, E-SIGN Act, 15 U.S.C. Chapter 96:
  https://www.govinfo.gov/content/pkg/USCODE-2022-title15/pdf/USCODE-2022-title15-chap96.pdf
- California Uniform Electronic Transactions Act, Civil Code 1633.1-1633.17:
  https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=3.&lawCode=CIV&part=2.&title=2.5.

## Remaining Approval Gates

Approved for Phase 3E:

- acknowledgement-only first implementation and no signature pad,
- immutable versions and fail-closed publication without approved retention policy,
- template and retention settings in Phase 3E,
- employee execution, receipts, manager review, and evidence access deferred to Phase 4.

Still required before production activation:

- hosted private evidence storage and encryption/key management,
- executable retention and legal-hold operations,
- at least one real non-electronic alternative,
- explicit grants for manager evidence access,
- approval of any `electronic_signature` or `external_process` execution class.
