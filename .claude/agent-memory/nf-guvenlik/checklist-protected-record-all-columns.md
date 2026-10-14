---
name: checklist-protected-record-all-columns
description: A "kept" system record or assignment rule must guard every column that carries its meaning and the ending of the row, not only delete/archive/insert
metadata:
  type: feedback
---

When a migration protects a system row (system_key) or an assignment, probe every write that changes what the row *means*, not only delete, archive and the key itself. Also probe ending an assignment (`ended_at`) as well as creating it.

**Why:** BL-218 .2 (b5b5bfde, 2026-09-27). The trigger blocked delete, archive and system_key changes on Management/Owner. But the browser could still move the Owner job to another department with `department_id`, and then it could be marked primary. The Owner-job rule returned early when `ended_at` was set. A diff-based `save_employee` then ended the owner's Owner job silently whenever the drawer left it out of `job_ids`.

**How to apply:** make a probe list per protected row:
- each relationship column (department_id, location_id, workspace_id);
- ending the assignment (`ended_at`);
- a save whose list omits the row.

Run each as `tests.as_browser` and as the service, in one rolled-back trial. For a backfill `insert … on conflict (system_key)`, check the other unique indexes too (active-name index), locally and before any hosted push. Related: [[checklist-publish-rules-unpublish-path]], [[feedback-trial-sources-and-drift]].
