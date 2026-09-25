# Phase 3D: Documents And Support

## Delivered

- Workspace-scoped document type catalog with title, description, onboarding requirement, review requirement, accepted formats, expiry tracking, and ordering.
- Separate `documents.read` and `documents.manage` permissions with built-in Owner/Admin grants and validated manage-to-read dependency.
- Transactional document type create, edit, reorder, archive, and restore RPCs with audit events and tenant-isolated RLS.
- Permission-aware Settings entry, navigation rail, route guards, and default redirect behavior.
- Responsive Documents settings UI with read-only and management states.
- Support settings UI with configurable email contact and privacy-minimal workspace diagnostics copy.

## Preserved

- Exact-port application sidebar and calendar behavior.
- Existing workspace role resolution, built-in role protections, and custom-role assignment model.
- The new product's metadata-first employee onboarding contract from Phase 2B.
- Archive-over-delete behavior for workspace configuration records.

## Changed And Improved

- Settings is no longer gated only by `workspace.manage`; users can enter it when they have role or document read authority and see only permitted sections.
- Document requirements are explicit workspace data rather than legacy form or compliance presets.
- Document management authority is independent from organization and role administration.
- Support diagnostics omit user identity, email, tokens, and file contents and are copied only on an explicit action.
- Support contact configuration uses `VITE_SUPPORT_EMAIL` instead of a legacy organization-specific address.

## Intentionally Omitted

- Employee document uploads, file storage, download links, replacements, review queues, and activation blocking; these belong to Phase 4 Employees.
- Electronic signatures and acknowledgements; their content, evidence, and retention contract requires separate approval before Phase 4 implementation.
- I-9, W-4, or other jurisdiction-specific presets and compliance claims.
- Schedule blocking based on document completion or expiry.
- FAQ, ticket portal, phone, or chat links without configured live destinations.

## Research-Derived Decisions

- Document types contain only workflow metadata; employee-specific requirements will snapshot the relevant definition when onboarding starts.
- Accepted formats are a constrained enum (`pdf`, `jpeg`, `png`, `webp`) shared by client validation and database checks.
- Manage permission implies read permission in both shared role validation and a deferred database constraint trigger.
- Document writes use narrow security-definer RPCs with explicit effective-permission checks, locked search paths, audit records, and tenant-scoped lookups.
- The Support surface exposes only stable workspace context and leaves diagnostics unattached to email by default.

## Verification

- Blank local Supabase reset applied the complete migration chain and seed successfully.
- Five pgTAP suites passed with 92 assertions, including permissions, CRUD, audit, ordering, archive/restore, validation, custom-role access, and cross-tenant denial.
- Shared, UI, API, and web unit suites passed with 23 tests across the packages.
- Root typecheck, lint, unit tests, and production build passed.
- Authenticated owner browser smoke covered onboarding, document create/edit/reorder/archive/restore, Support diagnostics copy, and desktop/mobile layouts.
- The existing Vite warning for the approximately 575 kB main JavaScript chunk remains; Documents and Support are separately lazy-loaded.
