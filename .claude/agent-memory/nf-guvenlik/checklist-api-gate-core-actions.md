---
name: checklist-api-gate-core-actions
description: API gate resolveActor+authorize reads core actions (actor_actions); what to probe when routes move onto it (manages=works lockout, dead twin routes, route-table completeness claims)
metadata:
  type: project
---

Since FB-6.1 .3a/.3b (reviewed 2026-09-25, `cfccffe`): `apps/api/src/auth/workspace-context.ts` `resolveActor` (404 authz.not_member; resolver already filters membership.status='active', closed workspace, missing onboarding row) + `authorize(ctx, action)` = `ctx.actions.includes(action)` (403 authz.out_of_scope, detail=action). Fail-closed: schema defaults actions to [].

**Why:** `app_private.actor_actions` gives a manager place/set actions only where `state.manages` = their location assignments (`works`); `membership.all_locations` is ignored by the core. A manager with no assignment gets no schedule.* action and is locked out, where the old permission gate let them in. Document-blocked managers are also refused now (intended, T1).

**How to apply:** when a route family moves onto the gate, ask (1) was e2e run with real fixture managers (vitest mocks the resolver, proves nothing about real actions); (2) did any route keep the old inline gate (`permissions.includes`, `membership.role`) in the same file — a twin; (3) does the "route table" test enumerate registered routes (app.printRoutes/onRoute) or only the rows it lists; (4) an action with no core read twin (templates) mapped to a broader action: is the DB still checking the finer permission, and will the parallel DB step keep it. Related: [[checklist-rpcfailure-raw-detail]], [[checklist-omitted-input-probe]].

can() migrations (FB-6.1.9, 2026-09-26): targetless `can()` = the server's `actor_actions` list; the person-bound rule of `expected()` runs only on the targeted path. When a test session derives `actions` with `expected()`, check a manager was given a location, or its schedule actions come out false.

Page door moved to can() (EKRAN-02 B1a, 2026-10-06, `5bc0874d`): also check the sidebar entry in `apps/web/src/shell/AppShell.tsx` (`anyOf` permission keys) — it stays the twin, so a document-blocked or location-less manager sees the menu item and is bounced. Fail-closed, but name it.
