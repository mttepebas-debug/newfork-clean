# Phase 4B employee onboarding design

Status: proposed for implementation approval. This document authorizes no code,
schema, storage, key-management, or runtime changes.

## Scope decision

Phase 4B delivers one complete standard-employee onboarding vertical slice from
invitation acceptance to explicit manager activation:

1. invitation preview, account creation or sign-in, and email-bound acceptance,
2. welcome and organization-owned assignment summary,
3. private profile and teammate-visibility choices,
4. dedicated SSN collection,
5. required document uploads,
6. acknowledgement execution and receipts,
7. recurring availability confirmation,
8. employee review and submission,
9. manager review, correction requests, approval, and membership activation.

The normal employee application remains unavailable while membership is
`pending_activation`. Account Center and self-scoped onboarding are the only permitted
surfaces. Form completion never activates membership implicitly.

Standard employees are the only worker type. Payroll, banking, tax filing,
work-authorization decisions, background checks, regulated government forms, labor or
compliance engines, and legal sufficiency claims are excluded.

## Route contract

- `/invite/accept?token=<opaque-token>` previews an invitation and starts account setup.
- `/welcome` resolves the first actionable onboarding step on the server.
- `/welcome/profile` edits private profile and teammate visibility.
- `/welcome/identity` is the dedicated SSN surface.
- `/welcome/documents/:requirementId` handles one document requirement.
- `/welcome/acknowledgements/:requirementId` handles one acknowledgement.
- `/welcome/availability` edits and confirms recurring availability.
- `/welcome/review` shows canonical completion and submits the case.
- `/app/employees/:employeeId` is not introduced. Manager review remains inside the
  exact-port Employee Drawer through its existing URL-backed section contract.

Direct navigation never determines authorization or completion. Every route resolves the
authenticated user to one self-scoped employee and pending membership. Invalid,
superseded, completed, or cross-employee requirement IDs return a non-disclosing state.

## Account and invitation contract

- An unauthenticated recipient may create a Supabase Auth account or sign in without
  losing the opaque invitation token.
- Acceptance requires the authenticated account email to match the intended invitation
  email after normalization and verification.
- Acceptance remains single-use, expiry-checked, revision-safe, and transactional.
- An existing employee record is linked; no second employee or active membership is
  created.
- Post-accept bootstrap refreshes memberships before routing to `/welcome`, preventing a
  valid acceptance from falling into workspace creation or a normal application route.

## Server-derived workflow

The client does not persist a current-step source of truth. `GET /v1/me/onboarding`
returns the ordered requirement projection, aggregate progress, first actionable route,
and revision. Rejected, expired, or changes-requested requirements take priority.

On first start, one transaction creates the onboarding case and snapshots active
workspace requirements:

- profile and SSN gates,
- active onboarding-required document type definitions,
- published acknowledgement template versions,
- required and activation-blocking flags,
- review requirements and stable display order.

Later Settings changes do not silently modify issued requirements. Explicit reissue
creates a new requirement and preserves the superseded row and event history.

## Data ownership

- `employee_private_profiles`: address, date of birth, private phone, emergency contact,
  and teammate-visibility choices.
- `employee_onboarding_cases`: state, revision, submission, review, and activation facts.
- `employee_onboarding_requirements`: immutable source snapshots and mutable workflow
  status.
- `employee_sensitive_identifiers`: SSN ciphertext envelope and last four only.
- `employee_documents`: private object metadata, versions, replacement chain, expiry,
  and review state.
- `employee_acknowledgement_envelopes`: immutable execution evidence and receipt facts.
- `employee_availability_versions`: immutable confirmed recurring-rule versions.
- `onboarding_events`: append-only transitions and security outcomes without sensitive
  payloads.

Every row carries `workspace_id`. Self-service operations derive `employee_id` from the
authenticated user; they never accept it from the browser.

## SSN security decision

Use application-layer envelope encryption with an AWS KMS customer-managed symmetric
key in the deployment-aligned region:

- Fastify accepts one normalized nine-digit value only on the dedicated endpoint.
- AWS KMS `GenerateDataKey` produces a per-record AES-256 data key.
- Node cryptography encrypts the SSN with AES-256-GCM and immediately zeroes the plaintext
  data-key buffer after use.
- The database stores ciphertext, encrypted data key, nonce, authentication tag, key
  identifier/version, schema version, and last four. It never stores plaintext.
- KMS encryption context binds non-secret workspace, employee, record, environment, and
  purpose identifiers. Email, name, SSN, and other private values are forbidden in the
  context because it is auditable plaintext.
- The runtime identity receives only the required `GenerateDataKey` and `Decrypt`
  operations constrained by key and encryption context.
- Ordinary reads return only `missing` or `present` plus last four. No human reveal flow
  exists in Phase 4B.

Production SSN collection and activation fail closed unless the KMS key, least-privilege
runtime identity, rotation and backup-recovery procedure, compromise runbook, and an
approved retention/deletion policy are configured. Local development uses a separate
test-only provider and synthetic identifiers; its ciphertext is incompatible with
production.

No universal retention duration is invented in this phase. The implementation records a
versioned retention-policy reference and blocks production activation until an approved
policy is selected.

## Document storage decision

- Use one private Supabase Storage bucket with MIME and size restrictions.
- Object paths are unguessable and scoped by workspace, employee, requirement, and
  immutable document version.
- The API issues short-lived signed upload instructions only after self-scope and
  requirement checks. Confirmation verifies object metadata before creating the
  canonical document row.
- Downloads use short-lived authorization after a fresh permission check; URLs are never
  persisted, logged, analyzed, or included in notifications.
- Replacement creates a new immutable version. Rejected and superseded objects remain
  linked to history until the approved retention operation removes them.
- Direct metadata writes to `storage.objects` are forbidden; object operations use the
  Storage API and database rows remain the workflow source of truth.

Production upload and activation fail closed until private bucket policy, malware-scan
handling, retention/deletion operation, and backup/restore verification are configured.

## Acknowledgement decision

Only the already approved `acknowledgement` execution class is enabled:

- the complete immutable published version is readable and downloadable before action,
- the employee confirms an explicit intent statement and types their full name,
- the server revalidates session freshness, requirement revision, template digest, and
  self scope,
- completion creates an append-only evidence envelope and downloadable receipt,
- decline or non-electronic alternative enters `manual_follow_up`, never false
  completion,
- no signature pad, `electronic_signature`, external process, or legal-form claim is
  introduced.

Production execution fails closed until evidence-package private storage, executable
retention/legal-hold handling, and at least one real non-electronic alternative are
configured.

## Availability contract

- The employee edits recurring weekly availability in the workspace timezone.
- Each day explicitly records unavailable, unrestricted, or one or more available
  windows; an empty payload is not interpreted as unrestricted.
- Overnight windows, overlapping windows, invalid ordering, and ambiguous timezone input
  are rejected by shared and database validation.
- Confirmation creates an immutable version and an event. Later employee changes belong
  to the future Employee Hub availability workflow and do not rewrite onboarding history.

## Review and activation

Employee submission requires every employee-owned activation gate to be complete. It
changes the case to `submitted`; membership remains `pending_activation`.

Phase 4B adds:

- `employee_onboarding.review`: view canonical onboarding status, approve the overall
  case, or request specific corrections,
- `employee_documents.review`: access and review employee document content.

Owner and Admin receive both permissions. Manager receives onboarding review by default
but not document-content review; a custom role may grant it. Managers never receive SSN
ciphertext, encrypted keys, private profile payloads, or acknowledgement evidence bytes.

Activation is one revision-checked transaction that proves:

- the case is submitted,
- every required document is accepted when review is required,
- every required acknowledgement is complete or has an approved alternative,
- profile, SSN, and availability gates are complete,
- no requirement is rejected, expired, superseded without replacement, or awaiting
  review,
- production KMS, storage, evidence, and retention readiness checks are green.

The transaction sets the onboarding case to `approved`, membership to `active`, records
the reviewer and timestamps, appends audit events, and invalidates bootstrap caches.

## API boundary

Self-scoped endpoints follow the approved Phase 2B contract under `/v1/me/onboarding`.
SSN, document signed-upload confirmation, acknowledgement execution, submission, and
manager review pass through Fastify. Non-sensitive profile and availability persistence
may use narrow RPCs, but must preserve the same revision and self-scope contract.

All mutations use an expected revision and idempotency key. Rate limits, origin checks,
fresh-session checks for sensitive actions, privacy-minimal errors, and allow-listed audit
payloads are mandatory.

## UI decision

Employee onboarding is a blank-slate mobile-first task flow, not an exact port:

- one requirement or decision per focused surface,
- persistent progress and save-and-exit without normal app access,
- clear privacy context beside private fields without exposing internal security design,
- complete document content before acknowledgement controls,
- explicit loading, offline, stale-revision, upload, scan, review, rejected, and retry
  states,
- keyboard, screen-reader, 200% zoom, long-document, and narrow-mobile support.

Manager review reuses the exact Employee Drawer shell. Availability, Documents, Access,
and History sections gain Phase 4B content without changing shell dimensions or section
behavior.

## Required verification

- Blank local database reset and full migration replay.
- Multi-tenant, cross-employee, role, location, and self-scope pgTAP denial tests.
- Invitation signup/sign-in/acceptance and post-accept bootstrap integration tests.
- SSN schema, encryption round-trip, tamper, wrong-context, unavailable-KMS, redaction,
  and no-human-read tests using synthetic values only.
- Document upload, type/size, replacement, review, expiry, unauthorized download, and
  object/database mismatch tests.
- Acknowledgement digest, stale session/revision, idempotency, decline, receipt, and
  append-only evidence tests.
- Availability validation, explicit unrestricted state, timezone, and immutable-version
  tests.
- Submission, correction, concurrent review, fail-closed readiness, and atomic activation
  tests.
- Root typecheck, lint, unit tests, production build, and authenticated desktop/mobile
  browser flows for employee and manager roles.

Hosted verification must separately prove real KMS authorization, private object access,
backup recovery, redaction, retention operations, and end-to-end activation. Local green
tests are not production readiness proof.

## Preserved

- Server-derived completion and first-actionable resume behavior.
- Self-scoped profile, documents, acknowledgements, and availability.
- Requirement snapshots, explicit rejection/replacement, and separate case/membership
  states.
- Save-and-exit without granting normal employee application access.
- Exact Employee Drawer shell for manager review.

## Changed or improved

- Account creation and invitation acceptance form one resumable, email-bound flow.
- Profile privacy, SSN, documents, acknowledgements, availability, submission, review,
  and activation are one transactional product lifecycle rather than disconnected forms.
- AWS KMS envelope encryption and purpose-bound context replace application-owned master
  secrets.
- Document and evidence objects are private, versioned, and workflow-linked.
- Production activation is fail-closed against infrastructure and retention readiness.

## Intentionally omitted

- Legacy onboarding visuals, checklist persistence, payroll, tax, banking, I-9/W-4,
  work-authorization decisions, compliance engines, background checks, and pay setup.
- Human SSN reveal, support access, broad exports, signature pads, electronic-signature
  claims, and unreviewed external-process completion.
- Employee Hub feature expansion beyond the onboarding-to-active redirect.

## Research-derived decisions

- AWS KMS envelope encryption uses per-record data keys and a non-secret encryption
  context for integrity, authorization constraints, and auditability.
- Supabase private buckets remain RLS-controlled and private downloads use short-lived
  authorization; workflow state remains in application tables rather than Storage
  metadata.
- Published acknowledgement bytes and execution evidence are immutable and reproducible;
  a typed name is only one part of intent and attribution, not a legal conclusion.

## Approval gate

Implementation begins only after explicit approval of this Phase 4B contract. Approval
authorizes local implementation and fail-closed production integration boundaries; it
does not by itself certify legal retention, activate hosted SSN collection, or approve a
production release.
