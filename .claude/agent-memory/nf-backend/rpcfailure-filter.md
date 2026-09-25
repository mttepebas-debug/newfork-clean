---
name: rpcfailure-filter
description: rpcFailure (apps/api/src/http-error.ts) filters hint/details/message since BL-131; unmapped SQLSTATE = 500, so a new deliberate errcode needs a map entry
metadata:
  type: project
---

Since BL-131 (2026-09-25) `rpcFailure` passes `hint` only if it matches the key regex, `details` only beside a valid key and only as a key or uuid, swaps messages with `"` or `^permission denied for` for a plain sentence, and turns any SQLSTATE missing from `statusForPostgresCode` into 500 "Internal server error" (reason/detail dropped).

**Why:** route helpers (`account-security`, `workspace-account`, `onboarding`, `roles` routes) send an HttpError's status + message as-is, so filtering at the source is the only single place.

**How to apply:** before moving a service onto `rpcFailure`, census the errcodes its RPCs raise: `grep -rhoiE "errcode *= *'[A-Z0-9]{5}'" supabase/migrations | sort | uniq -c`. Anything not in the map (e.g. 54000, 0A000 today) becomes a 500. Many services still `throw new Error(error.message)` and bypass the filter entirely.
