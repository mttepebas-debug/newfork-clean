---
name: playwright-double-goto-blanks-mobile
description: Two sequential page.goto() calls (base URL then query-param URL) can render a blank body on mobile viewport in Playwright, even though the app has no real bug
metadata:
  type: feedback
---

Doing `page.goto(base)` → `localStorage.setItem(...)` → `page.goto(base + "?query=1")` back to back
can leave `document.body.innerText` empty and the screenshot blank at 390px viewport, with no
console error or pageerror event. This looks like a script/race artifact, not an app bug — a
`page.reload()` after setting localStorage (instead of a second `page.goto` to a different URL)
renders correctly. Also confirmed: clicking the actual toggle button in the UI instead of setting
the URL param directly works fine every time.

**Why:** discovered 2026-09-28 while QA'ing `/app/schedule?hideUnscheduled=true` on schedule-empty-grid
(commit 6d49045/2285ad0) — first mobile screenshot was fully blank, worried it was a real mobile
regression from the fix, but reload/click reproduced the page correctly every time.

**How to apply:** if a Playwright screenshot for this app comes back blank on mobile (390px) after
navigating with a query param, retry with `page.reload()` or a UI click before concluding it's a
real bug — don't report it as a defect on the strength of one double-goto navigation.
