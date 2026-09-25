---
name: api-gate
description: The one API authorization gate (resolveActor + authorize in apps/api/src/auth/workspace-context.ts), how a route area moves onto it, and the per-route table test that pins each route's action
metadata:
  type: project
---

`resolveActor(authorization, workspaceId | null, resolver)` and `authorize(ctx, action)` live in `apps/api/src/auth/workspace-context.ts` since FB-6.1 .3 (2026-09-25). resolveActor throws 404 `authz.not_member` (no token, no resolver, non-uuid id, null context, other workspace: same answer); authorize reads only `ctx.actions` (app_private.actor_actions) and throws 403 `authz.out_of_scope`, `detail` = action. Schedule routes were the first user; other areas still have route-local gates (33 definitions in the plan's count).

**Why:** CLAUDE.md §9 forbids route-local gates; FOUNDATION-B 4c/Aşama 6 moves each area onto this pair in its own slice.

**How to apply:**
- Gate is the handler's FIRST statement (before zod), so a non-member learns nothing about the schema and the per-route test needs no valid bodies. Pattern: `const context = authorize(await workspaceActor(request, options), "schedule.edit");`.
- Permission → action is not 1:1: `schedule.manage` → `schedule.edit`, `schedule.templates.manage` → `schedule.templates`; there is no read action for templates or for takeover (open decisions, FB-6.1 N4).
- Pin every route with a table like `apps/api/src/schedule/schedule-routes-gate.test.ts` (non-member 404 / all-but-its-action 403 / only-its-action → 400 on bad ids). Changing one route's action makes 2 rows fail.
- Test fixtures that build `ActiveWorkspaceContext` by hand need `actions`; `app.test.ts` owner uses `[...authzActionKeys]`.
- Codemod over multi-line handlers: restrict arg matches to `[^;]*?`, a lazy `[\s\S]*?` swallowed whole neighbouring handlers.
