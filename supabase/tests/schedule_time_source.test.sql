begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temp table time_source_state as select
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,
  '11000000-0000-4000-8000-000000000001'::uuid loc,
  '15000000-0000-4000-8000-000000000001'::uuid employee,
  '13000000-0000-4000-8000-000000000001'::uuid job,
  'b7a00000-0000-4000-8000-000000000001'::uuid typ,
  'b7a00000-0000-4000-8000-000000000002'::uuid shift,
  current_date-extract(isodow from current_date)::integer+1+700 week,
  null::uuid session, null::uuid draft, null::uuid template, null::jsonb result;
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
select typ,w,'Time-source Lunch','#123456','12:00','16:00' from time_source_state;

select is((select default_revision from public.shift_types where id=s.typ),1,'first defaults have revision one') from time_source_state s;
update time_source_state set result=public.normalize_schedule_time_source(w,jsonb_build_object(
  'location_id',loc,'shift_type_id',typ,'time_basis','type_default','start_time','09:00','end_time','10:00'));
select is(result->>'start_time','12:00','name-only resolves from selected type') from time_source_state;
select is(result->'time_snapshot'->>'default_revision','1','snapshot records type revision') from time_source_state;
select is(public.normalize_schedule_time_source(w,result||'{"time_basis":"explicit","start_time":"10:00","end_time":"17:00","hide_time_on_badge":true}')->>'start_time','10:00','explicit hours win even when badge hides them') from time_source_state;
select throws_ok($$select public.normalize_schedule_time_source(w,jsonb_set(result,'{time_snapshot,start_time}','"11:00"')) from time_source_state$$,'40001',null,'forged default interval rejected');

update time_source_state set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
select lives_ok($$select public.mutate_schedule_edit_shift_service(s.actor,s.w,s.session,e.revision,'create',s.shift,null,
  s.result||jsonb_build_object('employee_id',null,'job_id',s.job,'scheduled_date',s.week,'hide_time_on_badge',true),gen_random_uuid())
  from time_source_state s join public.schedule_edit_sessions e on e.id=s.session$$,'create stores named reference through authorized edit RPC');
select is((select time_basis from public.schedule_edit_session_shifts where id=s.shift and session_id=s.session),'type_default','edit storage retains source') from time_source_state s;
select is((public.get_schedule_edit_session_service(actor,w,session)->'shifts'->0->>'time_basis'),'type_default','edit projection retains source') from time_source_state;
select ok((select hide_time_on_badge from public.schedule_edit_session_shifts where id=s.shift and session_id=s.session),'display flag is retained independently') from time_source_state s;

update public.shift_types set default_start_time='13:00',default_end_time='17:00' where id=(select typ from time_source_state);
set local role authenticated;
select set_config('request.jwt.claim.sub','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5',true);
with changed as (update public.shift_types set default_start_time='11:00',default_end_time='18:00'
 where id='b7a00000-0000-4000-8000-000000000001' and workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd' and default_revision=1 returning id)
 select is((select count(*)::integer from changed),0,'stale Settings revision cannot overwrite newer reference hours');
with changed as (update public.shift_types set name='Time-source Lunch reviewed'
 where id='b7a00000-0000-4000-8000-000000000001' and workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd' and default_revision=2 returning id)
 select is((select count(*)::integer from changed),1,'current Settings revision permits an authorized edit');
reset role;
select is((select count(*)::integer from public.shift_type_time_versions where shift_type_id='b7a00000-0000-4000-8000-000000000001'),2,'stale and metadata-only edits append no clock history');
select is((select default_revision from public.shift_types where id=s.typ),2,'changing defaults appends a revision') from time_source_state s;
select is((select start_time::text from public.schedule_edit_session_shifts where id=s.shift and session_id=s.session),'12:00:00','existing shift does not change with type settings') from time_source_state s;
select is(public.normalize_schedule_time_source(w,result)->'time_snapshot'->>'default_revision','1','copy keeps the historical default snapshot') from time_source_state;
select is(public.normalize_schedule_time_source(w,(result-'time_snapshot'))->>'start_time','13:00','new use of defaults resolves the current revision') from time_source_state;
select throws_ok($$select public.normalize_schedule_time_source(w,(result-'time_basis')||'{"start_time":"14:00"}',result) from time_source_state$$,'40001',null,'old client cannot silently rewrite reference hours');
select lives_ok($$select public.add_schedule_pending_op_service(s.actor,s.w,s.session,'update',s.shift,'{"note":"Keep snapshot"}') from time_source_state s$$,'partial pending update preserves snapshot');
select throws_ok($$select public.add_schedule_pending_op_service(s.actor,s.w,s.session,'update',s.shift,'{"start_time":"14:00"}') from time_source_state s$$,'40001',null,'legacy pending update cannot discard time source');

-- A stored timezone is part of the interval evidence, not the current setting.
update public.locations set timezone='America/New_York' where id=(select loc from time_source_state);
update time_source_state s set draft=(public.save_schedule_edit_session_service(actor,w,session,e.revision,'Time source test',null,null)->>'id')::uuid
from public.schedule_edit_sessions e where e.id=s.session;
select is((select time_snapshot->>'default_revision' from public.schedule_draft_shifts where id=s.shift and draft_id=s.draft),'1','save-to-draft preserves reference revision') from time_source_state s;
select is((select time_timezone from public.schedule_draft_shifts where id=s.shift and draft_id=s.draft),s.result->>'time_timezone','save preserves original timezone after location setting changes') from time_source_state s;
update time_source_state set template=(public.create_schedule_template_service(actor,w,draft,'Time source template',true)->'template'->>'id')::uuid;
select is((select time_basis from public.schedule_template_shifts where template_id=s.template limit 1),'type_default','template creation preserves source') from time_source_state s;
update time_source_state set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
select lives_ok($$select public.apply_schedule_template_service(s.actor,s.w,s.session,e.revision,s.template,'merge') from time_source_state s join public.schedule_edit_sessions e on e.id=s.session$$,'template apply succeeds');
select is((select time_snapshot->>'default_revision' from public.schedule_edit_session_shifts where session_id=s.session limit 1),'1','template apply preserves historical reference') from time_source_state s;
select lives_ok($$select public.discard_schedule_edit_session_service(actor,w,session) from time_source_state$$,'template test session closes');

update time_source_state set result=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select is(result->>'status','publish_ready','resolved open reference is publishable') from time_source_state;
select lives_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.result->>'fingerprint','[]') from time_source_state s join public.schedule_drafts d on d.id=s.draft$$,'publication preserves source atomically');
select is((select time_snapshot->>'default_revision' from public.schedule_published_shifts where source_shift_id=s.shift order by created_at desc limit 1),'1','published shift retains original defaults') from time_source_state s;
select is((select time_timezone from public.schedule_published_shifts where source_shift_id=s.shift order by created_at desc limit 1),(select time_timezone from public.schedule_draft_shifts where id=s.shift and draft_id=s.draft),'publication retains the saved timezone') from time_source_state s;
update time_source_state set session=(public.acquire_schedule_edit_session_service(actor,w,week,'published',null)->'session'->>'id')::uuid;
select is((public.get_schedule_edit_session_service(actor,w,session)->'shifts'->0->'time_snapshot'->>'default_revision'),'1','reopening publication preserves original defaults') from time_source_state;

-- Unresolved intervals have no invented midnight range and cannot be assigned at publish.
select lives_ok($$select public.add_schedule_pending_op_service(s.actor,s.w,s.session,'create',null,
  jsonb_build_object('location_id',s.loc,'job_id',s.job,'employee_id',s.employee,'shift_type_id',s.typ,'scheduled_date',s.week+1,
  'time_basis','unresolved','start_time','','end_time','','hide_time_on_badge',true)) from time_source_state s$$,'unresolved assignment can be kept as draft');
select ok((select start_time is null and end_time is null from public.schedule_edit_session_shifts where session_id=s.session and time_basis='unresolved'),'unknown hours remain null') from time_source_state s;
update time_source_state s set draft=(public.save_schedule_edit_session_service(actor,w,session,e.revision,'Unresolved source test',null,null)->>'id')::uuid
from public.schedule_edit_sessions e where e.id=s.session;
update time_source_state set result=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select ok(exists(select 1 from jsonb_array_elements(result->'findings') f where f->>'code'='time_source_unresolved' and f->>'severity'='hard'),'preview blocks unknown assignment hours') from time_source_state;
select throws_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.result->>'fingerprint','[]') from time_source_state s join public.schedule_drafts d on d.id=s.draft$$,'23514',null,'publish cannot bypass unresolved blocker');

select is((public.preview_schedule_export_service(actor,w,week,'draft',draft,array[loc])->'summary'->>'scheduled_minutes')::integer,240,'export excludes unknown hours and retains reference minutes') from time_source_state;
select is((public.preview_schedule_export_service(actor,w,week,'draft',draft,array[loc])->'rows'->0->>'time_basis'),'type_default','export carries assessment evidence') from time_source_state;
select is(public.shift_exchange_shift(w,shift)->>'timezone',(select time_timezone from public.schedule_published_shifts p where p.source_shift_id=s.shift limit 1),'exchange uses saved timezone, not a later location setting') from time_source_state s;

update time_source_state set session=(public.acquire_schedule_edit_session_service(actor,w,week+7,'blank',null)->'session'->>'id')::uuid;
select lives_ok($$select public.mutate_schedule_edit_shift_service(s.actor,s.w,s.session,e.revision,'create',gen_random_uuid(),null,
 jsonb_build_object('employee_id',null,'location_id',s.loc,'job_id',s.job,'shift_type_id',s.typ,'scheduled_date',s.week+7,'time_basis','unresolved','start_time','','end_time',''),gen_random_uuid())
 from time_source_state s join public.schedule_edit_sessions e on e.id=s.session$$,'regular edit RPC stores an unresolved open draft');
select is(jsonb_array_length(public.preview_schedule_auto_fill_service(actor,w,session)->'proposals'),0,'auto-fill never assigns unknown hours') from time_source_state;
select ok(exists(select 1 from jsonb_array_elements(public.preview_schedule_auto_fill_service(actor,w,session)->'unfilled') u where u->>'reason'='Confirm shift hours before auto-fill'),'auto-fill explains unknown source') from time_source_state;

-- This used to build two overlapping draft shifts for one person and check
-- that publication called the overlap soft while the hours came from a shift
-- type and hard once they were typed in by hand. A draft cannot hold that any
-- more: an overlapping assignment is refused where it is written, not where it
-- is published, and a schedule nobody can publish is not worth drafting.
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,hide_time_on_badge)
select 'b7a00000-0000-4000-8000-000000000010',w,draft,loc,employee,job,typ,week+2,'12:00','16:00','type_default',
 jsonb_build_object('shift_type_id',typ,'default_revision',1,'start_time','12:00','end_time','16:00'),true from time_source_state;
select throws_ok($$insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,hide_time_on_badge)
 select 'b7a00000-0000-4000-8000-000000000011',w,draft,loc,employee,job,week+2,'13:00','15:00','explicit',true from time_source_state$$,
 '23514',null,'a draft refuses a second shift that runs while the first one does');

-- And hiding the hours on both badges does not make it any less of a clash:
-- the rule reads the times, not what the badge shows.
select throws_ok($$insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,hide_time_on_badge)
 select 'b7a00000-0000-4000-8000-000000000012',w,draft,loc,employee,job,typ,week+2,'12:00','16:00','type_default',
 jsonb_build_object('shift_type_id',typ,'default_revision',1,'start_time','12:00','end_time','16:00'),true from time_source_state$$,
 '23514',null,'nor when both badges hide the hours');

select throws_ok($$insert into public.schedule_published_shifts(workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,source_shift_id)
 select s.w,p.id,s.loc,s.employee,s.job,s.typ,s.week+3,null,null,'unresolved',gen_random_uuid() from time_source_state s join public.schedule_location_publications p on p.workspace_id=s.w and p.location_id=s.loc and p.week_start=s.week and p.status='current'$$,'23514',null,'direct published inserts cannot bypass the source guard');

set local role authenticated;
select throws_ok($$select * from public.shift_type_time_versions$$,'42501',null,'historical time data is service-only');
reset role;
select * from finish();
rollback;
