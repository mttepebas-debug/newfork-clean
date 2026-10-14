---
name: vite-stale-dep-cache-gates-missing
description: A permission-gated button silently missing after checking out a new commit into a worktree is usually vite's stale node_modules/.vite cache, not a real regression
metadata:
  type: reference
---

When starting a fresh `vite` dev server in a worktree right after checking out a new commit (e.g. a fix commit the coordinator just sent), a button gated by `gates.<action>` (from `can(context, ...)`) can silently fail to render while ungated sibling buttons in the same toolbar render fine — even though the API's `/v1/context` response genuinely includes the needed permission (verified directly via `fetch`). Confirmed cause once: vite was serving an optimized-deps cache built before the checkout. Fix: stop the vite process and restart with `--force` (or `rm -rf apps/web/node_modules/.vite` first), then hard-navigate.

**How to apply:** if a review at a fresh commit shows a feature/button missing that the diff clearly adds, don't jump to "still not fixed" — first check network requests for real errors (`ERR_CONNECTION_REFUSED` etc. are usually stale ports, not this), then directly fetch the permission-check endpoint (e.g. `/v1/context`) and confirm the action is actually present in `actions`/`permissions`, then restart vite with `--force` before concluding anything about the code.

Related: [[local-fixture-login-and-screenshots]].
