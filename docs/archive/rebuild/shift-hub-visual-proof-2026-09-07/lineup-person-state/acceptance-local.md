# AT28: Line Up person-state reconciliation — local acceptance

## Outcome

The selected replacement becomes the canonical and linked live Line Up owner only after manager final approval. Old employee overrides, call-off and personal notes are cleared. Placement segments and independent legacy work remain intact. Assignment-only shares preserve previously shared placement; unrelated live placement WIP stays unpublished.

A real regression was reproduced: if the previous share omitted a called-off shift, final approval succeeded without including the replacement in the shared Line Up. Four assertions failed before the fix (preview allowed, missing resolution reason, final succeeded, owner changed). Migration `20260909034000_shift_exchange_shared_assignment_guard.sql` now blocks that final and explains the required manager reconciliation. It checks both swap halves. A never-shared day is still allowed and does not manufacture a share.

Manager recovery: review the missing assignment and explicitly share it, then reopen/recheck the pending exchange and approve. This preserves employee consent while material shift details stay unchanged. The recovery share and final assignment delta are separate immutable versions. Existing native sharing and exchange final use the same workspace advisory lock (921).

## Evidence from this turn

- `shift_exchange_lineup_person_state.test.sql`: **39/39 pgTAP PASS**, transaction rolled back with dedicated actors/locations and availability recorded before publication. Includes old override, call-off, note, split placement, independent legacy row, immutable prior snapshot, draft placement isolation, editing-disabled canonical read, omitted source block, manager recovery, counterpart swap block and unchanged owners on failure.
- Combined focused SQL run: **93/93 PASS** across person-state (39), requested-publication (12), shared-travel policy (42).
- `ShiftExchangeHub.test.tsx`: **48/48 PASS**. The new manager test displays the resolution reason and keeps approval disabled even when employee eligibility is otherwise valid; clicking cannot dispatch a command. No false employee eligibility error is shown.
- Focused ESLint and web TypeScript check: PASS.
- Local Supabase security advisors: no issues. Internal helper has no browser/client EXECUTE; existing preview ACL is preserved.
- Migration applied only to local DB and local migration history marked applied. No hosted migration or deployment.

## Failed attempts and limits

The first person-state fixture wrongly expected native sharing to include a called-off shift; native sharing legitimately omits it. Correcting that setup exposed the separate product regression above. One later assertion used a nonexistent transfer table; it now checks the existing `shift_exchange_events` transfer_completed event. Both errors were in the test setup and the final 39-test run passes.

The additional old `shift_exchanges_v1.test.sql` suite stopped after four passing assertions with `Employee profile required`, before reaching this change. It uses shared seed employees that no longer satisfy its setup. That attempted combined run was **not** a pass; no seed was reactivated and no production guard weakened. The independent focused 93-test run is the passing evidence.

New reconciliation behavior has SQL and component proof. A real-auth browser walkthrough of the omitted-share recovery remains to be recorded. Native assistive technology, human employee/manager UAT, hosted rollout and pilot remain open under their existing acceptance gates. AT28 LOCAL describes the technical person-state checks, not overall release readiness.
