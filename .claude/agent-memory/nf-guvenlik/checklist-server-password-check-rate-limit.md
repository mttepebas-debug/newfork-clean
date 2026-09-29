---
name: checklist-server-password-check-rate-limit
description: API-side signInWithPassword checks all come from one server IP, so they share GoTrue's per-IP sign-in bucket (30 per 5 min); check for brute-force limits, shared-bucket lockout, and 429 mapped to "wrong password"
metadata:
  type: feedback
---

When the API proves a password by calling `signInWithPassword` on a throwaway client, every user's check leaves from the API server's IP. They all draw on one GoTrue bucket: `[auth.rate_limit] sign_in_sign_ups = 30` per 5 minutes per IP, the same as the hosted default. The API itself has no rate limit (no @fastify/rate-limit, no attempt counter).

**Why:** SEC-003 part A (4e0d5a2b, 2026-09-28). Closing a workspace and handing over ownership moved to a server-side password check.
- An attacker holding an open session gets about 8,600 guesses a day.
- One person typing wrong passwords blocks every user's password-gated actions for 5 minutes.
- `createPasswordVerifier` turned any sign-in error, 429 and 5xx included, into 403 `session.password_incorrect`. Someone with the right password is told it did not match.

**How to apply:** for any new server-side password check, ask three things.
1. Is there a per-account failed-attempt limit, stored in the DB? An in-memory counter does not work on Vercel.
2. Are 429 and 5xx kept apart from a wrong password, the way `apps/api/src/auth/verify-user.ts` does it?
3. Does the check reuse the one helper (`apps/api/src/auth/verify-password.ts`) instead of adding another copy?

Related: [[checklist-sibling-endpoints-same-guard]].
