---
name: ports-5616-occupied-by-stale-worktree
description: What to do when the assigned nf-gorsel-qa ports 5616/5617 are already bound by another worktree's leftover process
metadata:
  type: reference
---

On 2026-09-26, ports 5616/5617 (assigned to nf-gorsel-qa in CLAUDE.md section 7) were already LISTENING with live ESTABLISHED connections. `Get-CimInstance Win32_Process` on the PIDs showed they belonged to a *different* worktree (`agent-a01e722879e86ce54` and `newfork-wt/fb61-merge`), not anything I started — so killing them would violate "only stop your own started PID". Worked around by using an unused pair further out (5818/5819 that day) for the web/api dev servers, and said so plainly in the report as a deviation from the assigned ports table. Did not touch the foreign PIDs.

**How to apply:** before starting the dev servers, `netstat -ano | grep :<port>` first; if occupied by a PID you didn't launch, pick a free pair instead of killing it, and name the deviation in the report so the coordinator can clean up the real leak separately.
