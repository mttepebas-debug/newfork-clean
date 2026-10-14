---
name: fixture-from-real-db-output
description: A contract fixture copied from the SQL by hand hid "09:00:00" vs HH:MM (BL-198); take fixtures from a real run and parse a rolled-back real call
metadata:
  type: feedback
---

When a new `*_service` output meets a shared zod schema, do not hand-write the test fixture from reading the SQL. BL-198 (2026-09-27): the fixture said "09:00", the database sent "09:00:00", tests were green and the real preview would have been a 500; nf-guvenlik caught it.

**Why:** the test only proves the schema accepts what I imagined, not what Postgres emits (time/timestamp text formats, numeric types, nulls).

**How to apply:** copy the fixture verbatim from a real run (nf-db's green pgTAP output, or `select fn(...)::text`), and before reporting, run a rolled-back trial under db.lock: `begin; \i <branch migration>; <pgTAP setup lines>; select 'X ' || fn(...)::text; rollback;`, then parse that output with the shared schema in a throwaway vitest file (delete it after) and compare with `toEqual` (zod reorders keys, so string compare shows a false DIFF). Check `schema_migrations` and `pg_proc` afterwards for no trace. Lock identity must be "rol/oturum, amaç" (scripts/lock.mjs). See [[realtime-join-measure]].
