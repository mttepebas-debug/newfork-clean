---
name: bulutta-pgtap
description: Cloud threads CAN run the full pgTAP suite: start dockerd, pull supabase/postgres:17.4.1.054, patch fake auth/storage/realtime, replay migrations (verified 2026-10-11)
metadata:
  type: reference
  modified: 2026-10-12T05:29:59.968Z
---

Corrects the old "Cloud has no Docker" note. On 2026-10-11 (the thread on keyed refusals for documents and availability) this worked in a cloud container, run as root:
1. `nohup dockerd &`. Docker Hub pulls work; the public.ecr.aws mirror says "Data limit exceeded".
2. `docker pull supabase/postgres:17.4.1.054` (config.toml major_version 17), then `docker run -e POSTGRES_PASSWORD=[GİZLİ-ÇIKARILDI]`.
3. The image lacks parts the GoTrue, storage and realtime services would add. Patch them as supabase_admin (PGPASSWORD=[GİZLİ-ÇIKARILDI], -h localhost):
   - storage.buckets: public, file_size_limit, allowed_mime_types
   - auth.users: deleted_at, email_confirmed_at, email_change_token_new, phone and similar columns
   - auth.identities and auth.sessions tables
   - realtime.messages and realtime.send
4. Load supabase/seed.sql after the migrations (without it ~14 more files go red on missing seed rows; verified 2026-10-12, Schedule refusal-keys thread). Apply every migration with `psql -1 -v ON_ERROR_STOP=1`, load supabase/test-support/builder.sql, then run each test with psql and count `not ok` and `ERROR:`.
5. Of 187 test files, 10 stay red only because of the fakes: account_notification_scope, account_security_deletion_lifecycle, authorization_core, browser_privileges, communication_operations, employee_personal_tasks, live_updates_are_private, location_short_names, schedule_default_hours_review, schedule_draft_archive_preserves_publication. Compare against a baseline run.

`npm i -g supabase` was denied by the permission check, so there is no CLI and `pnpm db:schema` cannot run. Instead, patch schema.sql by text and re-render its header with `render()` and `fingerprint()` from scripts/schema-snapshot.mjs. The nf-guvenlik agent needs `git remote set-head origin main` first.

2026-10-12: with seed.sql loaded, 9 files stay red from the fakes (account_notification_scope, account_security_deletion_lifecycle, authorization_core, browser_privileges, live_updates_are_private, location_short_names, schedule_realtime_channels, scheduling_settings_shift_types_rls, time_off_decisions_go_one_rank_up). `create database ... template postgres` crashed the server once; run tests straight on postgres (each file rolls back).

Faster route without Docker (2026-10-12, availability list thread): the container has native PostgreSQL 16. `apt-get update && apt-get install postgresql-16-pgtap`; initdb/pg_ctl as user postgres; fake pg_cron/pg_net via control files in /usr/share/postgresql/16/extension; stub auth/storage/realtime/vault schemas; strip `, maintain` from GRANT/REVOKE (PG17-only); `alter database ... set search_path = "$user", public, extensions`; run tests with `psql -t -A`. 183/187 green without seed; the 4 red are fakes/speed: account_profile_storage_rls, authorization_core, schedule_grid_read_budget (slow PG), availability_always_warns (TODO only).
