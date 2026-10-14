---
name: realtime-join-measure
description: How to measure private Realtime channel joins against local Supabase without minting tokens; refused join costs ~5.2 s and stalls concurrent joins on the socket
metadata:
  type: reference
---

- Script: `artifacts/nf-backend/fb61-10/bl115.mjs` (main checkout, gitignored). Signs in seed fixture `owner@newfork.test` by magic link (OTP → mailpit 55324 → verify, `create_user:false`, token never printed), imports supabase-js from `apps/web/node_modules`, reads `apps/web/.env.local`. Second OTP within ~60 s is refused: wait between runs.
- Minting a JWT from the local secret is blocked by the auto-mode classifier; do not try.
- Fixture: owner@newfork.test is `pending_activation` in "Pending Demo" (8ea5d512…), so `shift-exchanges:<that ws>` is refused. No document-restricted person exists locally (2026-09-26).
- Measured 2026-09-26 on realtime v2.112.1: refused join replies CHANNEL_ERROR after ~5.2 s; joins started at the same time on the same socket wait for it (~5.25 s), sequential joins after it are fine (~10 ms). Allowed joins alone ~20-40 ms. The old "later joins dropped" behaviour (BL-115, 2026-09-24) no longer reproduces.
- Channel policies live in `realtime.messages` policies; read them with `pg_policies`. `can(ctx, action)` untargeted = `actor_actions` = same `authz_check` the policy's `rls_can` runs.
