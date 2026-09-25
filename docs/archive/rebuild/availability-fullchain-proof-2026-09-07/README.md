# Availability full migration-chain proof

The final fresh replay applied **204 application migrations**, from `20260817093000_core_workspace_foundation.sql` through `20260909033001_private_trigger_execute_permissions.sql`, in **85.09 seconds**. It includes the parallel Shift Exchange travel-policy migration 32000. The synthetic seed and **23 transaction-rollback suites / 875 assertions** then passed in **75.92 seconds**. Migration inventory/content and test content stayed unchanged during verification.

The owned container `newfork-availability-fullchain-20260907-r2` uses local PostgreSQL image `public.ecr.aws/supabase/postgres:17.6.1.155`, `network=none`, no published ports and no host bind mounts. Provider auth/storage/realtime definitions came from the existing schema-only bootstrap; no development or hosted user rows were copied. The repository's synthetic seed was applied exactly once after replay.

## Finding and correction

The first fresh replay applied all 203 then-current migrations, but regression found **16 internal SECURITY DEFINER trigger functions** with `authenticated` EXECUTE grants inherited from the provider bootstrap's default privileges. Main local had zero. The [initial permission failure](initial-permission-failure.log) is retained.

Forward migration **33001** explicitly revokes client EXECUTE grants from public-schema SECURITY DEFINER functions returning `trigger`. It preserves bodies, trigger attachments, owners and service-role grants. It does not change invoker functions or actor-checked service RPC grants. SHA256: `933c8c6b1afb3d695566eb5c272dee491426f1cac34b1a268c5625fda03dc846`.

PostgreSQL distinguishes invoking functions from creating trigger attachments; see the documented [EXECUTE and TRIGGER permissions](https://www.postgresql.org/docs/17/ddl-priv.html). Application behavior was verified directly: **25 Settings/shift-type RLS assertions** passed after revocation, including owner/admin writes, audit events, automatic settings initialization, overnight types and access boundaries. Global function-execute checks passed **3/3**. No test expectation was weakened.

After the fresh 204-migration replay passed, 33001 was applied to main and the existing isolated regression/verification DBs. Each passed privilege checks **3/3**. Main local migration history was registered and PostgREST notified; the security advisor reported no error-level findings. The first replay database remains separate with its failure evidence.

## Artifacts and reproduction

- [Replay manifest](replay-result.json): all 204 filenames, hashes and command outcomes.
- [Regression manifest](regression-result.json): all 23 test files, hashes, TAP plans, assertion counts and durations.
- [Seed metadata](seed-result.json): seed hash and target identity; no seed credentials included.
- [Permission preapply](permission-forward-preapply.log): rollback proof of the correction.

Use `supabase/verification/availability_schedule_replay_local.py` and `supabase/verification/availability_fullchain_regression_local.py`. For another run, create a fresh container with the same image, ownership label and isolation settings, named for example `newfork-availability-fullchain-20260907-r3`. The scripts reject mismatched containers/manifests; replay rejects existing application tables, and `--seed` rejects existing users/workspaces.

```powershell
python supabase/verification/availability_schedule_replay_local.py --full-chain 20260907-r3
python supabase/verification/availability_fullchain_regression_local.py --run-id 20260907-r3 --seed
```

The provider schema-only bootstrap must exist at the replay script's required paths. Both new replay containers were stopped after verification with their databases retained. To repeat regression on the successful DB, start its container and omit `--seed`.

## Acceptance boundary

This closes the current **local application migration-chain replay** and scoped database integration gate. Provider upgrades, the entire repository test suite, hosted rollout, browser recovery/UAT and the remaining Availability v2 product requirements require separate evidence. No hosted deployment, commit or release was made.
