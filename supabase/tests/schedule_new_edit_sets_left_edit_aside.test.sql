begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Mert 2026-10-12 ("Sor + tek kural"): a new edit asked for from a menu never
-- brings back an edit that was left open. Its unsaved work becomes an
-- "Auto-save" draft; an edit still open in another tab is shared as before;
-- picking an edit back up (a reload, a lapsed lock) still resumes it.
create temp table left_edit as select
  gen_random_uuid() w, gen_random_uuid() actor, gen_random_uuid() loc, gen_random_uuid() job,
  gen_random_uuid() draft,
  current_date - extract(isodow from current_date)::integer + 1 + 700 week,
  null::uuid first_edit, null::uuid second_edit, null::jsonb result, 0 drafts_before;
insert into auth.users(id, email) select actor, actor::text || '@example.test' from left_edit;
insert into public.workspaces(id, name, created_by) select w, 'Left edit', actor from left_edit;
insert into public.workspace_memberships(workspace_id, user_id, role, all_locations)
select w, actor, 'owner'::public.workspace_role, true from left_edit;
insert into public.workspace_scheduling_settings(workspace_id) select w from left_edit on conflict do nothing;
insert into public.locations(short_name, id, workspace_id, name, street_address, city, region, postal_code, timezone)
select 'T00121', loc, w, 'Left edit location', '1 Test Street', 'Test City', 'CA', '90001', 'America/Los_Angeles' from left_edit;
insert into public.jobs(id, workspace_id, name) select job, w, 'Left edit job' from left_edit;
insert into public.schedule_drafts(id, workspace_id, week_start, name, created_by, updated_by, location_ids)
select draft, w, week, 'Kept draft', actor, actor, array[loc] from left_edit;
grant all on left_edit to service_role;

-- One unsaved shift in an edit, and when its lock runs out.
create function pg_temp.work_in(edit uuid, lock_left interval) returns void
language sql as $$
  insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, job_id, scheduled_date, start_time, end_time, note)
  select gen_random_uuid(), w, edit, loc, job, week, '09:00', '17:00', 'Unsaved work' from left_edit;
  update public.schedule_edit_sessions set dirty = true, expires_at = now() + lock_left where id = edit;
$$;
grant execute on function pg_temp.work_in(uuid, interval) to service_role;

-- 1. Ayşe opens a blank schedule and adds a shift --------------------------------------
set local role service_role;
update left_edit set result = public.acquire_schedule_edit_session_service(actor, w, week, 'blank', null, null, false);
update left_edit set first_edit = (result -> 'session' ->> 'id')::uuid;
select is(result ->> 'status', 'acquired', 'a new blank edit opens') from left_edit;
set local role postgres;
select pg_temp.work_in(first_edit, interval '3 minutes') from left_edit;

-- 2. The same edit is still open in another tab: a new blank edit shares it ------------
set local role service_role;
update left_edit set result = public.acquire_schedule_edit_session_service(actor, w, week, 'blank', null, null, false);
select is((result -> 'session' ->> 'id')::uuid, first_edit, 'an edit still open in another tab is shared, not set aside') from left_edit;
select is(result ->> 'status', 'resumed', 'and the answer says it was picked up') from left_edit;

-- 3. She closed the tab and its lock ran out: a reload still picks it up ---------------
set local role postgres;
update public.schedule_edit_sessions set expires_at = now() - interval '1 minute' where id = (select first_edit from left_edit);
set local role service_role;
update left_edit set result = public.acquire_schedule_edit_session_service(actor, w, week, 'blank', null);
select is((result -> 'session' ->> 'id')::uuid, first_edit, 'picking an edit back up (reload, lapsed lock) still resumes it') from left_edit;

-- 4. Lock ran out again; New schedule > Blank is blank ---------------------------------
set local role postgres;
update public.schedule_edit_sessions set expires_at = now() - interval '1 minute' where id = (select first_edit from left_edit);
update left_edit set drafts_before = (select count(*) from public.schedule_drafts d where d.workspace_id = left_edit.w);
set local role service_role;
update left_edit set result = public.acquire_schedule_edit_session_service(actor, w, week, 'blank', null, null, false);
update left_edit set second_edit = (result -> 'session' ->> 'id')::uuid;
select is(result ->> 'status', 'acquired_after_recovery', 'a new blank edit sets the left edit aside') from left_edit;
select isnt(second_edit, first_edit, 'and opens a new edit') from left_edit;
select is((select count(*)::integer from public.schedule_edit_session_shifts s where s.session_id = left_edit.second_edit), 0,
  'the new blank schedule is empty') from left_edit;
select is((select count(*)::integer from public.schedule_draft_shifts s where s.draft_id = (left_edit.result ->> 'recovered_draft_id')::uuid), 1,
  'the left work is kept in a draft') from left_edit;
select ok(result ->> 'recovered_draft_name' like 'Auto-save · %', 'named like every Auto-save draft') from left_edit;
select is((select status::text from public.schedule_edit_sessions s where s.id = left_edit.first_edit), 'recovered',
  'the left edit is closed') from left_edit;

-- 5. A left edit with nothing unsaved closes without a draft ---------------------------
set local role postgres;
update public.schedule_edit_sessions set expires_at = now() - interval '1 minute' where id = (select second_edit from left_edit);
update left_edit set drafts_before = (select count(*) from public.schedule_drafts d where d.workspace_id = left_edit.w);
set local role service_role;
update left_edit set result = public.acquire_schedule_edit_session_service(actor, w, week, 'blank', null, null, false);
select is(result ->> 'status', 'acquired', 'nothing unsaved: the new edit opens with nothing to tell') from left_edit;
select is((select status::text from public.schedule_edit_sessions s where s.id = left_edit.second_edit), 'expired',
  'the empty left edit is closed') from left_edit;
select is((select count(*)::integer from public.schedule_drafts d where d.workspace_id = left_edit.w), drafts_before,
  'and no draft is made of it') from left_edit;

-- 6. The same rule for a draft: Edit on "Kept draft" opens the draft as saved ----------
update left_edit set result = public.acquire_schedule_edit_session_service(actor, w, week, 'draft', draft, null, false);
update left_edit set first_edit = (result -> 'session' ->> 'id')::uuid;
set local role postgres;
select pg_temp.work_in(first_edit, - interval '1 minute') from left_edit;
set local role service_role;
update left_edit set result = public.acquire_schedule_edit_session_service(actor, w, week, 'draft', draft, null, false);
select is(result ->> 'status', 'acquired_after_recovery', 'Edit on the draft sets its left edit aside') from left_edit;
select isnt((result -> 'session' ->> 'id')::uuid, first_edit, 'and opens the draft afresh') from left_edit;
select is((select count(*)::integer from public.schedule_draft_shifts s where s.draft_id = (left_edit.result ->> 'recovered_draft_id')::uuid), 1,
  'the left work is its own Auto-save draft') from left_edit;
select is((select count(*)::integer from public.schedule_draft_shifts s where s.draft_id = left_edit.draft), 0,
  'and "Kept draft" stays as it was saved') from left_edit;

select * from finish();
rollback;
