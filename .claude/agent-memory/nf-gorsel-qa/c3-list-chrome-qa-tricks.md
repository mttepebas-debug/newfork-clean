---
name: c3-list-chrome-qa-tricks
description: EKRAN-02 C3 QA tricks: toast-over-drawer via dynamic import of ui dist, dark-border pitfalls on search wrappers, first vite --force load needs 4 s
metadata:
  type: reference
---
2026-10-06, world e2e1791296671674 (`e2e/.world.json` in the worktree), sign-in with zeynep (admin).
- Trigger a toast without mutating data: open Settings -> Jobs -> Add -> Job drawer, then `page.evaluate(async()=>{(await import("/@fs/<worktree>/packages/ui/dist/lib/use-toast.js")).toast.success("x",{duration:60000})})`; same module instance as the app. Job-save errors show inline in the drawer, not as toast.
- `.requests-search` (wrapper, pale #e1e7e3) contains an `input` that still draws its own border (`requests-catalog.css` field rule beats `.requests-search input{border:0}` on specificity); any darker field-border token exposes a double frame. Check wrapper AND input border on every search.
- Employees search/select (`.employee-search`, hardcoded #cdd3d0) and Jobs/Shift types `.job-search` (var(--job-border)) are not on `--theme-border-control`; other list pages are.
- After `vite --force` the first navigation to /app/employees or /app/settings/* can be blank for ~3 s; wait 4 s before probing.
- Inter is declared 400-800 only, so 850/900 render as 800 (text width identical) - weight clamp changes nothing visible.
- Kill dev servers by the pnpm.cjs roots (`wmic`/CimInstance parent chain), not the node PID on the port.
