---
name: checklist-cron-poison-row
description: A cron function that walks many workspaces must not run as one transaction; one failing row stops every workspace's job (FB-6.3 sweep)
metadata:
  type: feedback
---

A cron function that sweeps rows of many workspaces in one transaction stops for everyone when one row raises: the whole round rolls back every 5 minutes, silently, until that row's deadline passes (FB-6.3 `time_off_sweep`, @7f09ad4b; fixed @019445d6 with a `begin … exception` block per request).

**Why:** the poison came from a sibling path (shortening closed the time off but not its pending cancellation), not from the cron code itself. Adding a new settling path (O3) to the cron made an old inconsistency fatal for all workspaces.

**How to apply:** when a fix arrives, check that the `begin/exception` block wraps the lock, the re-read and every write of that row; that nothing inside is non-transactional (`net.http_*`, `dblink`); that the test builds a real pair (poison row in one workspace, due row in another); that a stuck row still takes a slot in `limit N` (ask for a backlog item for a visible error trail). Related: [[checklist-sibling-endpoints-same-guard]], [[checklist-system-actor-and-restriction-flags]].
