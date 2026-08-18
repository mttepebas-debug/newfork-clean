# Phase 3E: Acknowledgement Templates

## Delivered

- Workspace-scoped acknowledgement template directory and reusable retention policies.
- Separate `signature_templates.read` and `signature_templates.manage` permissions with Owner/Admin grants and manage-to-read dependency enforcement.
- Draft retention policy create/edit, explicit approval, immutable approved terms, and archive/restore.
- Acknowledgement draft create/edit, server-generated SHA-256 content digest, explicit publication, immutable published versions, later-version drafts, and archive/restore.
- Fail-closed publication unless the selected retention policy is approved and active.
- Permission-aware Settings navigation, route guard, template/retention tabs, content preview, publication confirmation, and responsive desktop/mobile UI.
- Tenant-isolated RLS, narrow security-definer RPCs, direct authenticated write denial, and audit events without policy content.

## Preserved

- Phase 2B server-derived onboarding progress and immutable requirement snapshot direction.
- Required acknowledgements as future activation gates without coupling form completion to membership activation.
- Exact-port application sidebar and calendar behavior.
- Existing workspace role assignment, custom-role permissions, and Settings visibility model.

## Changed And Improved

- Acknowledgement content is a versioned workspace prerequisite rather than a checkbox embedded in employee onboarding.
- Publication is an explicit irreversible transition; editing published content creates a new draft version.
- Retention terms must be separately drafted and approved before publication.
- Activation blocking is valid only for onboarding-required templates in shared validation, RPC validation, and database constraints.
- Preview shows the exact canonical text, version, effective date, retention reference, and digest prefix.

## Intentionally Omitted

- Employee assignment, typed-name acknowledgement, receipts, evidence envelopes, manager review, manual follow-up, and activation state changes; these belong to Phase 4.
- Evidence-package object storage, download links, legal holds, purge jobs, and post-employment access.
- Signature pads, biometric analysis, regulated government/tax/immigration/payroll forms, and legal sufficiency claims.
- `electronic_signature` and `external_process` publication; only `acknowledgement` is enabled.
- A universal retention duration or automatically supplied legal authority.

## Research-Derived Decisions

- Published canonical text is normalized server-side and hashed before storage.
- Published versions and approved retention terms are protected by database triggers even from privileged mutation paths.
- Retention approval records the acting user and timestamp but does not represent a Newfork legal opinion.
- Workspace users must supply the applicable scope, duration, and authority reference; missing approval blocks publication.
- Employee execution remains a Phase 4 vertical slice so no unused evidence tables or storage paths were introduced.

## Verification

- Blank local Supabase reset applied the complete migration chain and seed successfully.
- Six pgTAP suites passed with 137 assertions, including permissions, fail-closed publication, digest generation, privileged immutability, versioning, custom-role access, and cross-tenant denial.
- Shared, UI, API, and web suites passed with 26 tests.
- Root typecheck and lint passed before final delivery verification.
- Authenticated owner browser smoke covered retention creation/approval, blocked publication, successful publication, preview, new-version draft, archive/restore, and desktop/mobile layouts.
- Production build passed; the existing main-chunk warning remains at approximately 577 kB, while the Acknowledgements page is a separate approximately 20 kB lazy chunk.
