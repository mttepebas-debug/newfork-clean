---
name: checklist-sibling-endpoints-same-guard
description: A new guard added to one endpoint of a family (accept) must be checked on its siblings (list, decline, count) that match the same subject, especially the ones that write
metadata:
  type: feedback
---

When a change adds a guard to one way of acting on a record, list every other function that finds the same record by the same key and check whether it needs the guard too. Pay most attention to the siblings that write.

**Why:** SEC-003 step 1 (34fc2075, 2026-09-28). `accept_employee_invitation_for_user` started asking for `email_confirmed_at`. Three siblings match the same invitation by the account's email, and none of them asked:
- `list_pending_employee_invitations_for_account_service`
- `decline_employee_invitation_service`
- `count_account_attention_service`

An unconfirmed account holding someone else's address could still see that person's invitation and decline it. Decline is a write on someone else's record.

**How to apply:** find the siblings with `pg_proc` and a `prosrc` regex on the table plus the match key, for example `employee_invitations` with `.email =`. Print for each one whether it contains the new guard. Report missing guards on writing siblings as Orta. Say which barrier matters in practice (here the hosted "Confirm email" setting) so the coordinator can choose between this step and the backlog.

The same holds in the web: a change to a grouping or identity key needs a check for copies of it.

**Why:** BL-199 (34a9de49, 2026-09-28). `unassignedShiftStackKey` in `ScheduleRow.tsx` gained the note. Its copy `scheduleBadgeMeasurementStackKey` in `useScheduleBadgeMeasurements.tsx` did not. The rows drew two cards, but the measurement still counted one ×2 stack.

**How to apply:** grep for the key's field list, not the function name. Here that was `clock-hidden|same-day` joined with `|`. Ask for one exported function in place of the copy. Related: [[checklist-protected-record-all-columns]].
