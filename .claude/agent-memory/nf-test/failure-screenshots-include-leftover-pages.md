---
name: failure-screenshots-include-leftover-pages
description: a failed e2e test's test-failed-N.png files can include unrelated pages left open by EARLIER tests in the same single-worker run, not just this test's own pages -- check which screenshot actually matches the failing test before reading it as evidence
metadata:
  type: project
---

`e2e/playwright.config.ts` runs with `workers: 1, fullyParallel: false`, so
every spec file in one invocation shares one `browser` instance. Every
`openPage`/`openSchedule`/`openSchedule` helper across the flow specs (e.g.
`e2e/flows/schedule-publish.spec.ts`, `shift-hub-swap.spec.ts`,
`schedule-multi-location.spec.ts`) does
`await (await browser.newContext()).newPage()` and never closes the context.
Playwright's `screenshot: "only-on-failure"` captures every currently-open
page across the whole browser when ANY test fails -- so a failing test's
`test-failed-1.png` .. `test-failed-N.png` can include pages left open by
completely unrelated EARLIER tests in the same run, in addition to (or
instead of) the failing test's own pages.

**Why:** investigating a shift-hub-swap.spec.ts (BL-180/FB-6.1.5) failure
from a merge run at `newfork-wt/fb61-merge/e2e/test-results/...`, of 5
`test-failed-*.png` only #4 and #5 were this test's own two pages (Ayse's,
Mehmet's); #1-#3 were leftovers from `schedule-publish.spec.ts` (a "Add shift
label" dialog mid-duplicate-key-error) and `schedule-multi-location.spec.ts`
(a "Publish another draft" menu open) and an Employee Hub page -- all real
pages from tests that had already finished and reported `ok`. Reading #1 as
"the failing test's state" would have sent the investigation into the wrong
component entirely.

**How to apply:** when reading failure screenshots from a full-suite (not
single-file) run, match each one to the test by its visible URL/heading/data
(e.g. the world name in the sidebar is the same for the whole run, but the
route and dialog content are not) before treating its content as evidence.
The relevant screenshot is usually the one whose page matches an action the
FAILING test's own source actually performs.
