begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- BL-237: this file's "published export" checks used to read whatever the
-- real seeded Meyhouse workspace already had published for "the current
-- week" -- current_date's week only matched that real published week on the
-- day it was last published. A throwaway tests.world() that publishes its
-- own shifts for this run's own week means this can never rot with real time
-- again.
select tests.world('ta');
select tests.person('ta', 'mgr', 'manager', array['K'], array['server']);
select tests.person('ta', 'emp', 'employee', array['K'], array['server']);
select tests.person('ta', 'alex', 'employee', array['K'], array['cook']);

-- Five real published shifts at Kadikoy for the export test.
select tests.publish_week('ta', 1, '[
  {"label": "e1", "person": "alex", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "13:00"},
  {"label": "e2", "person": "alex", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "13:00"},
  {"label": "e3", "person": "alex", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"},
  {"label": "e4", "person": "alex", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "13:00"},
  {"label": "e5", "person": "alex", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "13:00"}
]');

-- A draft covers the locations its edits held; this one holds Kadikoy.
select tests.remember('ta:draft:phase5d', gen_random_uuid());
insert into public.schedule_drafts(id,workspace_id,week_start,name,revision,created_by,updated_by,location_ids)
select tests.id('ta:draft:phase5d'), tests.id('ta'), tests.week(1), 'Phase 5D source', 1, tests.user('ta:owner'), tests.user('ta:owner'), array[tests.id('ta:K')];
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note,revision) values
(gen_random_uuid(), tests.id('ta'), tests.id('ta:draft:phase5d'), tests.id('ta:K'), tests.id('ta:alex'), tests.id('ta:job:cook'), null, tests.week(1), '09:00','17:00','Opening',1),
(gen_random_uuid(), tests.id('ta'), tests.id('ta:draft:phase5d'), tests.id('ta:K'), null, tests.id('ta:job:cook'), null, tests.week(1)+1, '10:00','14:00','Open slot',1);

-- authenticated has no USAGE on the tests schema, so every id a role-switched
-- statement needs is resolved here first, while still postgres.
create temp table ta_ids as select
  tests.user('ta:owner') owner_id, tests.user('ta:mgr') mgr, tests.user('ta:emp') emp, tests.user('ta:alex') alex_user,
  tests.id('ta') w, tests.id('ta:K') k, tests.id('ta:B') b, tests.id('ta:alex') alex, tests.id('ta:draft:phase5d') draft_id,
  tests.week(1) week1;
grant select on ta_ids to authenticated;

set local role authenticated;
select throws_ok($$select * from public.schedule_templates$$,'42501',null,'templates deny authenticated table reads');
select throws_ok($$select * from public.schedule_template_shifts$$,'42501',null,'template shifts deny authenticated table reads');
select throws_ok($$select * from public.schedule_export_presets$$,'42501',null,'export presets deny authenticated table reads');
select throws_ok($$select * from public.schedule_template_events$$,'42501',null,'template events deny authenticated table reads');
reset role;

select is((select count(distinct (r.system_key, p.permission_key))::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.workspace_id=(select w from ta_ids) and r.system_key in('owner','admin','manager') and p.permission_key in('schedule.templates.manage','schedule.export')),6,'manager roles receive Phase 5D capabilities');
select is((select count(*)::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.workspace_id=(select w from ta_ids) and r.system_key='employee' and p.permission_key in('schedule.templates.manage','schedule.export')),0,'employee receives no Phase 5D capability');

create temp table phase5d_state(template jsonb,assigned_template jsonb,acquired jsonb,applied jsonb,autofill jsonb,autofill_applied jsonb,exported jsonb,preset jsonb);
update phase5d_state set template=null;
insert into phase5d_state(template) values((select public.create_schedule_template_service(owner_id,w,draft_id,'Standard week',true) from ta_ids));
select is(template->'template'->>'name','Standard week','template creates from named draft') from phase5d_state;
select is((template->'template'->>'shift_count')::integer,2,'template captures every source shift') from phase5d_state;
select is((template->'template'->>'open_slot_count')::integer,2,'assignment stripping creates open slots') from phase5d_state;
select is((select jsonb_array_length(public.list_schedule_templates_service(owner_id,w)->'templates') from ta_ids),1,'template list returns accessible template') from phase5d_state;
select is((select max((x->>'day_offset')::integer) from phase5d_state,jsonb_array_elements(template->'shifts') x),1,'template stores relative day offsets');
select is((select count(*)::integer from public.schedule_template_events where workspace_id=(select w from ta_ids) and action='created'),1,'template creation is audited');
select throws_ok(format($$select public.rename_schedule_template_service(%L,%L,%L,'Stale',99)$$,(select owner_id from ta_ids),(select w from ta_ids),(select template->'template'->>'id' from phase5d_state)),'40001','schedule template revision stale','stale template rename fails');
update phase5d_state s set template=(select public.rename_schedule_template_service(owner_id,w,(s.template->'template'->>'id')::uuid,'Opening pattern',1) from ta_ids);
select is((template->'template'->>'revision')::integer,2,'template rename increments revision') from phase5d_state;
update phase5d_state set assigned_template=(select public.create_schedule_template_service(owner_id,w,draft_id,'Assigned pattern',false) from ta_ids);
select is((assigned_template->'template'->>'open_slot_count')::integer,1,'template may preserve employee assignments') from phase5d_state;
select is((select public.delete_schedule_template_service(owner_id,w,(assigned_template->'template'->>'id')::uuid,1)->>'status' from ta_ids),'deleted','template deletes by revision') from phase5d_state;
select is((select count(*)::integer from public.schedule_template_events where workspace_id=(select w from ta_ids) and action='deleted'),1,'template deletion is audited');

update phase5d_state set acquired=(select public.acquire_schedule_edit_session_service(owner_id,w,week1,'blank',null) from ta_ids);
select is(acquired->>'status','acquired','blank edit session acquired for template apply') from phase5d_state;
update phase5d_state s set applied=(select public.apply_schedule_template_service(owner_id,w,(s.acquired->'session'->>'id')::uuid,(s.acquired->'session'->>'revision')::integer,(s.template->'template'->>'id')::uuid,'overwrite') from ta_ids);
select is(applied->>'status','applied','template applies to active edit lease') from phase5d_state;
select is((applied->>'applied_shift_count')::integer,2,'template apply copies both shifts atomically') from phase5d_state;
select is(jsonb_array_length(applied->'session'->'shifts'),2,'applied session returns complete snapshot') from phase5d_state;
select is((select count(*)::integer from jsonb_array_elements(applied->'session'->'shifts') x where x->>'employee_id' is null),2,'stripped template remains open after apply') from phase5d_state;
select is((select count(*)::integer from public.schedule_template_events where workspace_id=(select w from ta_ids) and action='applied'),1,'template application is audited');
select throws_ok(format($$select public.apply_schedule_template_service(%L,%L,%L,1,%L,'merge')$$,(select owner_id from ta_ids),(select w from ta_ids),(select acquired->'session'->>'id' from phase5d_state),(select template->'template'->>'id' from phase5d_state)),'40001','session revision stale','template apply rejects stale edit revision');

update phase5d_state s set autofill=(select public.preview_schedule_auto_fill_service(owner_id,w,(s.applied->'session'->>'id')::uuid) from ta_ids);
select is(autofill->>'status','review_ready','auto-fill produces review') from phase5d_state;
select ok(jsonb_array_length(autofill->'proposals')>0,'auto-fill proposes eligible employees') from phase5d_state;
select is(autofill->'proposals'->0->>'recommended_employee_id',(select alex::text from ta_ids),'auto-fill recommendation is deterministic') from phase5d_state;
select ok(jsonb_array_length(autofill->'proposals'->0->'candidates')>0,'auto-fill exposes review candidates') from phase5d_state;
select throws_ok(format($$select public.apply_schedule_auto_fill_service(%L,%L,%L,%s,%L,'[]')$$,(select owner_id from ta_ids),(select w from ta_ids),(select autofill->>'session_id' from phase5d_state),(select autofill->>'session_revision' from phase5d_state),repeat('f',64)),'40001','stale auto-fill preview','auto-fill rejects stale fingerprint');
update phase5d_state s set autofill_applied=(select public.apply_schedule_auto_fill_service(owner_id,w,(s.autofill->>'session_id')::uuid,(s.autofill->>'session_revision')::integer,s.autofill->>'fingerprint',
 (select jsonb_agg(jsonb_build_object('shift_id',p->>'shift_id','employee_id',p->>'recommended_employee_id')) from jsonb_array_elements(s.autofill->'proposals') p)) from ta_ids);
select ok(jsonb_array_length(autofill_applied->'applied')>0,'reviewed auto-fill assignments apply') from phase5d_state;
select is((select count(*)::integer from jsonb_array_elements(autofill_applied->'session'->'shifts') x where x->>'employee_id' is not null),jsonb_array_length(autofill_applied->'applied'),'session reflects applied auto-fill assignments') from phase5d_state;

update phase5d_state set exported=(select public.preview_schedule_export_service(owner_id,w,week1,'published',null,array[k]) from ta_ids);
select is(exported->>'status','export_ready','published schedule export previews') from phase5d_state;
select is(jsonb_array_length(exported->'rows'),5,'published export is location scoped') from phase5d_state;
select ok(not exists(select 1 from phase5d_state,jsonb_array_elements(exported->'rows') x where x->>'location_name'<>'Kadikoy'),'export rows do not leak another location');
select is((select jsonb_array_length(public.preview_schedule_export_service(owner_id,w,week1,'draft',draft_id,array[k])->'rows') from ta_ids),2,'named draft export preserves source rows');
select throws_ok(format($$select public.preview_schedule_export_service(%L,%L,%L,'published',null,array[%L::uuid])$$,(select mgr from ta_ids),(select w from ta_ids),(select week1 from ta_ids),(select b from ta_ids)),'42501','Not allowed','manager cannot export another location');

update phase5d_state set preset=(select public.create_schedule_export_preset_service(owner_id,w,'Wall chart','{"format":"print","layout":"weekly","time_format":"12h","include_unassigned":true,"include_notes":false,"include_scheduled_hours":true,"csv_delimiter":","}') from ta_ids);
select is(preset->>'name','Wall chart','export preset creates') from phase5d_state;
select is((select jsonb_array_length(public.list_schedule_export_presets_service(owner_id,w)->'presets') from ta_ids),1,'export preset lists for creator') from phase5d_state;
select is((select public.delete_schedule_export_preset_service(owner_id,w,(preset->>'id')::uuid)->>'status' from ta_ids),'deleted','export preset deletes') from phase5d_state;
select is((select jsonb_array_length(public.list_schedule_export_presets_service(owner_id,w)->'presets') from ta_ids),0,'deleted preset disappears') from phase5d_state;
select throws_ok(format($$select public.create_schedule_template_service(%L,%L,%L,'Denied',true)$$,(select emp from ta_ids),(select w from ta_ids),(select draft_id from ta_ids)),'42501','Not allowed','employee cannot create template');
-- BL-160: the message alone is the same for every authz.* reason; check the
-- reason itself (an employee is refused for missing permission, not, say,
-- a document block).
create function pg_temp.said(statement text) returns text
language plpgsql as $$
declare code text; reason text; what text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, what = pg_exception_detail;
  return concat_ws(' ', code, nullif(reason, ''), nullif(what, ''));
end;
$$;
select is(pg_temp.said(format($$select public.create_schedule_template_service(%L,%L,%L,'Denied',true)$$,(select emp from ta_ids),(select w from ta_ids),(select draft_id from ta_ids))),
  '42501 authz.missing_permission schedule.templates', 'an employee is refused for missing permission, not some other reason');
select throws_ok(format($$select public.preview_schedule_export_service(%L,%L,%L,'published',null,array[%L::uuid])$$,(select emp from ta_ids),(select w from ta_ids),(select week1 from ta_ids),(select k from ta_ids)),'42501','Not allowed','employee cannot export manager schedule');

select * from finish();
rollback;
