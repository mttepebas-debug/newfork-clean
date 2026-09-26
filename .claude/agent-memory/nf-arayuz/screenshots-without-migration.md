---
name: screenshots-without-migration
description: How nf-arayuz takes real-app screenshots when the backend migration is not on the local DB, and worktree git traps met on 2026-09-26 (BL-080)
metadata:
  type: reference
---

- Starting on another role's branch: in the agent worktree `git reset --hard` and `git checkout -b <new> <branch>` were refused by the auto-mode guard. `git merge --no-edit <branch>` (clean tree) worked and is non-destructive.
- Screenshots: Playwright from the npx cache (see the shared memory "local-fixture-login-and-screenshots") + magic-link session for `owner@newfork.test` (seed fixture). When an endpoint's migration is not applied locally, `page.route(/\/v1\/account\/.../)` answers it in the test browser; the rest of the page stays real. Say in the report which parts were answered this way.
- A fresh owner reaches setup step 1 via a new `…@newfork.test` magic-link account → /workspaces → "Create your workspace" (plain /onboarding redirects back to /workspaces).
- Account ▸ Workspaces transfer: after the password re-check the page reloads its list (`useEffect` on `[context, account?.userId]` in `apps/web/src/account/WorkspacesPage.tsx` calls `setError(null)`), so any transfer refusal disappears after ~1 s. Take the screenshot the moment the alert appears.
- Scratch scripts: bash heredoc + python edits outside the worktree get refused as "too complex to verify"; edit scratch files with Edit/Write instead.
