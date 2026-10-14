---
name: folding-chains
description: How a _base/overload chain was folded into one function without changing behavior (FB-6.1 .4), and what breaks around it
metadata:
  type: feedback
---

- Inline an inner layer as a labeled nested block: `<<write_shift>> declare row_id uuid := target_shift_id; ... begin ... exit write_shift; ... end write_shift;` An inner `return X` becomes `result := X; exit label;`. Give the block its own copies of arguments the inner layer reassigned (the old inner function had private copies; e.g. it set the shift id for a create, the outer layers did not see it).
- An inner layer with `exception when unique_violation` stays a nested `begin ... exception ... end` around exactly its statements; the outer `exception when serialization_failure then PT409` stays on the function block.
- Drop the extra overloads FIRST in the migration, then `create or replace` the kept one with `DEFAULT`s: adding defaults is allowed, and old shorter calls (tests, builder `tests.publish_week`) resolve to it. A `sql` wrapper can be replaced by `plpgsql` in place.
- Dropped overloads go to `retired_objects_stay_gone` as `function_signature` (to_regprocedure is exact, defaults do not match it); dropped names as `function`; `authorization_coverage` loses their rows; `authz_catalog` ceilings drop in the same commit.
- Tests that mocked an inner layer with `create or replace` (notification_schedule_publish_atomic) lose their seam: rewrite them on the real path with the test world.
- Moving a refusal to the core changes the message to `Not allowed` (hint authz.*): grep tests for the old message text (`throws_ok(..., '42501', '<old text>')`), green and red files alike, and for a manager with no location a read now refuses instead of returning empty.
- Removing a `known_gap` row (matrix section 6) needs no dump: the TS twin's sourceSha256 covers only sections 2..5 (`packages/shared/src/authorization-matrix-source.ts`). Moving a function off the old Schedule helpers also shrinks `helper_caller` and its count in `schedule_asks_the_core.test.sql` (BL-177: 10 -> 8).
- The matrix (and its TS twin) models a persona's permissions as "every permission minus `permissions_removed`", but the core reads the real role grants. A new action keyed to a permission the system manager role lacks (FB-6.1.9: settings.locations/jobs/shift_catalog.read, roles.read, documents.read, signature_templates.read) needs that permission added to the manager personas' `permissions_removed`, or the core cells go red (core cells have no known_gap TODO).
- The TS twin dump needs an unapplied migration inside its transaction: copy the dump script next to the original (`scripts/zz-dump-trial.ts`, relative imports), add `${migration}` after `begin;`, run, delete the copy.
- New matrix actions change the rule sections: re-run `pnpm.cmd --filter @newfork/shared dump:authz-matrix` and add the core key to `targetedAuthzActions` in `packages/shared/src/authorization.ts` (nf-backend's file; say so in the report).

**Why:** FB-6.1 .4, 2026-09-26: 24 _base layers and 4 overloads folded; these were the places a trial run went red.
**How to apply:** before folding any other slice's chain (FB-6.2..6.8). See [[rollback-trial-runner]], [[sql-traps-core-translation]].
