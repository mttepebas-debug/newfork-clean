-- EKRAN-01 #12 (BL-762): two edges of Schedule's Undo.
--
-- Order. A step was ordered by the clock its request began at. Two of Ayşe's
-- tabs send at once; the later request began a moment earlier, waited for the
-- edit and wrote last, yet its step sorted first, so Undo took back the other
-- step first and left the shifts half undone. A step now takes a number from a
-- sequence when its first row is written, after the locks it waited for; Undo
-- takes back the highest number. A step is still told apart by its statement
-- and transaction (step_at, step_xact); the number only orders them.
--
-- Depth. Opening the edit wider (Can adds Kadıköy to his Beşiktaş edit)
-- brings that location's shifts in. The trigger took that for a new step and
-- pushed his oldest step out before the step was dropped again, so a full
-- history of 25 became 24. Those shifts are not a step: the edit now says so
-- while it brings them in (app.schedule_edit_widening, as app.workspace_closure
-- does for a closing), and the trigger records nothing for them.

create sequence app_private.schedule_edit_undo_step_no;

alter table app_private.schedule_edit_undo_steps add column step_no bigint;
-- The steps open edits hold now keep their order.
update app_private.schedule_edit_undo_steps step
set step_no = numbered.step_no
from (select session_id, step_at, step_xact,
        dense_rank() over (order by step_at, step_xact) as step_no
      from (select distinct session_id, step_at, step_xact from app_private.schedule_edit_undo_steps) steps) numbered
where numbered.session_id = step.session_id and numbered.step_at = step.step_at
  and numbered.step_xact = step.step_xact;
select setval('app_private.schedule_edit_undo_step_no',
  coalesce((select max(step_no) from app_private.schedule_edit_undo_steps), 0) + 1, false);
alter table app_private.schedule_edit_undo_steps alter column step_no set not null;
alter sequence app_private.schedule_edit_undo_step_no owned by app_private.schedule_edit_undo_steps.step_no;
create index schedule_edit_undo_steps_step_no_idx on app_private.schedule_edit_undo_steps (session_id, step_no);

create or replace function app_private.record_schedule_edit_undo_step()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  edit uuid := coalesce(new.session_id, old.session_id);
  call_at timestamptz := statement_timestamp();
  call_xact xid8 := pg_current_xact_id();
  this_step bigint;
begin
  -- A closed edit keeps no history, nor does one being deleted.
  if not exists (select 1 from public.schedule_edit_sessions session where session.id = edit and session.status = 'active') then
    return null;
  end if;
  -- The shifts an edit is opened or widened with are not a step of it.
  if current_setting('app.schedule_edit_widening', true) = 'on' then
    return null;
  end if;
  select step.step_no into this_step
  from app_private.schedule_edit_undo_steps step
  where step.session_id = edit and step.step_at = call_at and step.step_xact = call_xact
  limit 1;
  -- A new step: only the 24 before it are kept, and it is numbered after them.
  if this_step is null then
    delete from app_private.schedule_edit_undo_steps step
    where step.session_id = edit and step.step_no <= (
      select kept.step_no
      from (select distinct older.step_no from app_private.schedule_edit_undo_steps older
            where older.session_id = edit) kept
      order by kept.step_no desc offset 24 limit 1);
    this_step := nextval('app_private.schedule_edit_undo_step_no');
  end if;
  insert into app_private.schedule_edit_undo_steps (workspace_id, session_id, step_at, step_xact, step_no, shift_id, before)
  values (coalesce(new.workspace_id, old.workspace_id), edit, call_at, call_xact, this_step, coalesce(new.id, old.id),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end)
  -- The first change in a step is how the row was before it.
  on conflict (session_id, shift_id, step_at, step_xact) do nothing;
  return null;
end;
$function$;

-- Opening and Undo are changed on their definitions as the database holds
-- them (pg_get_functiondef), so a newer version keeps its own changes; each
-- anchor must be found exactly once.
do $migration$
declare
  acquire_fn constant regprocedure := (select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'acquire_schedule_edit_session_service');
  undo_fn constant regprocedure := 'public.undo_schedule_edit_session_step_service(uuid,uuid,uuid,integer)'::regprocedure;
  definition text;
  -- [anchor, replacement] pairs per function.
  opening constant text[] := array[
    E'  if session_source = ''published'' then\n    insert into public.schedule_edit_session_shifts',
    E'  -- The shifts the edit is opened or widened with are not a step of it, and\n'
    || E'  -- do not push its oldest step out (EKRAN-01 #12).\n'
    || E'  perform set_config(''app.schedule_edit_widening'', ''on'', true);\n'
    || E'  if session_source = ''published'' then\n    insert into public.schedule_edit_session_shifts',
    E'  -- DB-1c: the shifts the edit is opened or widened with are not a step of it.\n'
    || E'  delete from app_private.schedule_edit_undo_steps step\n'
    || E'  where step.session_id = edit_session_id and step.step_at = statement_timestamp()\n'
    || E'    and step.step_xact = pg_current_xact_id();\n',
    E'  perform set_config(''app.schedule_edit_widening'', '''', true);\n'];
  undoing constant text[] := array[
    E'  order by step.step_at desc, step.step_xact desc\n',
    E'  -- The step written last, by its number (EKRAN-01 #12).\n  order by step.step_no desc\n'];
  i integer;
begin
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname = 'acquire_schedule_edit_session_service') <> 1 then
    raise exception 'EKRAN-01 #12: acquire_schedule_edit_session_service is gone or overloaded';
  end if;

  definition := pg_get_functiondef(acquire_fn);
  for i in 1 .. array_length(opening, 1) by 2 loop
    if (length(definition) - length(replace(definition, opening[i], ''))) / length(opening[i]) <> 1 then
      raise exception 'EKRAN-01 #12: acquire_schedule_edit_session_service no longer reads as this expects (anchor %)', (i + 1) / 2;
    end if;
    definition := replace(definition, opening[i], opening[i + 1]);
  end loop;
  execute definition;

  definition := pg_get_functiondef(undo_fn);
  for i in 1 .. array_length(undoing, 1) by 2 loop
    if (length(definition) - length(replace(definition, undoing[i], ''))) / length(undoing[i]) <> 1 then
      raise exception 'EKRAN-01 #12: undo_schedule_edit_session_step_service no longer reads as this expects (anchor %)', (i + 1) / 2;
    end if;
    definition := replace(definition, undoing[i], undoing[i + 1]);
  end loop;
  execute definition;
end
$migration$;
