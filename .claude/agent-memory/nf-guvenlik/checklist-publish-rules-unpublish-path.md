---
name: checklist-publish-rules-unpublish-path
description: A publish-time rule that joins only the 'current' publication goes blind after unpublish_schedule_service; probe approve -> unpublish -> publish stale draft
metadata:
  type: feedback
---

A rule judged at publish time against "the last publication" (BL-198 `shift_exchange_draft_undoes`, 2026-09-27) usually joins `schedule_location_publications.status = 'current'`. `unpublish_schedule_service` sets that row to 'unpublished', so after an unpublish the rule sees nothing and a stale draft republishes the old state silently.

**Why:** BL-198 review (0a69dae): swap approved -> week unpublished -> first draft edited back to Ali -> preview publish_ready, 0 findings, Ali back on Tuesday. The same on main, so not a regression, but the user's rule "never undone" does not hold on that path.

**How to apply:** for any publish or preflight rule, add the probe approve/change -> unpublish -> publish stale draft. Writers of published shifts (2026-09-27): publish, unpublish, decide_time_off_with_assignments, shift_exchanges_command, terminate_employee. Also check timestamp comparisons (`now()` is transaction start; a transaction that waited for the workspace lock reads as earlier). Related: [[feedback-trial-sources-and-drift]].
