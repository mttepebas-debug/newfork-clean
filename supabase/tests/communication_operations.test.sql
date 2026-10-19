begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- A refusal's code and the reason the core gives, '42501 authz.out_of_scope'
-- (FOUNDATION-B "hayır" contract).
create function pg_temp.refusal(statement text) returns text language plpgsql as $f$
declare state text; hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end;
$f$;
grant execute on function pg_temp.refusal(text) to service_role;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('a8000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-manager@example.test','','{}','{}',now(),now()),
 ('a8000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-employee-one@example.test','','{}','{}',now(),now()),
 ('a8000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-employee-two@example.test','','{}','{}',now(),now()),
 ('a8000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-outsider@example.test','','{}','{}',now(),now());
insert into public.user_profiles(user_id,display_name) values
 ('a8000000-0000-4000-8000-000000000001','Scoped Manager'),
 ('a8000000-0000-4000-8000-000000000002','Employee One'),
 ('a8000000-0000-4000-8000-000000000003','Employee Two');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
 ('a8100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000001','manager','active',false),
 ('a8100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000002','employee','active',false),
 ('a8100000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000003','employee','active',false)) as legacy(id, workspace_id, user_id, role, status, all_locations);
select tests.works_at('a8100000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001');
select tests.works_at('a8100000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002');
update public.employee_profiles set user_id='a8000000-0000-4000-8000-000000000002' where id='15000000-0000-4000-8000-000000000001';
update public.employee_location_assignments set ended_at=now() where employee_id='15000000-0000-4000-8000-000000000001' and ended_at is null;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',true,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
update public.workspace_onboarding
set status='complete',
    current_step=4,
    completed_at=coalesce(completed_at, now())
where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd';

set local role service_role;
select is((select is_active from public.list_my_workspaces_service('a8000000-0000-4000-8000-000000000002') where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'),false,'workspace list returns false when an active preference has not been chosen');
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select throws_ok($$select * from public.announcements$$,'42501',null,'browser roles cannot read announcement tables directly');
select throws_ok($$select public.get_announcements_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501',null,'browser roles cannot invoke service announcement RPCs');
reset role;

select is(pg_temp.refusal($$select public.get_announcements_service('a8000000-0000-4000-8000-000000000004','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$),'42501 authz.not_member','cross-tenant announcement reads fail closed: not a member');
-- EKRAN-08: one record; it goes out to whoever works at a checked location or
-- was added by hand (K24), and the writer may only reach places they control (K1).
create function pg_temp.post(title text, body text, location_ids text[], people text[] default '{}', ask_ack boolean default false)
returns jsonb language sql as $f$
  select jsonb_build_object('title', title, 'body', body, 'category', 'staff_meeting', 'ask_ack', ask_ack,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('location_id', l, 'day', 'open')) from unnest(location_ids) l), '[]'),
    'people', to_jsonb(people))
$f$;
grant execute on function pg_temp.post(text, text, text[], text[], boolean) to service_role;
select is(pg_temp.refusal($$select public.save_announcement_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,pg_temp.post('No access','Body',array['11000000-0000-4000-8000-000000000001']),'draft')$$),'42501 authz.missing_permission','employees cannot manage announcements: no permission');
select is(pg_temp.refusal($$select public.save_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,pg_temp.post('Other location','Body',array['11000000-0000-4000-8000-000000000002']),'draft')$$),'42501 authz.out_of_scope','location-scoped manager cannot target another location: out of scope');
select is(pg_temp.refusal($$select public.save_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,pg_temp.post('Someone elsewhere','Body','{}',array['a8000000-0000-4000-8000-000000000003']),'draft')$$),'42501 authz.out_of_scope','location-scoped manager cannot add by hand someone who works elsewhere (K1): out of scope');
select is((public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,pg_temp.post('Owner draft','Private owner draft','{}'),'draft')->>'status'),'draft','owner can start a draft for no location yet');
select is((select count(*)::integer from jsonb_array_elements(public.get_announcements_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements') item where item->>'title'='Owner draft'),0,'a draft is its writer''s own: the scoped manager does not see the owner''s');

create temp table communication_state(announcement_id uuid,revision integer,manual_todo_id uuid);
grant select on communication_state to service_role;
with saved as (
 select public.save_announcement_service(
  'a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,
  pg_temp.post('Service briefing','Doors open at 4 PM.',array['11000000-0000-4000-8000-000000000001'],'{}',true),'draft') result
) insert into communication_state(announcement_id,revision) select (result->>'announcement_id')::uuid,(result->>'revision')::integer from saved;
select is((select status::text from public.announcements announcement join communication_state state on state.announcement_id=announcement.id),'draft','announcement starts as a draft');
select is((select public.save_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',announcement_id,revision,
  pg_temp.post('Service briefing','Doors open at 4 PM.',array['11000000-0000-4000-8000-000000000001'],'{}',true),'publish')->>'recipient_count' from communication_state),'2','publication reaches the employee and the owner, who both work at the checked location (K24)');
select is((select to_jsonb(array(select u from unnest(announcement.delivered_to) u order by u)) from public.announcements announcement join communication_state state on state.announcement_id=announcement.id),'["a8000000-0000-4000-8000-000000000002", "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"]'::jsonb,'not the employee at the other location, not the manager who wrote it (KK-89)');
update communication_state set revision=2;
create function pg_temp.listed(who uuid) returns jsonb language sql as $f$
  select item from jsonb_array_elements(public.get_announcements_service(who,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements') item
  where (item->>'id')::uuid=(select announcement_id from communication_state)
$f$;
grant execute on function pg_temp.listed(uuid) to service_role;
select isnt(pg_temp.listed('a8000000-0000-4000-8000-000000000002'),null,'target employee sees the published announcement');
select is(pg_temp.listed('a8000000-0000-4000-8000-000000000003'),null,'employee at another location cannot see the announcement');
-- ROL-CIFT: no membership reaches every location by a flag any more. The nearest thing, giving the
-- employee membership locations to manage, is refused, and they still do not see the announcement.
select throws_ok($$insert into public.membership_managed_locations (workspace_id, membership_id, location_id)
  values ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'a8100000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'an employee membership is not given a location to manage beyond where it works');
select is(pg_temp.listed('a8000000-0000-4000-8000-000000000003'),null,'an employee membership without a matching location assignment cannot see the announcement');
select is(pg_temp.refusal($$select public.acknowledge_announcement_service('a8000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from communication_state))$$),'42501 authz.out_of_scope','employee cannot acknowledge an announcement outside their assignments: out of scope, as an unknown one');
select isnt((public.acknowledge_announcement_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from communication_state))->>'acknowledged_at'),null,'target employee can acknowledge the announcement');
select isnt(pg_temp.listed('a8000000-0000-4000-8000-000000000002')->>'acknowledged_at',null,'acknowledged announcement stays listed with its acknowledgement');
select is(pg_temp.refusal($$select public.save_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from communication_state),1,pg_temp.post('Service briefing','Doors open at 4 PM.',array['11000000-0000-4000-8000-000000000001']),'save')$$),'PT409 announcement.changed','a change is revision guarded (BL-958: PT409, not the 40001 PostgREST retries forever)');

select is((select public.set_announcement_state_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',announcement_id,revision,'unpublish')->>'status' from communication_state),'unpublished','publisher can unpublish the projected announcement');
select isnt((select public.set_announcement_state_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',announcement_id,revision+1,'archive')->>'archived_at' from communication_state),null,'and then archive it (K8)');

select lives_ok($$select public.save_workspace_layout_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array['quick_actions','operations','pending_requests','open_shifts','announcements','todos'],array['quick_actions'])$$,'valid fixed-catalog Workspace layout is saved (six cards since BILDIRIM-06)');
select throws_ok($$select public.save_workspace_layout_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array['operations','operations','pending_requests','open_shifts','announcements','todos'],array[]::text[])$$,'22023','valid workspace layout required','duplicate widgets are rejected');
select is((public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'layout'->'widget_order'->>0),'quick_actions','Workspace dashboard returns the synced personal order');
select is(
  (public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'layout'->'widget_order' ? 'todos'),
  true,
  'Workspace dashboard includes the todos widget catalog entry'
);
insert into public.workspace_layout_preferences(workspace_id,user_id,widget_order,hidden_widget_ids)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000001',array['operations','pending_requests','open_shifts','announcements','quick_actions'],array[]::text[])
on conflict(workspace_id,user_id) do update set widget_order=excluded.widget_order,hidden_widget_ids=excluded.hidden_widget_ids;
select is(
  (public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'layout'->'widget_order'->>5),
  'todos',
  'a saved layout without a card gets it appended without dropping saved order'
);
insert into public.document_types(
 id,workspace_id,title,description,required_at_onboarding,requires_review,accepted_formats,tracks_expiry,expiry_warning_days,expiry_schedule_impact,sort_order,created_by
) values (
 'a9700000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Food handler card','Expiring certificate',true,false,array['pdf'],true,14,'track_only',90,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);
-- A document requirement is only created against a published document
-- type; against a draft, or a type that does not exist, the row is dropped
-- without a word and everything that points at it fails later.
update public.document_types set publication_status='published' where id='a9700000-0000-4000-8000-000000000001';
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id,status)
values('a9700000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','in_progress');
insert into public.employee_onboarding_requirements(id,workspace_id,case_id,employee_id,kind,source_id,title,required,blocks_activation,requires_review,sort_order,status)
values('a9700000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a9700000-0000-4000-8000-000000000002','15000000-0000-4000-8000-000000000001','document','a9700000-0000-4000-8000-000000000001','Food handler card',true,true,false,90,'completed');
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
values('a9700000-0000-4000-8000-000000000004','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','a9700000-0000-4000-8000-000000000003',1,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/15000000-0000-4000-8000-000000000001/a9700000-0000-4000-8000-000000000003/b9700000-0000-4000-8000-000000000004.pdf','food-handler.pdf','application/pdf',1024,'accepted',current_date + 3,'a8000000-0000-4000-8000-000000000002');
select is((public.sync_expiring_document_todos_service('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'opened_or_refreshed')::integer,1,'expiring accepted document creates one source-linked todo');
select is((public.get_workspace_dashboard_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'todos'->0->>'body'),'Alex Kim - Food handler card','Workspace dashboard lists the document-expiry todo to whoever reads the document');
-- KK-179 (5), BL-807: a manager without document access gets no document-expiry to-do. The built-in
-- Manager has document access since BL-560, so here the Scoped Manager's role loses it first.
delete from public.workspace_role_permissions
where role_id = (select role_id from public.workspace_memberships where id = 'a8100000-0000-4000-8000-000000000001')
  and permission_key like 'employee_documents.%';
select is((select count(*)::integer from jsonb_array_elements(public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'todos') t where t->>'source_type'='employee_document_expiry'),0,'Workspace dashboard keeps the document-expiry todo from a manager without document access');
select is((select count(*)::integer from public.workspace_todos where source_type='employee_document_expiry' and source_id='a9700000-0000-4000-8000-000000000004'),1,'document-expiry todo sync is deduped by source');
select is(pg_temp.refusal($$select public.create_workspace_todo_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Employee task','',null,null)$$),'42501 authz.missing_permission','employee-only users cannot create Workspace todos: no permission');
select is(pg_temp.refusal($$select public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$),'42501 authz.missing_permission','employee-only users cannot open manager Workspace: no permission');
select is((public.create_workspace_todo_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Scoped follow-up','Review employee file','15000000-0000-4000-8000-000000000001',now()+interval '1 day')->>'employee_id'),'15000000-0000-4000-8000-000000000001','manager can create a manual todo for an employee in scope');
with saved as (
 select public.create_workspace_todo_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Owner follow-up','',null,null) result
) update communication_state set manual_todo_id=(result->>'id')::uuid from saved;
select is(pg_temp.refusal($$select public.resolve_workspace_todo_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select id from public.workspace_todos where source_type='employee_document_expiry' limit 1))$$),'42501 authz.missing_permission','system-generated todos cannot be manually resolved, not even by the owner');
select is((select public.resolve_workspace_todo_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',manual_todo_id)->>'status' from communication_state),'resolved','manual Workspace todos can be resolved directly');
update public.employee_documents set review_status='superseded' where id='a9700000-0000-4000-8000-000000000004';
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
values('a9700000-0000-4000-8000-000000000005','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','a9700000-0000-4000-8000-000000000003',2,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/15000000-0000-4000-8000-000000000001/a9700000-0000-4000-8000-000000000003/b9700000-0000-4000-8000-000000000005.pdf','food-handler-renewed.pdf','application/pdf',1024,'accepted',current_date + 400,'a8000000-0000-4000-8000-000000000002');
select is((public.sync_expiring_document_todos_service('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'resolved')::integer,1,'source-linked system todo resolves only after the source document is no longer expiring');

-- BL-804: Workspace's "today" is each location's own day, never UTC's.
-- Pago Pago (UTC-11) and Kiritimati (UTC+14): at every hour at least one of
-- them reads another date than UTC (Pago Pago before 11:00 UTC, Kiritimati
-- from 10:00), so the owner's sums cannot pass on UTC counting at any hour.
update public.locations set timezone='Pacific/Pago_Pago' where id='11000000-0000-4000-8000-000000000001';
update public.locations set timezone='Pacific/Kiritimati' where id='11000000-0000-4000-8000-000000000002';
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('a8000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-placeless-manager@example.test','','{}','{}',now(),now());
insert into public.user_profiles(user_id,display_name) values ('a8000000-0000-4000-8000-000000000005','Placeless Manager');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
 ('a8100000-0000-4000-8000-000000000005','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000005','manager','active',false)) as legacy(id, workspace_id, user_id, role, status, all_locations);
create temp table today_before as select
  public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'metrics' manager,
  public.get_workspace_dashboard_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'metrics' owner;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,status,published_by) values
 ('a9800000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',date '2000-01-03',1,'current','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
 ('a9800000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002',date '2000-01-03',1,'current','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
-- Each location: two open shifts on its own today, plus one on UTC's date
-- when that is another day there. (Open shifts: an assignment would ask the
-- availability guard about the seed person, which is not this test.)
insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone,source_shift_id)
select location.workspace_id, location.id, publication.id, '13000000-0000-4000-8000-000000000001',
  case slot.kind when 'utc' then current_date else (now() at time zone location.timezone)::date end,
  slot.starts, slot.ends, 'explicit', location.timezone, gen_random_uuid()
from public.locations location
join public.schedule_location_publications publication on publication.location_id=location.id and publication.week_start=date '2000-01-03'
cross join (values
  ('today', time '09:00', time '12:00'),
  ('today', time '13:00', time '16:00'),
  ('utc', time '17:00', time '20:00')
) slot(kind, starts, ends)
where location.id in ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002')
  and (slot.kind='today' or current_date <> (now() at time zone location.timezone)::date);
select is((public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'metrics'->>'today_shift_count')::integer - (select (manager->>'today_shift_count')::integer from today_before),2,'Workspace counts a location''s shifts on that location''s own today, not UTC''s (BL-804)');
select is((public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'metrics'->>'today_open_shift_count')::integer - (select (manager->>'today_open_shift_count')::integer from today_before),2,'Workspace counts open shifts on the location''s own today (BL-804)');
select is((public.get_workspace_dashboard_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'metrics'->>'today_shift_count')::integer - (select (owner->>'today_shift_count')::integer from today_before),4,'two locations in two zones: the total adds each location''s own today (KK-179)');
select is((public.get_workspace_dashboard_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'metrics'->>'today_open_shift_count')::integer - (select (owner->>'today_open_shift_count')::integer from today_before),4,'two locations in two zones: open shifts add each location''s own today (KK-179)');
select is((public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'today_ends_at')::timestamptz,((now() at time zone 'Pacific/Pago_Pago')::date + 1)::timestamp at time zone 'Pacific/Pago_Pago','today ends at the next midnight of the locations in view, so the page can turn the day (BL-804)');
select is(public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000005','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'today_ends_at','null'::jsonb,'with no location in view there is no day to turn');
set local role postgres;
update public.employee_documents set expiry_date=current_date + 1 where id='a9700000-0000-4000-8000-000000000005';
update public.workspaces set lifecycle_status='deleted', closed_at=now(), closed_by='a8000000-0000-4000-8000-000000000001' where id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd';
set local role service_role;
select is((public.sync_expiring_document_todos_service('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'opened_or_refreshed')::integer,0,'closed workspaces do not create document-expiry todos');
select is(pg_temp.refusal($$select public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$),'42501 authz.workspace_closed','a deleted workspace opens to nobody: closed comes before any permission');
set local role postgres;
select is((select count(*)::integer from public.audit_events event join communication_state state on event.target_id=state.announcement_id::text where event.action='announcement.published'),1,'announcement publication writes an audit event');

select * from finish();
rollback;
