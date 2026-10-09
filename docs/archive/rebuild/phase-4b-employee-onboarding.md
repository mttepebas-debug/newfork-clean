# Phase 4B employee onboarding implementation

Status: implemented and locally verified.

## Delivered

- Invitation preview, account creation/sign-in continuation, and canonical
  `/invite/accept` routing without losing the invitation token.
- A mobile-first employee onboarding flow for private profile data, encrypted SSN
  capture, private documents, version-bound policy acknowledgements, explicit
  seven-day availability, review, and submission.
- Snapshot-based onboarding requirements so document and acknowledgement catalog
  changes do not silently alter an employee's in-progress case.
- Envelope encryption for SSNs using AWS KMS data keys in production and a clearly
  isolated synthetic provider for local development. Plaintext SSNs are never
  persisted or returned.
- Private Storage signed upload/download boundaries, media and size validation,
  document versioning, optional review, and manager access permissions.
- Revision-checked service RPCs, append-only onboarding events, restricted tables,
  and atomic manager activation that remains fail-closed until sensitive hosted
  infrastructure is explicitly marked ready.
- Manager review inside the approved six-section Employee Drawer shell. Managers
  see completion and SSN-presence status, never the SSN value.

## Product boundary

Preserved from the approved exact-port contract:

- The Employee Drawer shell, six sections, deep-link behavior, desktop dimensions,
  and full-width mobile behavior.
- Pending activation remains distinct from an active employee membership.

Changed or improved:

- Employee onboarding is a dedicated self-service route family rather than a
  manager-operated legacy form.
- Sensitive identity data uses envelope encryption with stable encryption context;
  private documents use short-lived signed URLs instead of public objects.
- Requirements snapshot the configured document and acknowledgement versions.
- Every weekday receives an explicit availability state, and manager activation is
  one revision-checked transaction.

Research-derived decisions:

- AWS KMS data keys and encryption context define the production SSN boundary.
- Supabase private buckets and short-lived signed URLs define document transfer.
- Acknowledgements bind actor, authenticated timestamp, content digest, intent,
  membership, and idempotency key without claiming a general-purpose e-signature.

Intentionally omitted from Phase 4B:

- Payroll, tax calculation, compliance engines, I-9/E-Verify workflows, and legacy
  time-entry behavior.
- Human SSN reveal or decryption endpoints.
- A general-purpose electronic-signature claim, identity proofing, and jurisdictional
  legal sufficiency claims.
- Hosted production enablement before KMS, private Storage, malware scanning,
  evidence retention/legal hold, and backup/recovery gates are proven.

## Verification record

- Supabase resets cleanly from zero, including the synthetic pending employee seed.
- Eight pgTAP files pass with 204 tests. Phase 4B coverage includes RLS denial,
  snapshot idempotency, profile and encrypted identity writes, private document
  confirmation, acknowledgement evidence, seven-day availability, submission,
  permission checks, fail-closed readiness, and atomic activation.
- Root typecheck, lint, 36 unit/component tests, and production build pass.
- A real local Supabase password session returns the pending onboarding projection
  through the API with no plaintext SSN or encryption material.
- Browser smoke covers profile, secure identity, and availability at desktop and
  mobile breakpoints with no horizontal overflow or console errors.

The production build still reports the existing main-chunk size warning. The
onboarding route is independently lazy-loaded as a 15.30 kB minified chunk.

## Hosted gates

Local verification is not hosted production proof. Production activation must stay
disabled until real AWS KMS permissions and rotation, the hosted private Storage
bucket, malware scanning/quarantine, acknowledgement evidence packaging, retention
and legal-hold behavior, and backup/recovery are exercised in the target environment.

## Next approval gate

The next rebuild phase must be discussed and approved before implementation.
