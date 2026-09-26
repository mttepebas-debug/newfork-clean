---
name: checklist-vacuous-wiring-tests
description: Before approving a fix, ask "if I delete the fix's key line, which test fails?" — mocked modules and floors longer than the work make tests vacuous
metadata:
  type: feedback
---
For each fix, name its key line and the test that would go red without it. Two ways the answer is "none": (1) the line lives in a module the test mocks wholesale (ResetPasswordPage.test mocked ../lib/supabase, so setItem/removeItem never ran); (2) a timing test whose floor is longer than the awaited work, so un-awaiting it still passes (floor 120 ms, send 40 ms). Ask the author to prove red by deleting the line once.
**Why:** BL-137 fix round (2026-09-26): code was right, but both fixes could silently revert.
**How to apply:** every fix review, especially wiring/await/storage lines. See [[checklist-public-auth-email-endpoint]].

Chained copy sites (A → B → C): a red made with only A missing does not prove B and C, because downstream cells fall in cascade. Make one variant per site that removes only that site (sed the column list out of that line range), run each through the same rollback runner, and show each line has a red cell of its own (BL-158: 6 sites, 6 signatures).
