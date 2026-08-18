# Phase 2B employee onboarding design

Status: proposed for approval. This document authorizes no implementation.

## Scope and sequencing decision

Phase 2B defines the employee onboarding product and security contract. The
implementation belongs in Phase 4, after Phase 3 provides canonical locations,
jobs, roles, permissions, document types, and signature requirements.

Building the workflow before those dependencies would create temporary models
that later become accidental product contracts.

Standard employees are the only worker type in the first implementation.
Payroll, pay classification, work-authorization decisions, tax filing, banking,
background checks, and compliance policy engines are excluded.

## Product flow

1. Invite acceptance
   - The invite is bound to one workspace, employee record, and intended email.
   - Acceptance creates an authenticated but pending-activation membership.
   - Pending members can access only self-scoped onboarding and account routes.
2. Welcome
   - Shows workspace, assigned locations/jobs, manager contact, and start context.
   - Contains no editable organization-owned assignment fields.
3. Profile and privacy
   - Employee enters legal/preferred name, phone, address, date of birth, and
     emergency contact.
   - Public teammate visibility is separate from private employment data.
4. Secure identity
   - SSN is entered in a dedicated page with no unrelated fields or third-party
     scripts.
   - After save, every ordinary response exposes only present/missing and last four.
5. Required uploads
   - Requirements are assigned from Phase 3 document types and snapshotted onto
     the onboarding case.
   - Upload, rejection, replacement, and expiry states are explicit.
6. Signatures and acknowledgements
   - Each requirement references an immutable template version and content digest.
   - Signing records consent text version, signer, timestamp, and document version.
   - The product does not claim that a generic acknowledgement satisfies a
     particular legal form without separate review.
7. Availability
   - Employee submits recurring availability and explicitly confirms it.
   - Zero restrictions is a valid confirmed state, not an ambiguous empty table.
8. Review and submit
   - The employee reviews status, submits once all required gates are complete,
     and enters awaiting-review state.
   - Required documents and signatures block activation. Save-and-exit is allowed,
     but it does not grant normal app access.
9. Manager review
   - Authorized managers approve reviewable items or request a specific correction.
   - Managers see SSN status only; they cannot reveal or copy the SSN.
   - Activation occurs only after all required gates and reviews pass.

## Resumability contract

Do not persist a client-controlled current step as the source of truth.

The server returns ordered requirements and derives:

- complete,
- incomplete,
- needs_attention,
- awaiting_review,
- approved.

The client opens the first actionable incomplete requirement. A rejected or
expired document takes priority over the normal sequence. Draft form state may be
local component state, but persisted completion comes only from canonical rows.

## State model

Employee onboarding case:

- invited
- in_progress
- submitted
- changes_requested
- approved
- cancelled

Membership:

- invited
- pending_activation
- active
- suspended

The onboarding case and membership are separate. Completing a form must never
silently activate workspace access.

## Proposed data ownership

- employee_profiles
  - Workspace-owned identity link and public display fields.
- employee_private_profiles
  - Workspace and employee scoped address, date of birth, phone, and emergency contact.
- employee_onboarding_cases
  - Employee, workspace, state, revision, submitted/approved timestamps.
- employee_onboarding_requirements
  - Snapshotted requirement type, source version, required flag, status, and ordering.
- employee_sensitive_identifiers
  - Ciphertext, encrypted data key, key version, nonce, authentication tag, last four,
    created/updated timestamps. No plaintext or reversible value in ordinary columns.
- employee_documents
  - Private storage metadata and review state; object paths include workspace and employee.
- employee_signature_envelopes
  - Immutable template version, content digest, consent version, signer, signed timestamp.
- employee_availability_versions
  - Submitted recurring rules and confirmation metadata.
- onboarding_events
  - Append-only state transitions and security-relevant outcomes without sensitive payloads.

Every business row carries workspace_id. Self-service routes resolve employee_id
from the authenticated user and workspace membership; they never trust a
client-supplied employee ID.

## Endpoint contract

Self-scoped:

- GET /v1/me/onboarding
- PATCH /v1/me/onboarding/profile
- PUT /v1/me/onboarding/ssn
- GET /v1/me/onboarding/ssn/status
- POST /v1/me/onboarding/documents/upload-url
- POST /v1/me/onboarding/documents/confirm
- POST /v1/me/onboarding/signatures/:requirementId/sign
- PUT /v1/me/onboarding/availability
- POST /v1/me/onboarding/submit

Manager-scoped:

- GET /v1/workspaces/:workspaceId/employees/:employeeId/onboarding
- POST /v1/workspaces/:workspaceId/employees/:employeeId/request-changes
- POST /v1/workspaces/:workspaceId/employees/:employeeId/approve

Mutations use an expected revision or idempotency key. Conflict responses are
explicit and do not overwrite newer employee submissions.

## SSN security design

### Collection boundary

- The browser sends SSN only to a dedicated Fastify endpoint over TLS.
- No direct Supabase table access, browser RPC, localStorage, sessionStorage,
  query string, analytics event, error payload, or client log may contain it.
- The request schema accepts one normalized nine-digit value and discards the raw
  request object after encryption.
- Rate limits, CSRF/origin checks, a fresh authenticated session, and workspace
  pending-membership checks are required.

### Storage boundary

- Encrypt in the API application layer with authenticated encryption.
- Use envelope encryption: a per-record data encryption key protects the SSN and
  an external KMS/HSM key protects that data key.
- Store key version and encrypted data key beside ciphertext, never the KMS key.
- Hosted implementation is blocked until an external key-management provider,
  rotation procedure, backup recovery procedure, and compromise runbook are approved.
- Local development uses synthetic values only. Real SSNs are forbidden in seeds,
  fixtures, screenshots, recordings, support tickets, and test output.

### Read boundary

- Initial product surfaces return only missing/present and last four.
- No manager, owner, support, analytics, search, export, or normal profile endpoint
  receives plaintext.
- A future payroll-handoff service may request decryption only through a dedicated
  service identity, purpose-bound authorization, and immutable audit event.
- Human reveal is excluded from the first implementation. A future break-glass
  flow requires step-up authentication, reason capture, short-lived access, and review.

### Logging and operations

- Redaction tests cover request bodies, validation failures, tracing, audit metadata,
  error monitoring, and database query logs.
- Audit records contain actor, workspace, employee, action, outcome, timestamp, and
  key version, but never plaintext, ciphertext, or last four.
- Key rotation must support re-wrapping or re-encryption without product downtime.
- Retention and deletion periods must be approved before production collection.

## Threats that must have tests

- Cross-tenant reads and writes.
- Employee A targeting employee B through IDs or storage paths.
- Manager or owner attempting plaintext SSN access.
- Database dump without KMS access.
- KMS failure, rotation, disabled key, and stale key version.
- Sensitive values in logs, traces, errors, analytics, URLs, or browser storage.
- Duplicate/replayed submit and signature requests.
- Requirement changes after an invite was sent.
- Rejected document reopening a completed workflow.
- Invite accepted successfully while bootstrap context remains stale.

## Research-derived decisions

- Employee self-entry reduces employer data handling and is common in current
  onboarding products.
- Mobile and desktop should share the same section model, including camera-friendly
  document upload.
- Required sections show explicit completion and support review-and-submit.
- Document uploads and signature acknowledgements are separate requirement types.
- Manager review is a distinct phase after employee submission.
- Sensitive information should be minimized, access-limited, and protected with
  keys separated from encrypted data.

Primary references:

- NIST SP 800-122:
  https://csrc.nist.gov/pubs/sp/800/122/final
- FTC Protecting Personal Information:
  https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business
- OWASP Cryptographic Storage:
  https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- Deputy US paperless onboarding:
  https://help.deputy.com/hc/en-au/articles/9683052105615-Complete-your-paperless-onboarding-form-US
- Gusto employee account setup:
  https://support.gusto.com/article/100201315100000/set-up-your-gusto-account-for-employees

## Preserved from the old product

- Server-derived completion.
- Resume at the first incomplete or attention-required step.
- Self-scoped profile, availability, and document operations.
- Explicit document rejection and replacement states.

## Changed or improved

- Approved step order includes privacy, dedicated SSN, signatures, and review.
- Required documents and signatures block activation.
- Membership activation is separate from form completion.
- Requirement snapshots prevent mid-onboarding configuration drift.
- SSN is isolated behind API-only envelope encryption and no-human-reveal defaults.

## Intentionally omitted

- The old Shift Ticket visual design and component hierarchy.
- Client-persisted step pointers.
- Finish-later access to the normal employee application.
- Payroll, banking, tax forms, work-authorization decisions, and compliance engines.
- Any assumption that a stored signature automatically satisfies a legal requirement.

## Approval gates

Before Phase 4 implementation:

1. Approve this product flow and activation model.
2. Complete Phase 3 locations, jobs, permissions, and document types.
3. Choose and approve the hosted external KMS/HSM provider.
4. Approve SSN retention, deletion, incident response, and future payroll-handoff purpose.
5. Approve which signature templates are simple acknowledgements versus separately
   reviewed legal forms.
