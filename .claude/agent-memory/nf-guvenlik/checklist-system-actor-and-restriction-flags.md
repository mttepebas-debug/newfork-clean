---
name: checklist-system-actor-and-restriction-flags
description: When the system acts (actor null) check the record and the notification filter separately; "restriction aside" flags may only drop one reason and only affect list membership (FB-6.3)
metadata:
  type: feedback
---

1. `coalesce(actor, X)` puts X both into the record and into the notification's `is distinct from actor` filter. Check them separately: the record should name an approver that still counts; the notification should leave nobody out (FB-6.3 @7f09ad4b: the only Kadıköy manager never heard her shifts opened).
2. A "restriction aside" flag (FB-6.3 `documents_aside` in `time_off_location_staffed`) must drop exactly one reason (`document_blocked`) and only decide list membership; every permission (vote, decide, counting a vote) still asks the core without the flag.
3. The `authz_catalog` "own scope logic" regex does not see `state.class` reads; count those by hand.
4. When a list grows (a location now stays in), check every reader that acts on the people in the list: the 12-hour reminder went to nobody for an "unattended" location.

**Why:** FB-6.3 re-reviews 1–2 (2026-10-01) found each of these after the first fix round.
**How to apply:** for any system-settled path, read the record write, the notification recipients and the reminder recipients as three separate questions. Related: [[checklist-cron-poison-row]], [[checklist-no-self-vs-rank-below]].
