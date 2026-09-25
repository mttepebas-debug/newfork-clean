# BL-055 Gate 3: producer and delivery matrix

Snapshot: 2026-09-14, local `main`. Scope is Gate 3 only. The latest user decision removes the visible **Account security messages** settings section; mandatory account delivery remains in the backend and existing inbox.

## Delivery boundaries

- `account`: `account_notification_items`, recipient is the authenticated account; no workspace ID. Allow-listed security audit events project transactionally into this table. SELECT RLS is `user_id = auth.uid()`; writes and actor-taking RPCs are service-only. API Auth operations derive the actor with `getUser(accessToken)`.
- `workspace`: existing outbox → event → authorized recipient → policy → inbox pipeline. Its membership, resource, location and staffing revalidation remain intact.
- Inbox RPCs merge the account's rows and the selected workspace's rows **before** cursor pagination. Read-all changes only that account plus the selected workspace. `/v1/account/notifications` and `/account/inbox` support account-only access.
- Both subscriptions exist: account/user-keyed Realtime and workspace-keyed Realtime. Query keys include the account ID. The account Security action does not require workspace access.
- All current catalog entries support in-app only. There is **no generic workspace email sender**. Email switches therefore stay unavailable even for verified accounts; unverified accounts get the verification reason first. Both reasons link to Account > Security.

## Current producer → catalog → recipient/scope → channel → status

| Producer / authoritative boundary | Catalog key(s) | Recipient and scope | Channel / actual delivery |
|---|---|---|---|
| Announcement publish, `publish_announcement_service` | `communications.announcement.available` | Active targeted roles and visible locations; workspace | In-app: outbox, current audience revalidation |
| Time-off submit/decision, `notify_schedule_request_event_service` | `requests.time_off.submitted`, `requests.time_off.status_changed` | Scoped reviewers / requesting employee, actor exclusions; workspace | In-app: outbox |
| Shift-change lifecycle and exchange producers | `requests.shift_change.submitted`, `requests.shift_change.status_changed` | Scoped reviewers / participants; workspace | In-app: outbox, exchange lifecycle reconciliation |
| Time correction submit/decision | `time_tracking.correction.submitted`, `time_tracking.correction.decided` | Authorized correction reviewers / requesting employee; workspace | In-app: outbox |
| Schedule publish | `schedule.published` | Active published shift assignees in publish scope; workspace | In-app: atomic publish/outbox |
| Staffing proposal/operation bridge, `lineup_staffing_enqueue_notification` | `schedule.staffing.offer_updated`, `schedule.staffing.offer_closed`, `schedule.staffing.assignment_changed` | Current staffing participants/managers; workspace | In-app: legacy domain row → outbox → revalidated inbox; existing dedupe/read state retained |
| Document expiry sync, `sync_expiring_document_todos_service` | `people.employee_document.expiring` | Scoped document reviewers; workspace | In-app: outbox; automatic invocation still requires configured worker/cron |
| Availability lifecycle, `availability_notify` | `availability.review_required`, `availability.status_changed` | Scoped reviewers / employee, actor exclusions; workspace | In-app: outbox; SQL catalog/registry present. These two keys remain outside the older shared TypeScript workspace inventory/display map |
| Account deletion cancels a pending employee invite | `security.account_invitation_cancelled` | Workspace access managers; **workspace**, not the deleting account | Mandatory in-app: existing outbox; Gate 3 adds the missing published template and registry entry |
| Successful Auth email-change request through Account API | `security.account.email_change_requested` | Authenticated account only; account | Mandatory in-app: API → security audit → transactional projection. Confirmation email: Supabase Auth, independent of workspace preferences |
| Real pending email cancellation | `security.account.email_change_cancelled` | Authenticated account only; account | Mandatory in-app: cancellation + audit + projection in one SQL transaction. Idempotent no-pending cancellation emits nothing |
| Successful password update through Account API | `security.account.password_changed` | Authenticated account only; account | Mandatory in-app: API → audit → projection. Other-session revocation is still attempted even if notification recording fails |
| Successful other-session sign-out through Account API | `security.account.sessions_revoked` | Authenticated account only; account | Mandatory in-app: API → audit → projection; no device/IP/session secrets in payload |
| Accepted account deletion / token-based restoration | `security.account.deletion_requested`, `security.account.deletion_restored` | Deleting/restored account only; account | Mandatory in-app: existing deletion/restoration transaction → audit → projection. Pending deleted accounts regain inbox access after restoration |

The database producer registry now describes `outbox_v1` and `account_audit_v1` explicitly. Gate 3 fills the proven missing staffing/invitation registry rows. Reconciliation checks all active types against their delivery boundary and published template.

## Direct email paths outside the notification outbox

| Producer | Recipient / scope | Actual channel and status |
|---|---|---|
| Supabase Auth signup verification, email change/resend and password recovery | Address managed by Auth; account | Auth email. Controlled local email-change path captured two confirmations in Mailpit. This is not evidence of hosted provider delivery |
| Account deletion initial/resend + day-7/last-24h worker reminders | Account recovery address; account | Dedicated Resend adapter and leased recovery worker. Gate 3 removes the development no-op success when provider configuration is absent; failure now remains retryable/unacknowledged. No generic outbox or preference switch applies |
| Employee invitation, `invitation-service.ts` | Validated invited address; workspace invitation | Dedicated Resend adapter. Existing invite/reminder behavior, not a catalog preference email channel |
| Schedule export cron, `schedule-export-cron.ts` | Configured authorized export recipients; workspace | Dedicated Resend adapter. Export delivery is outside this notification preferences plan |

Auth events occurring outside the application's successful API calls (external login, OAuth/provider changes, direct password reset or verified-email completion) are **not** fabricated from browser auth-state callbacks. There is no verified durable Auth webhook/audit ingestion path in this checkout. Auth security emails can still be sent by Auth itself. The API Auth mutation and subsequent audit RPC are two systems, so a process/network failure between them remains a delivery limitation; no distributed-transaction claim is made.

## Defaults and preservation

- Existing accounts are recorded additively in a private legacy-default cohort; no stored preference rows are rewritten.
- New account email fallback is enabled only for `action_required` types; informative email fallback is disabled. Actual unavailable channels remain locked.
- Type overrides, category overrides and inheritance remain supported. User patches merge channel keys, preserving omitted push values. The UI preserves existing cadence, timezone, quiet hours and safe-preview values and offers one Save/Discard pair.
- Account events cannot be disabled by a workspace type preference. Account catalog entries are excluded from organization settings and workspace preference rows.

## Verification and handoff

Focused SQL: account scope/isolation/mandatory events/defaults/preservation/catalog parity; existing preference resolver and outbox retry; deletion/cancellation lifecycle. Focused API: authenticated actor derivation, invalid-session rejection, safe event payloads, failed Auth operations, recovery no-provider failure, worker retry. Shared contracts and existing workspace catalog checks. Web: selector, latest section removal, mixed master/individual/single Save, email lock and preservation, inbox and cross-tab refresh.

Local browser script: `supabase/verification/account_notification_browser.mjs` (bundled Playwright fallback because `agent-browser` CLI was absent). It creates only disposable local fixtures, uses the existing checkout-owned 5555/5556, signs in normally, and keeps credentials/tokens in memory. Screenshots and machine-readable output: `supabase/.temp/gate3-notifications/`. Fixtures and their captured mail are removed in cleanup. No real account deletion/ownership transfer is used.

Final focused proof:

- SQL: `account_notification_scope.test.sql` **36**, `account_security_deletion_lifecycle.test.sql` **37**, `notification_user_preferences.test.sql` **8**, `notification_outbox_relay.test.sql` **28**; **109 unique assertions PASS**.
- API: account security service **11**, account security routes **6**, recovery worker **3**, notification settings service **4**, notification outbox worker **6**, communication routes **2**; **32 tests PASS**.
- Shared: notification settings **8** and catalog **7**; **15 tests PASS**.
- Web: NotificationPreferencesPage **6**, preference data **2**, communication data **2**, notification page subset **2**, cross-tab inbox refresh **1**; **13 tests PASS**.
- Real local browser: **19 checks PASS**, desktop 1440 and mobile 390, two/single/zero accessible workspaces, same global event across workspaces, live account Realtime refresh, Security action without workspace, locked email, draft/Discard and zero page errors. Local Mailpit captured two Auth confirmations; all owned fixture rows/mail were removed.
- Shared/API/web typechecks **PASS**; local Supabase security advisor **no issues**; `git diff --check` **PASS**; `supabase migration up --local` reports **no pending migrations**. Final browser fixture workspace count is **0**. No broad suite/build or clean-database replay claim.

 Broad `AppShellNotificationBadge` navigation tests also exposed five failures in existing Requests/Availability role fixtures; focused notification refresh passed. Those unrelated navigation fixtures are not changed by Gate 3.

Remaining boundaries: hosted migration/deploy, real external provider smoke, production cron/worker scheduling, and integrated Gate 4 UAT remain separate. The absence of generic workspace email is represented truthfully by the lock. No branch/worktree, commit, push, deploy or hosted migration is created by this task. WORK/COORDINATION remain owned by the main task.

### UI ownership handoff

Notification preference files changed by Gate 3: `apps/web/src/account/NotificationPreferencesPage.tsx`, `NotificationPreferencesPage.test.tsx`, and `notification-preferences-data.ts`. Gate 3 does not change `notification-preferences.css` or redesign row/group/column/accordion layout. The next UI task should preserve the new user-keyed query, server defaults, additive save behavior, one-workspace selector rule, email reason/Security link and removed account-security section.

## Official Supabase review

Reviewed the current [changelog](https://supabase.com/changelog), [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), [Postgres Changes guide](https://supabase.com/docs/guides/realtime/postgres-changes), and [Auth password guide](https://supabase.com/docs/guides/auth/passwords). Relevant changelog items: [Realtime schema lockdown](https://supabase.com/changelog/realtime-schema-locked-down-against-modification) and [self-hosted Auth URL prefix](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1). Gate 3 adds a public-table publication, uses explicit RLS/grants, and does not alter Realtime-owned objects or gateway configuration.
