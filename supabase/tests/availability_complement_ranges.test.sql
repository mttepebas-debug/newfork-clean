begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ac_state as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid owner_actor,'af920000-0000-4000-8000-000000000001'::uuid actor,
 'af910000-0000-4000-8000-000000000001'::uuid emp,'af930000-0000-4000-8000-000000000001'::uuid typ,
 current_date+2800 starts,
 '[{"start":"00:00","end":"01:00"},{"start":"02:00","end":"05:00"},{"start":"06:00","end":"10:00"},{"start":"11:00","end":"15:00"},{"start":"16:00","end":"24:00"}]'::jsonb five,
 null::jsonb proposal;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','availability-complement@example.test','','{}','{}',now(),now() from ac_state;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from ac_state;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-993590','Complement','Availability',owner_actor from ac_state;
update ac_state set proposal=jsonb_build_object('timezone','UTC','effective_from',starts,'effective_until',null,'kind','weekly',
 'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows',five)) from generate_series(0,6) d));
select lives_ok($$select public.validate_availability_week('UTC',proposal->'days') from ac_state$$,'four excluded ranges may leave five valid available pieces');
select throws_ok($$select public.validate_availability_week('UTC',jsonb_set(proposal->'days','{0,windows}',five||'{"start":"23:00","end":"24:00"}'::jsonb)) from ac_state$$,'22023',null,'the canonical interval count remains bounded');
update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='none',availability_initial_review=false,availability_notice_days=0 where workspace_id=(select w from ac_state);
select is(public.availability_command_service(actor,w,jsonb_build_object('employee_id',emp,'action','submit','expected_revision',0,'proposal',proposal),gen_random_uuid())->>'status','effective','employee can submit the five-piece canonical complement through the real lifecycle command') from ac_state;
select is(public.availability_read_service(actor,w)->'latest'->'days',proposal->'days','stored availability round-trips every available piece') from ac_state;
select is((public.availability_capacity_for_span(w,emp,tstzrange((starts+time '00:00') at time zone 'UTC',(starts+1+time '00:00') at time zone 'UTC','[)'))).unavailable,
 tstzmultirange(tstzrange((starts+time '01:00') at time zone 'UTC',(starts+time '02:00') at time zone 'UTC','[)'),
  tstzrange((starts+time '05:00') at time zone 'UTC',(starts+time '06:00') at time zone 'UTC','[)'),
  tstzrange((starts+time '10:00') at time zone 'UTC',(starts+time '11:00') at time zone 'UTC','[)'),
  tstzrange((starts+time '15:00') at time zone 'UTC',(starts+time '16:00') at time zone 'UTC','[)')),
 'authoritative assessment reconstructs exactly the four excluded intervals') from ac_state;

insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
select typ,w,'Complement Lunch','#123456','12:00','16:00' from ac_state;
-- There used to be a third type here with no hours at all, to prove it was
-- never offered as a clock shortcut. A shift type without hours cannot be
-- created any more -- the database refuses it on the way in -- so the only
-- kind left to keep out of the shortcuts is an archived one.
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time,archived_at)
select 'af930000-0000-4000-8000-000000000003',w,'Complement Archived','#123456','12:00','16:00',now() from ac_state;
select ok(exists(select 1 from jsonb_array_elements(public.availability_read_service(actor,w)->'clock_presets') p where p->>'id'=typ::text and p->>'start_time'='12:00' and p->>'end_time'='16:00'),'employee reads usable current shift-type clock shortcuts') from ac_state;
select ok(not exists(select 1 from jsonb_array_elements(public.availability_read_service(actor,w)->'clock_presets') p where p->>'id'='af930000-0000-4000-8000-000000000003'),'an archived type is not offered as a clock shortcut') from ac_state;
update public.shift_types set default_start_time='18:00',default_end_time='22:00' where id=(select typ from ac_state);
select is(public.availability_read_service(actor,w)->'latest'->'days',proposal->'days','changing preset defaults never rewrites saved employee availability') from ac_state;
select is(public.availability_read_service(actor,w)->>'revision','1','a shift-type change does not fabricate an availability revision') from ac_state;
select ok(exists(select 1 from jsonb_array_elements(public.availability_read_service(actor,w)->'clock_presets') p where p->>'id'=typ::text and p->>'start_time'='18:00'),'a new clock shortcut uses the latest configured hours') from ac_state;
select * from finish();
rollback;
