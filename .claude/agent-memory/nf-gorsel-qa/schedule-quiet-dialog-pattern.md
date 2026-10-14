---
name: schedule-quiet-dialog-pattern
description: Schedule top-right windows share [data-schedule-quiet-dialog]; how to open them for QA without side effects
metadata:
  type: project
---

Publish + Templates windows use `[data-schedule-quiet-dialog]` (styles.css) — radius 12, 13px, h2 15/600, shadow 0 16px 40px -12px .28, sticky footer. Publish opens via toolbar Published/Publish menu -> "Publish another draft" (safe to view, cancel with Esc). Templates has no route mock needed for empty state; mock GET /schedule/templates for populated. Dialogs do not move focus inside on open (pre-existing, both), Esc closes both. Playwright helpers live in the session scratchpad, not the repo.
