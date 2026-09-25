---
name: checklist-rpcfailure-raw-detail
description: rpcFailure (apps/api/src/http-error.ts) forwards any PG hint as reason and raw PG details as detail; any path that serializes HttpError below 500 sends them
metadata:
  type: project
---

`rpcFailure` puts `error.hint` into `reason` and `error.details` into `detail` unfiltered, and maps unknown SQLSTATEs (PGRST*, 42883, 23503...) to 400. Since BL-128 (2026-09-25) the global error handler sends both for every HttpError below 500, like `workspace-account-routes.ts` `requestError` already did.

**Why:** a constraint violation's details ("Key (x)=(...) already exists", "Failing row contains (...)") and PostgREST schema hints then reach the client. Own-input values only so far, no cross-tenant row seen; flagged Düşük in BL-128 review, rises when FB-6.1 .3a/.3b route schedule writes through rpcFailure.

**How to apply:** when a diff moves a service to `rpcFailure` or a route starts relying on the global handler, ask which SQLSTATEs the RPC can hit besides deliberate RAISEs, and whether a filter (hint must be a machine key, detail only with a deliberate hint, unknown code -> 500) has landed. Related: [[checklist-omitted-input-probe]].
