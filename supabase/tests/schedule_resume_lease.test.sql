begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- All fixtures roll back, independent of seed data and the user's Schedule.
create temp table lease_fixture as select
  gen_random_uuid() w, gen_random_uuid() actor, gen_random_uuid() other_actor,
  gen_random_uuid() outsider, gen_random_uuid() loc, gen_random_uuid() job,
  current_date - extract(isodow from current_date)::integer + 1 + 700 week,
  null::uuid session, null::jsonb result, null::jsonb snapshot;
insert into auth.users(id,email)
select actor,actor::text || '@example.test' from lease_fixture
union all select other_actor,other_actor::text || '@example.test' from lease_fixture;
insert into public.workspaces(id,name,created_by)
select w,'BL-069 lease regression',actor from lease_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
select w,actor,'owner'::public.workspace_role,true from lease_fixture
union all select w,other_actor,'admin'::public.workspace_role,true from lease_fixture;
insert into public.workspace_scheduling_settings(workspace_id)
select w from lease_fixture on conflict do nothing;
insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,timezone)
select loc,w,'Lease location','1 Test Street','Test City','CA','90001','America/Los_Angeles' from lease_fixture;
insert into public.jobs(id,workspace_id,name) select job,w,'Lease job' from lease_fixture;
grant all on lease_fixture to service_role;
set local role service_role;
update lease_fixture set result=public.acquire_schedule_edit_session_service(actor,w,week,'blank',null);
update lease_fixture set session=(result->'session'->>'id')::uuid;
select is(result->>'status','acquired','initial acquire succeeds') from lease_fixture;
set local role postgres;
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,job_id,scheduled_date,start_time,end_time,note)
select gen_random_uuid(),w,session,loc,job,week,'09:00','17:00','Unsaved work must survive resume' from lease_fixture;
update public.schedule_edit_sessions set dirty=true,revision=7,
  last_heartbeat=now()-interval '3 minutes',expires_at=now()+interval '1 minute'
where id=(select session from lease_fixture);
update lease_fixture f set snapshot=(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.session_id=f.session);
set local role service_role;
update lease_fixture set result=public.acquire_schedule_edit_session_service(actor,w,week,'published',null);
select is(result->>'status','resumed','live same-holder acquire resumes instead of replacing source') from lease_fixture;
select is((result->'session'->>'expires_at')::timestamptz,now()+interval '4 minutes','live resume refreshes lease') from lease_fixture;
set local role postgres;
update public.schedule_edit_sessions set last_heartbeat=now()-interval '5 minutes',expires_at=now()-interval '1 minute'
where id=(select session from lease_fixture);
set local role service_role;
update lease_fixture set result=public.acquire_schedule_edit_session_service(actor,w,week,'blank',null);
select is((result->'session'->>'id')::uuid,session,'expired same-holder keeps session identity') from lease_fixture;
select ok((result->'session'->>'expires_at')::timestamptz>now(),'expired resume returns a usable lease') from lease_fixture;
select is((result->'session'->>'revision')::integer,7,'resume preserves revision') from lease_fixture;
select ok((result->'session'->>'dirty')::boolean,'resume preserves unsaved state') from lease_fixture;
select is((select to_jsonb(s) from public.schedule_edit_session_shifts s where s.session_id=f.session),snapshot,'resume preserves complete working shift') from lease_fixture f;
select lives_ok($$select public.heartbeat_schedule_edit_session_service(actor,w,session) from lease_fixture$$,'heartbeat works immediately after expired resume');
select is(public.acquire_schedule_edit_session_service(other_actor,w,week,'blank',null)->>'status','conflict','another manager cannot steal renewed lease') from lease_fixture;
select throws_ok($$select public.acquire_schedule_edit_session_service(outsider,w,week,'blank',null) from lease_fixture$$,'42501','schedule manage access denied','unauthorized actor cannot resume');
set local role postgres;
update public.schedule_edit_sessions set expires_at=now()-interval '1 minute' where id=(select session from lease_fixture);
set local role service_role;
update lease_fixture set result=public.acquire_schedule_edit_session_service(other_actor,w,week,'blank',null);
select is(result->>'status','acquired_after_recovery','another holder still recovers an expired dirty session') from lease_fixture;
select is((select count(*)::integer from public.schedule_draft_shifts s where s.draft_id=(result->>'recovered_draft_id')::uuid),1,'recovery preserves unsaved shift') from lease_fixture;
select is(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->>'status','conflict','former holder cannot resume after recovery by another manager') from lease_fixture;
select * from finish();
rollback;
