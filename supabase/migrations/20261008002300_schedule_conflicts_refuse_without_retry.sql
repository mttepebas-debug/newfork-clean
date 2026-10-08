-- BL-958 (ACIL-40001, KK-211), Schedule's share: Schedule's editing,
-- template, auto-fill, default-hours and undo services refused a lasting
-- conflict (an old revision, an expired edit, a reused request key, a changed
-- review) with SQLSTATE 40001. PostgREST takes 40001 for a passing
-- serialization failure and runs the same request again without end, holding
-- one of its pooled connections; about ten such requests stop the API for
-- every workspace. These refusals now answer PT409, which PostgREST hands back
-- at once; the sentence stays. The edit conflicts the screen acts on carry
-- their key in the hint, and the API names them from it
-- (apps/api/src/schedule/schedule-routes.ts):
--   schedule.edit_lease_expired  the lock ran out (a laptop that slept); the
--                                screen opens the same edit again
--   schedule.edit_session_closed the edit was saved, discarded or set aside by
--                                another opening; the screen ends it, since
--                                opening it again would set the other aside
--                                in turn (EKRAN-01 B3)
--   schedule.edit_session_stale  the edit moved on under the screen
-- A pasted batch and the default-hours review used to say one sentence for
-- all three; each now names its own (B4). Publishing and unpublishing already
-- turn a 40001 into PT409 and stay as they are.
--
-- The change is made on each function's definition as the database holds it
-- when this runs (pg_get_functiondef), not on a copy of its body (B11, as
-- ACIL-40001 v2 did): a newer version of one of these functions, landed by
-- another job before this migration or already live, keeps all of its own
-- changes. CREATE OR REPLACE keeps the signature, SECURITY DEFINER,
-- search_path, grants and comments. mutate_schedule_edit_shift_service
-- already answers this way (20261008002000); it is on the list so the checks
-- below cover it too.
do $migration$
declare
  targets constant text[] := array[
    'add_schedule_pending_op_service', 'apply_schedule_auto_fill_service',
    'apply_schedule_default_hours_service', 'apply_schedule_template_service',
    'bulk_delete_schedule_edit_shifts_service', 'create_schedule_shifts_batch_service',
    'delete_schedule_template_service', 'heartbeat_schedule_edit_session_service',
    'mutate_schedule_edit_shift_service', 'normalize_schedule_time_source',
    'preview_schedule_auto_fill_service', 'preview_schedule_default_hours_service',
    'rename_schedule_template_service', 'save_schedule_edit_session_service',
    'undo_schedule_edit_session_step_service'];
  -- The ways a body can raise 40001 (keywords are case-insensitive in PL/pgSQL;
  -- an option may be given with = or :=).
  raises_40001 constant text := $re$(errcode\s*:?=\s*'(40001|serialization_failure)'|raise\s+(exception\s+)?sqlstate\s+'40001'|raise\s+serialization_failure)$re$;
  closed constant text := $rep$errcode = 'PT409', hint = 'schedule.edit_session_closed'$rep$;
  lapsed constant text := $rep$errcode = 'PT409', hint = 'schedule.edit_lease_expired'$rep$;
  stale constant text := $rep$errcode = 'PT409', hint = 'schedule.edit_session_stale'$rep$;
  target text;
  fn oid;
  definition text;
  rewritten text;
begin
  foreach target in array targets loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = target) <> 1 then
      raise exception 'BL-958: public.% is gone or overloaded; check the list before moving on', target;
    end if;
    select p.oid into fn from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = target;

    definition := pg_get_functiondef(fn);
    rewritten := definition;

    -- The lock check: a closed edit and a lapsed lock answer apart.
    rewritten := regexp_replace(rewritten,
      $re$(\n[ \t]*)if\s+(\w+)\.status\s*<>\s*'active'\s+or\s+\2\.expires_at\s*<=\s*now\(\)\s+then(\s+)raise\s+exception\s+'edit lease expired'\s+using\s+errcode\s*=\s*'40001'$re$,
      '\1if \2.status <> ''active'' then\3raise exception ''edit session closed'' using ' || closed
        || ';\1elsif \2.expires_at <= now() then\3raise exception ''edit lease expired'' using ' || lapsed, 'g');
    -- A pasted batch's lock check, in its own words.
    rewritten := regexp_replace(rewritten,
      $re$(\n[ \t]*)if\s+(\w+)\.status\s*<>\s*'active'\s+or\s+\2\.expires_at\s*<=\s*now\(\)\s+then(\s+)raise\s+exception\s+'Schedule editing expired; reopen the schedule'\s+using\s+errcode\s*=\s*'40001'$re$,
      '\1if \2.status <> ''active'' then\3raise exception ''Schedule editing closed; reopen the schedule'' using ' || closed
        || ';\1elsif \2.expires_at <= now() then\3raise exception ''Schedule editing expired; reopen the schedule'' using ' || lapsed, 'g');
    -- The default-hours review asked all three at once.
    rewritten := regexp_replace(rewritten,
      $re$(\n[ \t]*)if\s+(\w+)\.status\s*<>\s*'active'\s+or\s+\2\.expires_at\s*<=\s*now\(\)\s+or\s+\2\.revision\s+is\s+distinct\s+from\s+\(command->>'expected_session_revision'\)::integer\s+then(\s+)raise\s+exception\s+'Schedule editing changed; reopen the review'\s+using\s+errcode\s*=\s*'40001'$re$,
      '\1if \2.status <> ''active'' then\3raise exception ''Schedule editing closed; reopen the review'' using ' || closed
        || ';\1elsif \2.expires_at <= now() then\3raise exception ''Schedule editing expired; reopen the review'' using ' || lapsed
        || ';\1elsif \2.revision is distinct from (command->>''expected_session_revision'')::integer then\3raise exception ''Schedule editing changed; reopen the review'' using ' || stale, 'g');
    -- The heartbeat finds no open edit to extend: closed, or its lock ran out.
    if target = 'heartbeat_schedule_edit_session_service' then
      rewritten := regexp_replace(rewritten,
        $re$if\s+not\s+found\s+then(\s+)raise\s+exception\s+'edit lease expired'\s+using\s+errcode\s*=\s*'40001'$re$,
        'if not found then\1if exists (select 1 from public.schedule_edit_sessions s'
          || '\1    where s.id = target_session_id and s.workspace_id = target_workspace_id'
          || '\1      and s.holder_user_id = actor_user_id and s.status <> ''active'') then'
          || '\1  raise exception ''edit session closed'' using ' || closed || ';'
          || '\1end if;'
          || '\1raise exception ''edit lease expired'' using ' || lapsed, 'g');
    end if;
    rewritten := regexp_replace(rewritten,
      $re$('(?:session|shift|draft) revision stale'\s+using\s+)errcode\s*=\s*'40001'$re$, '\1' || stale, 'g');
    rewritten := regexp_replace(rewritten,
      $re$('Schedule editing changed; reload before pasting'\s+using\s+)errcode\s*=\s*'40001'$re$, '\1' || stale, 'g');
    -- Every other lasting conflict: PT409, its sentence as it was.
    rewritten := regexp_replace(rewritten, $re$errcode\s*:?=\s*'40001'$re$, $rep$errcode = 'PT409'$rep$, 'gi');

    if rewritten <> definition then
      execute rewritten;
    end if;
  end loop;

  -- Nothing on the list may still raise 40001 in any form this did not rewrite,
  -- ask "closed or lapsed" in one breath, or refuse an edit conflict without
  -- its key.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname = any (targets) and p.prosrc ~* raises_40001) then
    raise exception 'BL-958: a listed function still raises 40001 in a form this migration does not rewrite';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname = any (targets)
             and p.prosrc ~* $re$(\w+)\.status\s*<>\s*'active'\s+or\s+\1\.expires_at$re$) then
    raise exception 'EKRAN-01 B3: a listed function still answers a closed edit as a lapsed lock';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname = any (targets)
             and p.prosrc ~* $re$'(edit lease expired|edit session closed|(session|shift|draft) revision stale|Schedule editing [^']*)'\s+using\s+errcode\s*=\s*'PT409'\s*;$re$) then
    raise exception 'EKRAN-01 B4: a listed function refuses an edit conflict without its key';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.heartbeat_schedule_edit_session_service(uuid,uuid,uuid)'::regprocedure
                 and p.prosrc like '%schedule.edit_session_closed%') then
    raise exception 'EKRAN-01 B3: the heartbeat does not tell a closed edit from a lapsed lock';
  end if;
end
$migration$;
