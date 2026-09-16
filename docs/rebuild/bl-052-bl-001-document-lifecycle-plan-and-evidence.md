# BL-052 + BL-001 Document lifecycle: implementation and evidence

Owner: task `01a0a77d-272e-7eb1-a405-94e860cc66f0`; delivery/report owner: Newfork Ana Session `01a08788-cdba-72f1-a2aa-9c61c296f5c4`. Started 2026-09-15, local `main` at `a72f589`, shared dirty checkout. Model: GPT-6 Astra / high, because transactional review, privacy, time and access cross several existing domains. No branch/worktree, commit, push, hosted migration or deployment is authorized. Later local-only application approval is recorded below.

## Authorized authenticated runtime acceptance — 2026-09-15 (UTC 2026-09-16)

The main session relayed explicit user approval for the controlled local runtime fixture and confirmed its exact isolation/cleanup plan. This supersedes the earlier pending runtime gate below. No product source change was needed. Existing successful SQL/build checks were not repeated.

- Fixture: two task-owned synthetic Auth accounts (owner/reviewer and manager/employee actor), two disposable organizations with one location/job/employee/case/document requirement each. A had a conditional deadline and overdue restriction; B had an independent optional requirement. Real password sign-in used a new headless Chromium context. No user tabs/session, real organization/file/invite, publication, external email, shared service restart, hosted operation or commit/push was touched.
- Auth/API/Account: both organizations first returned unrestricted document access and Export authorization200 for the same manager. Account A/B selection isolated lists and unmounted the former drawer; legacy notification routing opened the requested document. Cross-organization requirement access returned404, and a foreign requirement link did not open a drawer in B.
- Export runtime: the real empty published Schedule supplied a preview snapshot without any publish action. Actual pre/post-render authorization returned200 and the preview contained a generated PDF blob. Moving only A's fixture deadline into the past changed A access to restricted and Export to403; B retained unrestricted access and Export200. The existing30-second access poll redirected the active Schedule to Account Documents (observed about8.25seconds after the deadline change within that interval), unmounted Export, closed its preview tab and revoked the generated blob URL.
- Completion: while restricted, the actor used the real UI upload-url → signed Storage upload → confirm flow. A signed private download returned the exact tiny generated PNG bytes; cross-organization submission/file download returned404. UI Submit produced pending review and retained the prior restriction. Actual owner review completed the request, restored access and Export200, removed the Account restriction banner, and allowed the browser back into Schedule.
- Real notification link: Submit/review produced two owned document outbox events. Only those exact event IDs were passed through the existing event/recipient/inbox projectors; no global worker/maintenance batch was run. The Account API included the approval notice, and clicking its actual Account inbox action opened the correct completed document and organization. This proves the producer/projector/inbox/link path, not cron scheduling or provider delivery.
- Evidence: `supabase/.temp/bl052-document-runtime/report.json` records44 successful observations including cleanup, zero browser page errors, exact fixture/storage/outbox identities and timestamps; screenshots and the local runner/phases are alongside it. The report retains one harness timing failure: `waitForURL` saw navigation history before React effect cleanup; checking after Account content settled confirmed preview close and URL revocation. This required no source fix. The earlier `setup-attempt-1.json` records a rolled-back fixture insert missing approved-case metadata and complete cleanup of its two Auth accounts; the accepted run reused the standard default case fixture.
- Cleanup PASS: owned browser closed, synthetic sessions revoked, exact generated Storage path removed, both workspace identities verified by ID/name/creator and all their public/private tenant rows removed in transactions without disabling triggers. Both Auth identities were checked against their synthetic emails and deleted; workspace/Auth/storage zero-remnant checks passed. The protected pre-migration backup remains present; the owned restore container had already been removed. No fixture or owned browser resource remains.

This closes the approved **local authenticated runtime gate**, including Account isolation/deep links and restriction-to-Export teardown/re-authorization. No claim is made for an in-flight long render cancellation race, hosted/release acceptance, actual cron/provider delivery or real document email (BL-046). The main session owns shared status records and final delivery.

## Authorized local application gate — 2026-09-15 (UTC 2026-09-16)

The user authorized only the exact19 BL-052 migrations on local Supabase after backup/restore verification. This superseded the earlier shared-DB prohibition for that application only; subsequent runtime authorization and acceptance are recorded above. Product sources remain frozen, with no commit/push/deploy/hosted operation.

- Identity: local project `newfork-clean`, healthy `supabase_db_newfork-clean`, exact container `14db6cdc53a98b3a3e459c17ff0ab9d358d527922b19b79a40c3fc1773348b67`; PostgreSQL17.6/image17.6.1.155, database `postgres`, host55322/container5432. Precheck ledger259/source278; pending exactly19 owned migrations, unknown/applied-owned0, all19 SHA values matched final replay.
- Protected backup: `C:/Users/TheWe/.codex/backups/newfork-clean/bl052-20260916T0210Z`, outside repository with current-owner/SYSTEM-only ACL. Full custom DB archive5431692 bytes plus globals, SHA manifest, TOC3556 and consistent exported-snapshot counts for205 non-system tables. Private artifacts may contain personal/auth data and must never be staged or copied into reports.
- Restore proof: complete owner/ACL-preserving restore to task-owned networknone/noports/no-bind/tmpfs DB; all205 table counts matched (0 differences). First attempt failed because pg_net was not preloaded. Second attempt lost its fresh tmpfs DB on container restart. Corrected approach supplies source preload and cron-disabled settings at initial startup; final restore succeeded. These were isolated environment failures, not shared source writes.
- Populated upgrade rehearsal: exact19 immutable migration files applied successfully, per-file transaction, to the restored local-data copy before shared apply. This adds real current-data upgrade evidence to the earlier empty278 replay and focused legacy4 proof; no broad seed/SQL suite was repeated.
- Apply: immutable private `apply-project` snapshot + `supabase migration up --local --include-all --workdir <private snapshot> --yes`. Include-all was needed only because two pending BL-052 versions precede the already-applied Export grant migration. Immediate exact pending/hash/source-ID guard prevented any other migration scope. CLI succeeded; local ledger now278, pending0, unknown0.
- Readonly postcheck: new lifecycle schema/access RPC/Account helper present. Five service RPCs deny anon/auth EXECUTE and grant service_role. Both document tables enforce RLS and deny direct anon/auth SELECT. Counts in9 existing core identity/workspace/employee/file/envelope/case/requirement/storage tables equal the backup. Existing deadlines0 and suspended requirements0: no legacy deadline/suspension backfill. API5556 health and web5555 returned200; shared service restart/reset/restore was not performed.
- Verified recovery instructions and private manifests/logs are in that directory (`RECOVERY.md`, `backup-manifest.json`, `populated-upgrade-rehearsal.json`, `apply-precheck.json`, `postcheck.json`, `cli-apply.log`). Recovery restores into an isolated database first; destructive shared rollback/cutover is not authorized or automatic. Storage binaries/original server key configuration are retained and untouched.
- Cleanup: exact restore container `813e4d06cee5b1340ca9e8f267e5ddc375daf012cd6cd645cea0c615a2f11593` removed after ID/task-label checks. Backups remain protected. No synthetic runtime auth/org/user/file fixture has been created yet; no user browser tab or auth state changed.

The subsequent local authenticated runtime gate is now complete as recorded above. Local migration/runtime success is not hosted/release proof.

## Final local delivery snapshot — 2026-09-15

Implementation A-D is complete within the approved in_app scope. Local source ownership is released at handoff; this is **not** shared-schema/browser/hosted/release acceptance. The earlier unchecked/pending slice notes below are historical snapshots.

- Shared definition snapshots, explicit Preview/Apply, AND/OR location/global-job targeting, scope exit/reentry/exemption, employee assignment-change preview, draft/Submit/review/rejection/deadline extension, retained renewal approval, conditional onboarding/activation, policy acknowledgement/withdrawal, reinvite isolation and private history are wired through the existing lifecycle and permission seams.
- Settings/Employee drawer reuse the document list/detail; Account Documents has organization selection and Documents/Policies tabs. Failed uploads retain successful draft files and block Submit until retried or removed. A stale assignment-preview response cannot authorize a newer employee edit.
- Canonical Schedule conflicts and actual publication revalidation share one evaluator. Legacy per-definition Block becomes the approved Required confirm default; later explicit central Block is preserved. The populated conversion test found and fixed the former null-actor audit failure using the existing private system audit helper, without changing shared audit schema or inventing a human actor.
- In_app producers use the existing registry/outbox/resolver/worker. Pending/restricted employees can read and act on self-document notices through Account, with current recipient/employee/requirement/workspace checks, matching list/unread/pagination/action scope, neutral organization-tagged summaries and safe links. Actual reviewer notices stay outside the Account self-document branch; security and ordinary workspace behavior remain intact. Real document email remains separate pre-MVP BL-046; delivery_unavailable is preserved.

### Final proof and its boundary

| Proof | Result and boundary |
|---|---|
| Fresh normalized-ACL schema replay | **278 migrations PASS**, final source hashes unchanged. Empty schema-only provider bootstrap in networkless owned scratch; includes the concurrent approved migration inventory, not a clean-HEAD claim. |
| Document SQL/RLS/lifecycle | **17 suites / 295 assertions PASS** on the final replay. Counts contain intentional policy-fixture overlap; these are not 295 independent cases. Access14 includes actual authenticated RLS denial and kiosk clock-in/event persistence. Conflicts20 includes actual publish/confirmation/new-hard-policy denial/resolved publish. Inbox19 and notifications23 cover current self scope and actual reviewer exclusion. |
| Existing Account notification regression | **36/36 PASS** on the final replay; security, workspace isolation and existing preference behavior remain intact. |
| Populated legacy conversion | **4/4 PASS**, separately from empty replay. Executes the real migration conversion statements against a synthetic legacy Block definition in a rolled-back transaction: confirm default, retired adapter, system audit, later explicit Block preservation. This is not a complete production-dataset upgrade rehearsal. |
| API and bundle | Web/API typechecks PASS; API document routes7 + notification worker8 + signature routes5 = **20 PASS**. Production API bundle and geo-tz packaged/missing-path fresh-process checks PASS; no provider requests or deployment. |
| Web | Production build PASS (2358 modules; existing large-chunk warnings). Shared drawer4 PASS including failed upload; EmployeeDrawer31 PASS including current-preview/late-response guard; onboarding13, OwnerOnboarding13, redirect1 and earlier timezone field/location/shared checks remain applicable. Final subsequent edits were text/format only; unchanged web tests were not repeated. |
| Browser renderer | Production document components/CSS with synthetic data: light/dark, desktop/mobile, review stays open, filtered empty state, Escape and drawer bounds PASS, console errors empty. **No real auth/API/storage or Account organization-switch E2E claim.** |
| Cleanup | Exact final container `bbd454ab75d121dc24580d8c2828544c9b69ccb5631122657135b74aac65f403` removed after ID+label verification; users/workspaces0, no ports/binds/persistent volumes, source hashes unchanged. Earlier task containers were also removed by exact identity. Headless browser closed; no user tabs changed. |

Reproduction/evidence: `supabase/verification/document_lifecycle_replay_local.py` (fresh replay, `--legacy-policy-check`); `supabase/verification/document_lifecycle_renderer_browser.mjs`; `supabase/tests/bl052*.test.sql`; reused `supabase/tests/account_notification_scope.test.sql`; ignored local reports under `supabase/.temp/bl052-document-replay/{result.json,focused-tests.json,legacy-policy.json,cleanup.json}` and `supabase/.temp/bl052-document-renderer/result.json` with screenshots. Full `supabase/seed.sql` rehearsal failed at its availability-enforced published-shift fixture and rolled back; it was not edited, and focused self-contained fixtures supplied the kiosk/publication evidence.

### Remaining acceptance gates

- Shared development schema application and the approved local authenticated browser/API/storage gate are complete under the later approvals above, including Account organization selection and notification deep links. The pre-migration compatibility branch is no longer the installed-schema path.
- Hosted migrations, actual cron/provider delivery, release readiness and real document email delivery are not proven. No commit/push/deploy/reset/restart was performed.
- A-D checkmarks mean implemented and locally verified scope. The approved local shared-runtime/browser portion of E is now complete; the main session owns final acceptance and shared status reconciliation. Hosted/release gates remain separate.

### Checkpoint ownership manifest

Shared dirty `main` is preserved. Do not whole-stage the shared files listed below without retaining the other owners' hunks. No branch/worktree was created. The main session owns shared WORK/ROADMAP/BACKLOG/REUSE updates.

| Files | Owned changes / shared boundary |
|---|---|
| `apps/api/src/employees/document-lifecycle-{service,routes,routes.test}.ts` | New document service/API scope, upload/Submit/review/download, policy, extension and assignment preview. |
| `apps/api/src/settings/document-types-{service,routes,routes.test}.ts`; `signature-settings-{service,routes,routes.test}.ts` | Definition lifecycle snapshots, target options, Preview/Apply and policy integration. |
| `apps/api/src/settings/timezone-suggestion{,.test}.ts`; `apps/api/scripts/copy-geo-tz-data.mjs`; `verify-geo-tz-bundle.cjs`; `apps/api/licenses/timezone-data-{NOTICE.md,ODbL.txt}` | Country/postal suggestion and packaged geo-tz boundary data/licensing checks. |
| `apps/api/src/auth/workspace-context{,.test}.ts`; `apps/api/src/notifications/notification-outbox-worker{,.test}.ts` | Request-time document gate/proven pre-migration compatibility; document maintenance hook/failure isolation. |
| `apps/api/src/app.ts` | Document service import/init/register and timezone-suggestion register only. |
| `apps/api/package.json`; `pnpm-lock.yaml`; `api/index.js`; `vercel.json` | geo-tz8.1.8 dependency/copy command/path/includeFiles only. Package/lock ownership already returned. Export dependencies and preexisting cron settings are not owned here. |
| `apps/web/src/account/AccountDocumentsPage.tsx`; `apps/web/src/documents/*` | New scoped completion/review/assignment/access UI; exact new-file list below. |
| `apps/web/src/settings/DocumentsSettingsPage.tsx`; `documents-data.ts`; `SignatureTemplatesSettingsPage.tsx`; `signature-templates-data.ts` | Definition/employee tabs, lifecycle fields/Preview/Apply and policy integration. |
| `apps/web/src/employees/EmployeeDrawer{,.test}.tsx`; `EmployeeOnboardingPage.tsx` | Shared document panel, own onboarding editor, assignment-preview import/Employment placement/Save guard and focused fixtures only. |
| `apps/web/src/App.tsx`; `account/AccountLayout.tsx`; `auth/PermissionRoute.tsx`; `settings/SettingsLayout.tsx` | Documents route/nav, employee_documents.read entry, document access wrapper and protected completion redirect; preserve unrelated route/nav work. |
| `apps/web/src/settings/LocationTimezoneField{,.test}.tsx`; `TimezoneSelect.tsx`; `LocationsSettingsPage{,.test}.tsx`; `apps/web/src/views/OwnerOnboardingPage{,.test}.tsx` | Timezone suggestion/manual validation/stale-response behavior. Short-name hunks in mixed location/owner files remain Export-owned. No current owned diff remains in organization-data.ts (its current diff is Export short-name work). |
| `packages/shared/src/document-lifecycle{,.test}.ts`; `timezones{,.test}.ts`; `index.ts`; `index.test.ts`; `availability-assessment.ts` | Isolated lifecycle/timezone modules, barrel imports, documentAccess, requirement/catalogue/policy fields, IANA input validation and central document conflict reason/rule schema. Export schemas/short-name hunks in the same barrel/test remain other-owner work. |
| `supabase/tests/bl052*.test.sql`; `supabase/verification/document_lifecycle_{replay_local.py,renderer_browser.mjs}`; this plan | Task-owned tests/verification/evidence. Existing account_notification_scope test was reused without edits. |

Exact new document UI files:

- `apps/web/src/documents/DocumentAccessRoute.tsx`
- `apps/web/src/documents/DocumentDefinitionApply.tsx`
- `apps/web/src/documents/DocumentExemptionAction.tsx`
- `apps/web/src/documents/DocumentLifecycleFields.tsx`
- `apps/web/src/documents/DocumentNotificationRedirect.test.ts`
- `apps/web/src/documents/DocumentNotificationRedirect.tsx`
- `apps/web/src/documents/DocumentReviewDrawer.test.tsx`
- `apps/web/src/documents/DocumentReviewDrawer.tsx`
- `apps/web/src/documents/EmployeeAssignmentDocumentPreview.tsx`
- `apps/web/src/documents/EmployeeDocumentPanel.tsx`
- `apps/web/src/documents/EmployeeDocumentsList.tsx`
- `apps/web/src/documents/document-data.ts`
- `apps/web/src/documents/documents.css`

Exact task-owned migrations (19; local DB applied under the later approval above):

- `supabase/migrations/20260915235543_bl052_document_lifecycle.sql`
- `supabase/migrations/20260916001303_bl052_document_definition_snapshots.sql`
- `supabase/migrations/20260916001728_bl052_document_targeting_exemptions.sql`
- `supabase/migrations/20260916003649_bl052_document_definition_targets.sql`
- `supabase/migrations/20260916004604_bl052_document_apply_preview.sql`
- `supabase/migrations/20260916004956_bl052_document_reference_timezone.sql`
- `supabase/migrations/20260916005233_bl052_document_conflict_rules.sql`
- `supabase/migrations/20260916005914_bl052_document_onboarding_integration.sql`
- `supabase/migrations/20260916010450_bl052_document_access.sql`
- `supabase/migrations/20260916010634_bl052_document_dynamic_targeting.sql`
- `supabase/migrations/20260916011008_bl052_document_acknowledgements.sql`
- `supabase/migrations/20260916011615_bl052_document_retained_rehire.sql`
- `supabase/migrations/20260916011654_bl052_policy_assignments.sql`
- `supabase/migrations/20260916012651_bl052_policy_withdrawal.sql`
- `supabase/migrations/20260916012830_bl052_document_correction_drafts.sql`
- `supabase/migrations/20260916013124_bl052_document_notifications.sql`
- `supabase/migrations/20260916013608_bl052_document_deadline_extension.sql`
- `supabase/migrations/20260916013848_bl052_document_employee_assignment_preview.sql`
- `supabase/migrations/20260916015551_bl052_document_account_inbox.sql`

Reusable map input for main: shared EmployeeDocumentsList/DocumentReviewDrawer and LifecycleAssignmentFields; app_private canonical target matcher and document access/timezone helpers; neutral self-notification Account extension; isolated replay adapter with populated legacy conversion proof. Existing SQL functions and frontend schemas remain authoritative; this record is evidence/ownership, not a second implementation source.

## Approved contract and precedence

The task's approved decisions supersede conflicting statements in [employee onboarding decisions, sections 6–9 and acceptance matrix](employee-invite-onboarding-decisions-2026-09-09.md). That document remains the source for unchanged file review, targeting, policy acceptance and privacy rules; it is not copied here. Explicit changes:

- Settings Documents has Document settings / Employee documents text tabs matching Acknowledgements. The employee list includes missing obligations and a shared review drawer. Decision leaves drawer open; Next is explicit and follows current filters. No bulk approval.

- Account Documents is permanent, includes Documents / Policies & Agreements, one organization at a time, current organization initially. Employee-private data never becomes a global pool.

- Optional has no conflict/access barrier. Required unresolved obligations default to confirmation. Conditional active grace defaults/floors to warning, elapsed grace to confirmation; later severity cannot be softer. Severity belongs solely to Conflict handling, evaluated at the target shift instant.

- Grace defaults to seven days, starts at onboarding activation or active assignment, and pauses only on real Submit. Reject requires reason and full (default) or remaining correction time, with actor/revision/deadline/choice audit. Remaining is unavailable if none remains.

- Valid approved versions survive renewal drafts/pending/rejection. Timely pending renewal after old expiry keeps access but carries pending-review conflict. Rejection starts the selected correction window if access was not suspended; previously suspended access remains suspended until its blockers resolve.

- Suspension is configurable and OFF by default. Applying Required to active employees with suspension requires a delivery deadline. Conflict starts immediately; suspension starts after the deadline. Only the relevant organization's normal work screens are restricted; completion surfaces/global Account/other organizations remain accessible.

- Existing assignments retain snapshots. Changes to obligations/timers/suspension require impact preview and explicit Apply. Legacy conflict severity migrates to the new central defaults (including former Block -> Required confirm); this does not authorize deadline/suspension backfill.

## Ownership and integration gates

Main session approved document-owned files, new isolated document shared modules, and new BL-052 migration files. Shared index document/timezone hunks were explicitly transferred; preserve Export and location short-name hunks. AppShell, SchedulePage and schedule-service remain Export-owned. API package/lock were transferred for geo-tz 8.1.8 and released back after the timezone slice. App.tsx, SettingsLayout, AccountLayout route/nav hunks require the exact list reported before editing. Global styles require exact selectors agreed first; use existing classes or a document-local stylesheet. Local DB application/replay requires a separate coordinated window, with isolated capacity plan. Shared WORK/BACKLOG/ROADMAP/REUSE are not edited here.

## Initial source map and observed gaps (historical planning baseline)

| Concern | Reuse seam | Change needed |
|---|---|---|
| Definition catalogue | `settings/DocumentsSettingsPage.tsx`, `documents-data.ts`, API `settings/document-types-*`, shared documentType schemas | Explicit optional/required/conditional, targeting, assignment scope, period/suspension/fields; preview/apply rather than silent overwrite |
| Obligation identity/snapshots | `employee_onboarding_requirements` linked to case/workspace/employee | Preserve identity; add lifecycle snapshot, revision, effective deadline/pause/suspension/removal/exemption, current submitted/approved version pointers |
| File storage/history | `employee_documents`, private `employee-onboarding` bucket, `employees/onboarding-service.ts` | Current confirm creates review immediately and supersedes all versions. Separate drafts/submission; multi-file version membership, per-file decisions, preserve approved version |
| Review/privacy | `EmployeeDrawer.tsx`, onboarding review/download RPC family, role permission scopes | Shared document review surface and document-only permission gate, stale version/revision checks, reason and correction choice |
| Self service | `/v1/me/onboarding`, AccountLayout and AccountPageHeader | Organization-scoped persistent document family, own history/download/submit/policy acceptance even while document-suspended |
| Assignment | initialization snapshots and employee assignment tables | Independent employee location/global-job AND/OR targeting, additive named employees, dedup, future/all-active scope, dynamic exit/reentry and persistent exemption |
| Schedule | BL-064 assessment adapter and BL-068 Conflict handling | Feed canonical obligation state into existing engine; no second evaluator |
| Notifications | existing outbox/resolver/worker | Daily org-local 09:00 digest, 30/7/1 expiry and review/access events, transactional dedup, Account deep link |

Existing safe formats are PDF/JPEG/PNG/WebP and 10 MiB max. Current service verifies storage metadata, not malware scanning or HEIC conversion. Neither capability will be advertised; content verification must be explicit in final evidence. Existing requirement/case revisions and actor binding are reused; deadline decisions use server time and UTC instants with organization-zone presentation.

## Data and API design

Extend existing requirements rather than introduce a parallel obligation engine. Lifecycle settings are snapshotted onto assignment. Existing employee_documents rows remain file/version history; a submission record groups files and carries immutable submitted metadata plus revision. A requirement independently references its current submitted revision and latest approved submission. Draft uploads never change those pointers or stop a clock. Review commits Keep/Discard, metadata, decision, deadline and audit atomically. Superseded reviews return a refresh conflict.

Use the existing document-types API family for definition save, impact preview/apply and archive choices. Extend the onboarding/document API family for own organization-scoped list/detail, draft files, Submit, conditional reason and policy acceptance; manager list/detail/review/exemption/deadline operations bind actor/workspace/employee/requirement. The database owns scope, version validation, deadlines, access effects and audit. Manager-on-behalf upload is absent. Private download resolves authorized retained file references then mints the existing short-lived URL.

Expose a typed isolated shared document lifecycle module before barrel integration. Include requirement/target/settings snapshots, file/submission/detail/list schemas and revisioned command schemas. Status buttons derive from server state: All / Needs review / Missing / Expired / Completed. Rejected and active grace map to Missing with distinct labels. Missing rows come from obligations, never a file-only join.

## Delivery and acceptance checklist

- [x] A: source/decision mapping; shared data and RPC contracts, ownership agreement.

- [x] B: snapshots + explicit application/targeting/removal/exemption; draft/submit/review, correction choice and immutable audit; renewal/access and first-onboarding rules.

- [x] C: definition sections General / Who needs it / Time & review; two Settings tabs, employee filters/sort/detail/Next, Employee drawer reuse; Account two tabs/org selector/history.

- [x] D: central conflict integration and legacy severity migration; request-time org restriction; outbox events/digests/deep links.

- [x] E — approved local gate: focused domain/API/SQL/RLS, isolated replay, coordinated local migration, authenticated desktop Auth/API/Storage/Account isolation and notification links, restriction-to-Export teardown/re-authorization, exact fixture cleanup and final report. The main session reviewed and accepted this local scope and recorded BL-052/001 as locally done.

E proof boundary: light/dark/mobile coverage comes from the synthetic production-component renderer; the authenticated runtime flow used desktop Chromium and does not establish authenticated light/dark/mobile parity. Hosted/release, the full seed rehearsal, actual cron/provider/email delivery and the in-flight long-render cancellation race remain separate, unproven gates as detailed above.

Risk-based proof must cover Optional/Required/Conditional × auto/review; independent location/global-job targeting, department-job relation and explicit apply snapshots; first Submit and conditional rejection bypass; deadline/shift instant/DST boundaries; draft versus Submit pause; both rejection periods and exhausted remaining; valid-old renewal, pending expiry and rejected renewal; multiple blockers and sticky prior suspension; employee/tenant/link privacy; suspended completion access; stale review; discard/history references; retries and notification dedup. UI proof includes missing rows/status counts, empty headers, filters/search/sort/focus, drawer staying open and Next, organization selector, responsive/light/dark.

## Historical slice evidence (superseded by final delivery snapshot above)

### Later user decisions relayed by main session

- Target groups now support All conditions (AND, default) / Any condition (OR). OR evaluates only populated groups, deduplicates employees, preserves named additive people, and never widens authorization scope. Superseding decision: jobs are organization-wide employee assignments across every assigned location. No paired location-job table. Department-job relation remains intact; AND department/job must match a single assigned job.

- Every onboarding location has its own required timezone; reuse existing `locations.timezone`. Add country/postal suggestion with manual override and a shared validated IANA selector. No hardcoded Los Angeles fallback or overwriting saved/manual choices. OwnerOnboardingPage, LocationsSettingsPage and organization-data location hunks transferred from Export; short-name WIP must remain. Approved suggestion: country/postal only to Zippopotam.us; geo-tz 8.1.8 exact boundary lookup on the server, manual selection authoritative. Workspace-level timezone is not approved. Approved: one employee/org daily 09:00 digest uses employee primary location timezone. Account/review/access expiry checks use the same primary timezone; Schedule retains expiry_date versus target shift scheduled_date. No user/browser/UTC fallback. Approved exception: remote/excluded employees without an active primary location may have an explicit admin-selected document-only IANA timezone. Primary takes precedence when present; there is no silent fallback.

### Slice progress (not full acceptance)

- Shared `document-lifecycle.ts` defines lifecycle/target/command/read contracts; initial focused tests 4/4 PASS before subsequent AND/OR addition.

- New document API uses verified token actor, separate own/manager audiences, scoped detail/download, draft upload, submit/review; private storage constants reused. Header signature and actual-byte size checks added (not malware scanning). API typecheck and focused route/content tests 7/7 PASS.

- Initial Settings tabs, employee table filters/sort/detail, explicit Next and Account org selector are wired. Employee table/Settings text tabs/Account header/CatalogDrawer reused. Browser acceptance and legacy Employee drawer/onboarding integration remain open.

- Isolated networkless task container: `73065f7b1fe0d8146977fede5afb599906521ad7d72ff1df2f02ce887f1b8cca`; no bind mounts/ports/user rows. Schema-only bootstrap and existing replay runner reused. 259 migrations replayed, snapshot hashes unchanged at that run; scratch postgres needed migration-owner privilege for provider storage tables. Shared DB never changed. Initial failed startup container removed after ID+label verification.

- Focused SQL 25/25 PASS after correcting test expiry fixture from UTC current_date to explicit Los Angeles date. Covers draft/submit clock, preserved old approval through draft/pending/rejection, stale review, pending expiry/access, sticky prior suspension, retained files and basic grants. This is not yet full cross-tenant, remaining-time, DST, notification or E2E acceptance.

- Web typecheck: initial Account query function error corrected; next run blocked only by concurrent ExportController.test.tsx lines 29/44 (void mock argument). Reported to main; unrelated file untouched.

- Isolated container is still in use for targeted verification; must be removed by exact ID+labels before final handoff. Additional SQL changes require updating evidence; earlier replay is not proof for later SQL.

2026-09-15: read-only source inspection and initial ownership handshake only. Supabase CLI is 2.109.0. No migration has run, no DB baseline PASS assumed, no tests or browser acceptance claimed. Initial source gap: upload immediately creates review and supersedes prior accepted documents; persistent Account Documents is absent. Supabase current RLS documentation/changelog consulted; no hosted configuration or provider state changed.

Meaningful slice reports and final report must be sent explicitly to the main session; this file is the sole task implementation/evidence record. Local success never establishes hosted provider/cron delivery or release readiness.

### 2026-09-15 later slice evidence

- Timezone forms: empty initial timezone; shared valid IANA selector, country/postal suggestion, preserve saved/manual selections, ignore stale responses, clear stale automatic values when postal changes. Field5/5, Locations3/3, OwnerOnboarding13/13 PASS; shared timezone2/2 + lifecycle5/5 PASS. Web/API/shared typechecks passed before later definition additions; current web typecheck also passed after those additions.

- Packaging: exact geo-tz8.1.8, only1970 binary26,229,853B plus separate code MIT/data ODbL notices. API build:vercel PASS. `apps/api/scripts/verify-geo-tz-bundle.cjs` launches fresh processes outside repo cwd and instruments binary reads through the actual bundle/handler env. Packaged=>America/Phoenix; missing path=>manual/unavailable, explicit env retained, no node_modules data read. `api/index.js` and `vercel.json` contain the approved narrow asset packaging changes. No deploy/browser acceptance. Sources: https://vercel.com/docs/project-configuration/vercel-json#functions ; https://github.com/evansiroky/node-geo-tz ; https://www.zippopotam.us/ . Package/lock ownership released.

- Scratch incremental schema updated with snapshot/read functions, targeting/exemption migration and definition-target selector migration. SQL45/45 PASS: previous30 plus global job/location targeting, AND department-job identity, OR empty group semantics, additive people, exemption/restart/idempotent audit/self-denial/stale checks. This is incremental scratch evidence, NOT a fresh final replay. Normalized shared-default ACL replay remains required.

- Definition UI now includes optional/required/conditional, AND/OR scoped target groups, assignment scope, delivery/suspension and extra fields. Selector RPC and save validation use the same actor-scoped options. API existing document-type route5/5 PASS. Preview/Apply implementation and full definition UI tests are still pending.

- Shared review drawer now includes manager exemption/removal with reason, scoped service, preserved drawer and close lock; renewal pending is displayed as Needs review while the valid-old approval still drives eligibility. Exemption notification and focused drawer tests remain pending.

- Primary invariant evidence: current `20260914100042_bl051_employee_scope_completion.sql` requires primary for normal employees, deliberately permits no assignment for remote/excluded employees. No fallback timezone/configuration field added without the user's decision. Expiry dates and grace UTC instants will not be rewritten when location timezone changes.

- Current blockers/open implementation: explicit impact Preview/Apply/dynamic assignment, legacy onboarding integration/autoactivation, conflict severity adapter and access aggregate, policies/signatures, notification producers/digest,  comprehensive privacy/time/UI browser proof and scratch cleanup. No BL052 migration applied to shared local DB; no commit/push/release.

### Approved primary-less timezone exception and later integration

- User approved explicit admin document-only timezone for remote/excluded employees without an active primary location. `employee_profiles.document_timezone` stores that setting; shared `document_employee_timezone` resolves active primary first, then the explicit setting only for this permitted exception. Invalid/missing configuration is explicit. Neither reference changes nor primary restoration rewrites expiry_date, historical approvals or existing grace instants.

- New reference-timezone SQL15/15 PASS: LA/NY same-instant date difference, preserved expiry/deadline, no secondary/user/UTC fallback, manager authorization, valid IANA, primary precedence and retained manual setting. Submit/Approve now use the same resolver; these source changes require later regression of the original lifecycle suites.

- Preview/Apply SQL10/10 PASS, shared drawer UI3/3 PASS, web/API typecheck PASS before later timezone/conflict additions. Permanent sources: `supabase/tests/bl052_document_apply.test.sql`, `apps/web/src/documents/DocumentReviewDrawer.test.tsx`.

- Central conflict SQL14/14 PASS: Optional has no conflict, Required default confirmation and configured warning/block, server assignment denial, approved expiry against target shift calendar date, exact UTC conditional grace boundary, severity floors/monotonicity, exemption and legacy partial-policy preservation. The existing `assess_weekly_shift_availability` is extended in place with document reasons; existing fingerprint/publication paths remain authoritative. Publication regression and UI schema checks remain pending.

- New migrations were applied ONLY to the owned scratch container, incrementally. These counts describe separate focused runs; they are not a combined final suite or a fresh replay claim.

### Onboarding, targeting and context rollout integration

- Added explicit Submit and initial conditional deferral to the shared document editor, reused inline in EmployeeOnboardingPage. The retired automatic-submit upload RPC and versionless review return PT409. Case locks precede requirement locks. Existing accepted files remain projected for legacy readers.

- Onboarding SQL24/24 passed before later conditional pending-review/resubmit/final-approval snapshot tightening. Lifecycle45 and remaining6 passed in separate runs at that earlier snapshot. Drawer3 and onboarding13 UI tests passed; later policy UI changes still need checking.

- Dynamic target SQL10/10 passed: definition Save does not mutate existing assignments, global job at second location matches, scope exit closes deadline/blocker, reentry reuses the same obligation and retained period snapshot, persistent exemption and dedup. Deferred triggers evaluate the transaction's final assignment state. Automated audit events explicitly record actor_kind=system.

- Request-time organization access gate and canonical permission/RLS helpers are implemented. Multiple-blocker/access test remains in progress; no shared schema acceptance.

- User-observed Workspace unavailable regression was caused by the new access RPC being called before shared migrations. Readonly shared DB confirmed both RPC and lifecycle schema absent; actual PostgREST response was PGRST202 for exactly public.get_employee_document_access_service(actor_user_id, target_workspace_id). The resolver now allows only that exact missing-function response plus a separate zero-row lifecycle_revision probe with 42703/missing exact column. Installed schema, missing dependency (42883), timeout/permission/network and invalid response remain fail-closed. Pre-migration context omits documentAccess. User confirmed workspace recovery with "duzeldi". Targeted resolver21/21 PASS. No shared migration or restart.

- Policy content/current evidence and text download are being connected to the existing acknowledgement envelope. Matching full name, recent authentication, exact content digest and scoped actor are enforced. Policy assignment Preview/Apply, withdrawal/history, notification integration and fresh replay remain open.

### Latest scope decision and incremental evidence (2026-09-15)

- User option A, relayed by main: complete this slice with in_app notifications. Real document notification email is separate pre-MVP BL-046. Preserve delivery_unavailable; no new provider/cron/deferred email queue here. Existing Auth/invite transactional email is separate. No app+email delivery acceptance claim.
- Policy14/14 and rehire23/23 PASS in separate scratch runs; rehire includes the14 policy checks. Legacy unconditional case/kind/source uniqueness suppressed the fresh assignment despite the retired partial index; pending migration now replaces both. Old file/envelope retention, fresh current assignment, new/old-unlinked privacy and scoped reviewer history passed.
- Tightened onboarding35/35 PASS supersedes the earlier24-test snapshot: Conditional pending/rejected cannot bypass via reason; rejection needs case re-Submit; final-approval snapshot gates activation.
- Withdrawal22/22 PASS (includes14 policy checks): before first case Submit only, retained evidence, withdrawn idempotency replay denied, fresh acknowledgement/history. Correction draft9/9 PASS: Keep references and metadata copied, reviewed history immutable, clock unpaused, draft removal preserves history, optional all-Discard skip.
- Deadline extension8/8 PASS: scoped reviewer/reason, explicit days added to existing deadline, configured full period preserved, stale/self/elapsed-blocker denial and audit. No new suspension reset policy.
- Notification21/21 PASS after processing revalidation: local09 spring/fall DST, employee/org/date dedup including timezone changes, Optional/exempt/pending-review exclusion, version30/7/1 expiry, existing outbox lease/process/inbox, pending self-document-only exception, email denied, stale reviewer/unlinked/resolved/retired revalidation.
- Worker8 + document routes7 + signature routes5 = API20 PASS in one run. Independent shift/document maintenance failure reporting preserves unrelated delivery. Web drawer3/onboarding13/Owner13 passed; redirect test initially failed due absent direct zod dependency, corrected to reuse shared ID schema; rerun pending.
- Remaining: employee assignment-change impact preview; normalized-ACL fresh replay/affected regressions; real RLS/kiosk/publication proof; focused browser/UI and exact owned-container cleanup. These are incremental local proofs, not final acceptance. Shared DB remains unmigrated; no restart/commit/push/deploy.
