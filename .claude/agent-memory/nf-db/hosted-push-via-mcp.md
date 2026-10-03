---
name: hosted-push-via-mcp
description: Sending one migration to hosted Supabase with MCP apply_migration - backup, byte-exact transcription proof, version fix, verification order (FB-6.7 C, 2026-10-02)
metadata:
  type: reference
---

Standing permission (CLAUDE.md "Sürekli yetki", user 2026-10-02): hosted migration only via MCP `apply_migration`, never CLI `db push`; stop if a real data row would be deleted.

Order that worked (FB-6.7 C, 99 KB file):
1. `list_migrations` for the precondition versions.
2. Backup in ONE `execute_sql` returning `kind, name, md5(def), acl, def` rows (pg_get_functiondef / pg_get_viewdef / pg_get_constraintdef + counts). A big result is auto-saved to `tool-results/*.txt`; split it with a node script (regex must anchor on `<untrusted-data-[0-9a-f-]+>\s*(\[...\])`, the first tag mention is in prose). Recompute md5 per file = server md5 proves the backup is exact.
3. Write the transcription to a scratch file first and md5 it against the repo file; then paste the same text into `apply_migration`.
4. Proof after: `md5(statements[1])` in `supabase_migrations.schema_migrations` equals the file md5 (with its final newline). MCP stamps today's time as version: `update ... set version = '<repo version>' where name = ...`.
5. Same 17-function md5 list (functiondef, prosrc, acl) on hosted and on local inside `begin; <migration>; select...; rollback;` (db.lock), then advisors diff (node script over the saved json).

FB-6.6 (2026-10-03, four files, the first 186 KB) also worked in one `apply_migration` call each. For a big file, Read it in ~500-line chunks, Write each chunk as `pNN_<from>_<to>.sql` and check each against the same line range with a node compare script (localizes a typo; Read truncates lines >2000 chars, print those with `sed -n 'Np'`). The MCP stamp is the SERVER date (e.g. 20261003...), which can be lower than the repo version: fix it by `where name = ... and version = '<stamp>'`, never `version > X`. Delete-row approval check: measure count, custom roles and FKs into the parent (`confdeltype`) right before the deleting file.

Advisor baseline 2026-10-02 after FB-6.7 C (unchanged after FB-6.6 2026-10-03): security rls_enabled_no_policy 98 (INFO, every internal table), perf unindexed_foreign_keys 237, unused_index 55.

The worktree guard refuses shell lines with variables or pipes into node/od/sed on paths outside the worktree: write scripts with Write, call with literal paths. Related: [[rollback-trial-runner]].
