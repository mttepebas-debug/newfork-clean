---
name: checklist-contract-real-db-shape
description: When a shared zod schema gains fields for a new DB payload, parse a REAL DB output through it; hand-written fixtures hide format mismatches (time as HH:MM:SS vs timeOfDaySchema HH:MM)
metadata:
  type: feedback
---

`packages/shared` `timeOfDaySchema` is `/^([01]\d|2[0-3]):[0-5]\d$/` (HH:MM only). A SQL `time` column put into jsonb as-is serializes as "09:00:00" and fails it. The API parses RPC answers directly (e.g. `schedule-service.ts` previewPublication), so one bad field turns the whole answer into a 500.

**Why:** BL-198 web (570ac77c, 2026-09-27): the schema fix meant to stop a ZodError 500 still 500'd. The DB wrote `'start_time', x.start_time`, and the vitest fixtures were typed by hand as "09:00", so every test stayed green.

**How to apply:** for any new DB field that a shared schema parses, pull one real payload in a rolled-back trial (the task's own pgTAP scenario plus `select f::text`) and check it against the schema's patterns: time HH:MM, date YYYY-MM-DD, datetime with offset, uuid, enum values vs DB CHECK. Prefer `to_char(t,'HH24:MI')` in SQL; other services already do. Related: [[feedback-trial-sources-and-drift]].
