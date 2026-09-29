---
name: rpcfailure-filter
description: rpcFailure (apps/api/src/http-error.ts) filters hint/details/message since BL-131; unmapped SQLSTATE = 500, so a new deliberate errcode needs a map entry
metadata:
  type: project
---

Since BL-131 (2026-09-25) `rpcFailure` passes `hint` only if it matches the key regex, `details` only beside a valid key and only as a key or uuid, swaps messages with `"` or `^permission denied for` for a plain sentence, and turns any SQLSTATE missing from `statusForPostgresCode` into 500 "Internal server error" (reason/detail dropped).

**Why:** route helpers (`account-security`, `workspace-account`, `onboarding`, `roles` routes) send an HttpError's status + message as-is, so filtering at the source is the only single place.

**How to apply:** before moving a service onto `rpcFailure`, census the errcodes its RPCs raise: `grep -rhoiE "errcode *= *'[A-Z0-9]{5}'" supabase/migrations | sort | uniq -c`. Anything not in the map (e.g. 54000, 0A000 today) becomes a 500. Many services still `throw new Error(error.message)` and bypass the filter entirely (BL-134; Schedule moved in FB-6.1 .3).

Trap: a RAISE whose message is JSON (Schedule past-edit) gets swapped to a plain sentence; read the payload from `error.cause.message` at the route (`schedule-routes.ts` `pastEditPayload`), never widen the filter. Moving a service onto rpcFailure breaks tests that mock `Object.assign(new Error(m), {code})` or read `.code`: the thrown error has `pgCode`/`statusCode`; mock with `rpcFailure({ message, code })`. 23514/22023 become 400 (Schedule used 422).

Trap (BL-080, 2026-09-26): nf-db reports often say "23514 → API 422". It is 400 — `statusForPostgresCode` maps 23514/22023/P0001 all to 400, and there is no 422 anywhere. Screens must key on `reason` (hint), not on 400 vs 422. Changing that map is http-error.ts, often fenced off for another task; say so in the report instead.

Bridge (BL-218, 2026-09-28): a hint-carrying refusal that must reach a screen through a service still on plain `Error` (employee save/create, jobs management) goes through `managementAndOwnerRefusal(error) ?? new Error(...)`, and that route's helper passes `HttpError` status + reason first; only the BL-218 hints in `managementAndOwnerRefusals` take it (seven today: four 23514 keep-rules, three 22023 save refusals), so `authz.*` on those routes stays on the old wording path. Settings → Jobs archive/save are browser-direct supabase-js writes (`organization-data.ts` `message()`), so a DB refusal there never touches the API — map it on the web too. Readable sentences for hints live in shared (`managementAndOwnerRefusals`).
