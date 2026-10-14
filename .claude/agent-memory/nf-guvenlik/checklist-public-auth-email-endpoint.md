---
name: checklist-public-auth-email-endpoint
description: Reviewing an unauthenticated email endpoint (password reset, recovery): leak order, Vercel fire-and-forget trap, recovery token_hash is a session
metadata:
  type: feedback
---
Leak check order: 400/503 depend only on input/config → 429 key is email/IP not the account → no branch returns before the fixed wait → log lines carry no email → `generateLink` type is fixed `recovery` (magiclink would create users).
Traps: `api/index.js` hands the request to Fastify and returns; an un-awaited send after the reply can be frozen by Vercel (email silently lost) — await with a timeout under the fixed wait instead. A Supabase recovery `token_hash` is a session on its own (anon key + verifyOtp), so the page is not the only door. `supabase/config.toml` minimum_password_length is 6 while the web asks 8 (BL-161).
**Why:** BL-137 review, 2026-09-26.
**How to apply:** any public auth/email endpoint. See [[checklist-api-gate-core-actions]].
