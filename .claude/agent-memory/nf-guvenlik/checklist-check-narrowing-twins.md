---
name: checklist-check-narrowing-twins
description: When a CHECK narrows a value, look for its twins: shared zod schema and web options, the service's error path, JSON null passing a ->> equality, chained red cells, data conversion in the adding half
metadata:
  type: feedback
---
A CHECK that narrows allowed values (FB-6.1.6: approved_time_off only 'block') leaves twins behind: (1) the shared zod schema and the web option list still offer the old values; (2) the service may throw `new Error(error.message)` instead of `rpcFailure`, so the constraint name reaches the browser; (3) `col->>'k' = 'v'` is NULL for JSON null and a CHECK passes on NULL — look for a trigger that rejects it; (4) in a single test file, one red cell can make later cells red in cascade — count independent reds, not red lines; (5) OPS-03: when the shared zod schema stops accepting the old value, the data conversion (old -> new) must be in the ADDING migration, not the removing one, or every reader `.parse` 500s between deploy and the removing migration (FB-6.7 C, `warn` -> `confirm_once`, 2026-10-02).
**Why:** FB-6.1.6 review, 2026-09-26.
**How to apply:** any migration that narrows a CHECK or enum. See [[checklist-vacuous-wiring-tests]].
