---
name: repeat-each-breaks-shared-world-specs
description: playwright --repeat-each fails specs that call tests.publish_week with a fixed week/draft name, because globalSetup only makes one run/world for the whole invocation
metadata:
  type: project
---

`pnpm exec playwright test <file> --repeat-each=N` reruns the same test
function N times, but `e2e/global-setup.ts` builds exactly ONE `tests.world`
run for the whole Playwright invocation (not per repeat). Specs that call
`tests.publish_week(run, weekNumber, ...)` create a schedule draft with a
fixed name ("test world") for that run+week; the second repeat collides with
the first's leftover draft and fails with `ERROR: draft name conflict` from
`save_schedule_edit_session_service` — a harness artifact, not the flakiness
being investigated.

**Why:** discovered while reproducing BL-180
(`e2e/flows/shift-hub-swap.spec.ts`): `--repeat-each=10` gave 1 pass + 9 of
this unrelated error, wasting a run before the cause was clear.

**How to apply:** to run one of these specs N times for flake-hunting, do N
separate `pnpm exec playwright test <file>` invocations (each gets its own
globalSetup run/world) instead of `--repeat-each`. Slower (~28s/run locally)
but each run is independent. Specs whose builder calls use per-test unique
labels (not a fixed week/draft name) may not have this problem — check
whether the spec's own `publish_week`/`publish_week_as` call reuses a fixed
week number before assuming `--repeat-each` is safe.
