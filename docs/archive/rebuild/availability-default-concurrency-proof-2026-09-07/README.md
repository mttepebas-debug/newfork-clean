# Availability and default-hours concurrency proof

The reproducible verifier is `supabase/verification/availability_default_application_races_local.py`. Run it from the repository root with `python supabase/verification/availability_default_application_races_local.py`. It accepts only the owned, labelled, network-isolated `newfork-availability-schedule-verify-20260907` container; it does not reset or use the main development or hosted database.

All **8 scenarios passed** against the local schema through `20260909031002`, including the existing Shift Exchange publication wrapper. Each case uses two independent PostgreSQL connections. The verifier observes the first connection holding its completed operation before commit (`PgSleep`) and the second connection actually waiting on the relevant row transaction or workspace advisory lock. Passing requires exact persisted-state and error-code assertions after both connections finish, not timing alone.

| First transaction | Concurrent transaction | Observed wait | Committed outcome |
| --- | --- | --- | --- |
| Apply reviewed default hours | Settings changes defaults | `transactionid` | Both succeed in order. Edit retains reviewed **11:00–17:00 / revision 2**; Settings advances to **10:00–18:00 / revision 3**. One immutable application review. |
| Settings changes defaults | Apply old review | `transactionid` | Apply rejects with **40001**. Edit remains **12:00–16:00 / revision 1**; no review is committed. |
| Apply reviewed default hours | Remove employee using the old session revision | `advisory` | Assignment mutation rejects with **40001**. Employee remains assigned to the edited shift; one review. |
| Remove employee from the edit | Apply old review | `advisory` | Apply rejects with **40001**. Employee remains removed from the edit, original reference hours remain, and no review is committed. |
| Employee changes Monday availability | Publish the earlier reviewed draft | `advisory` | Publication rejects with **PT409**, the publication wrapper's stale-preview response. Availability reaches version 2; no assignment is published. |
| Publish reviewed draft | Employee changes availability for that week | `advisory` | Availability rejects with **23514**. Availability stays at version 1; the employee's published **12:00–16:00** assignment remains. |
| Apply current defaults in an open edit | Publish its previously saved draft | `advisory` | Both succeed in order. The edit is **11:00–17:00 / revision 2**; the saved draft publishes **12:00–16:00**. Applying defaults does not publish the edit. |
| Publish the saved draft | Apply reviewed defaults in its open edit | `advisory` | Both succeed in order. Published employee responsibility remains **12:00–16:00**; only the edit becomes **11:00–17:00 / revision 2**. |

[Machine-readable results and scoped fixture IDs](race-result.json) record the exact observed waits, operation outcomes and state before cleanup. Active fixture edit leases were discarded; only fixture shift types, jobs and locations were archived. Original workspace availability policies were restored. Immutable reviews/publications and synthetic employee history remain in the isolated verification database.

The first run correctly rejected stale publication but exposed a test expectation mismatch: this endpoint maps `40001` to `PT409`. The verifier was corrected to assert that existing API boundary, then the complete eight-case run passed. No product migration or application behavior was changed in this slice.

This is local database concurrency evidence. It does not establish browser behavior under connection loss, concurrent leave dispositions/Line Up changes, divergent draft recovery, DST/multi-location batch completeness, full current migration-chain replay or hosted/release readiness. Those remain part of the active Availability v2 goal.
