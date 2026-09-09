begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('53000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','publish-manager@example.test','','{}','{}',now(),now()),
('53000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','publish-employee@example.test','','{}','{}',now(),now());
insert into public.user_profiles (user_id, display_name) values
('53000000-0000-4000-8000-000000000001','Publish Manager'),
('53000000-0000-4000-8000-000000000002','Publish Employee');
insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations) values
('54000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','53000000-0000-4000-8000-000000000001','manager','active',false),
('54000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','53000000-0000-4000-8000-000000000002','employee','active',true);
insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
values ('54000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001');

insert into public.schedule_drafts (id, workspace_id, week_start, name, revision, created_by, updated_by)
values ('85000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
current_date-(extract(isodow from current_date)::integer-1),'Publication test draft',1,
'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, revision)
select source_shift_id, workspace_id, '85000000-0000-4000-8000-000000000001', location_id,
employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, 1
from public.schedule_published_shifts;

set local role authenticated;
select set_config('request.jwt.claim.sub','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5',true);
select throws_ok($$select * from public.schedule_publication_events$$,'42501',null,'events deny direct authenticated reads');
select throws_ok($$select * from public.schedule_publication_overrides$$,'42501',null,'overrides deny direct authenticated reads');

reset role;
select is((select count(distinct r.system_key)::integer from public.workspace_role_permissions g join public.workspace_roles r on r.id=g.role_id where r.system_key in ('owner','admin','manager') and g.permission_key='schedule.publish'),3,'manager roles receive publish');
select ok(not exists(select 1 from public.workspace_role_permissions g join public.workspace_roles r on r.id=g.role_id where r.system_key='employee' and g.permission_key='schedule.publish'),'employee does not receive publish');

create temp table publication_state (hard jsonb, soft jsonb, published jsonb, unpreview jsonb, unpublished jsonb);
insert into publication_state (hard,soft) values (
 public.preview_schedule_publication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid]),
 public.preview_schedule_publication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000002'::uuid])
);
select is(hard->>'status','hard_blocked','overlap hard-blocks preview') from publication_state;
select is((select count(*)::integer from jsonb_array_elements(hard->'findings') x where x->>'code'='overlap'),1,'overlap finding is canonical') from publication_state;
select throws_ok(format($$select public.publish_schedule_draft_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid],1,%L,'[]')$$,(select hard->>'fingerprint' from publication_state)),'23514','schedule has hard publication blockers','hard blocker cannot be bypassed');
select is((select count(*)::integer from public.schedule_location_publications where location_id='11000000-0000-4000-8000-000000000001'),1,'hard blocked publish rolls back');
select is(soft->>'status','override_required','closed location requires override') from publication_state;
select is((select count(*)::integer from jsonb_array_elements(soft->'findings') x where x->>'code'='closed_location'),1,'closure finding is canonical') from publication_state;
select throws_ok(format($$select public.publish_schedule_draft_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000002'::uuid],1,%L,'[]')$$,(select soft->>'fingerprint' from publication_state)),'22023','publication override reason required','soft finding requires reason');
select throws_ok($$select public.publish_schedule_draft_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000002'::uuid],1,repeat('f',64),'[]')$$,'PT409','stale publication preview','stale fingerprint fails closed');

update publication_state s set published=public.publish_schedule_draft_service(
'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',
array['11000000-0000-4000-8000-000000000002'::uuid],1,s.soft->>'fingerprint',
jsonb_build_array(jsonb_build_object('finding_id',s.soft->'findings'->0->>'id','reason','Private event staffing approved by location manager.')));
select is(published->>'status','published','reviewed draft publishes') from publication_state;
select is((select version_number from public.schedule_location_publications where location_id='11000000-0000-4000-8000-000000000002' and status='current'),2,'republish increments version');
select is((select status::text from public.schedule_location_publications where id='21000000-0000-4000-8000-000000000002'),'superseded','prior version is superseded');
select is((select count(*)::integer from public.schedule_publication_overrides),1,'override is audited');
select is((select count(*)::integer from public.schedule_publication_events where action='published'),1,'publish event is recorded');
select is((select jsonb_array_length(public.get_schedule_read_model_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date)->'shifts')),7,'republish does not duplicate live shifts');

update publication_state set unpreview=public.preview_schedule_unpublication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000002'::uuid]);
select is(unpreview->>'status','unpublish_ready','current location previews for unpublish') from publication_state;
select throws_ok($$select public.unpublish_schedule_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000002'::uuid],repeat('e',64))$$,'PT409','stale unpublication preview','stale unpublish fails closed');
update publication_state s set unpublished=public.unpublish_schedule_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000002'::uuid],s.unpreview->>'fingerprint');
select is(unpublished->>'status','unpublished','selected location unpublishes') from publication_state;
select is((select jsonb_array_length(public.get_schedule_read_model_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date)->'shifts')),5,'unpublished location leaves live read model');
select is((select count(*)::integer from public.schedule_location_publications where location_id='11000000-0000-4000-8000-000000000002'),2,'unpublish preserves history');
select is((select count(*)::integer from public.schedule_publication_events),2,'publish and unpublish events remain');
select is((select jsonb_array_length(public.get_schedule_publication_history_service('53000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1))->'publications')),1,'publication history is limited to manager location scope');

select throws_ok($$select public.preview_schedule_publication_service('53000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid])$$,'42501','schedule publication scope denied','employee cannot preview');
select throws_ok($$select public.preview_schedule_publication_service('53000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000002'::uuid])$$,'42501','schedule publication scope denied','scoped manager cannot preview another location');
set local role postgres;
insert into public.document_types(
 id,workspace_id,title,description,required_at_onboarding,requires_review,accepted_formats,tracks_expiry,expiry_warning_days,expiry_schedule_impact,sort_order,created_by
) values (
 'b9500000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Schedule certificate','Schedule conflict fixture',true,false,array['pdf'],true,14,'track_only',200,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id,status,submitted_at,approved_at,approved_by)
values('b9500000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003','approved',now(),now(),'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.employee_onboarding_requirements(id,workspace_id,case_id,employee_id,kind,source_id,title,required,blocks_activation,requires_review,sort_order,status)
values('b9500000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','b9500000-0000-4000-8000-000000000002','15000000-0000-4000-8000-000000000001','document','b9500000-0000-4000-8000-000000000001','Schedule certificate',true,true,false,200,'completed');
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
values('b9500000-0000-4000-8000-000000000004','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','b9500000-0000-4000-8000-000000000003',1,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/15000000-0000-4000-8000-000000000001/b9500000-0000-4000-8000-000000000003/b9500000-0000-4000-8000-000000000004.pdf','schedule-cert.pdf','application/pdf',1024,'accepted',current_date-(extract(isodow from current_date)::integer-1)-1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
set local role service_role;
select is(jsonb_array_length(public.list_schedule_draft_document_conflicts_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1))->'conflicts'),0,'tracking-only document expiry does not create Schedule conflicts');
set local role postgres;
update public.document_types set expiry_schedule_impact='warn' where id='b9500000-0000-4000-8000-000000000001';
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
values('b9500000-0000-4000-8000-000000000005','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','b9500000-0000-4000-8000-000000000003',2,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/15000000-0000-4000-8000-000000000001/b9500000-0000-4000-8000-000000000003/b9500000-0000-4000-8000-000000000005.pdf','schedule-cert-renewal.pdf','application/pdf',1024,'awaiting_review',current_date + 90,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
create temp table document_conflict_state (soft jsonb, hard jsonb);
grant select, insert, update on document_conflict_state to service_role;
set local role service_role;
insert into document_conflict_state(soft)
values(public.list_schedule_draft_document_conflicts_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1)));
select ok(jsonb_array_length(soft->'conflicts') > 0,'warn document expiry creates Schedule preview conflicts') from document_conflict_state;
select is(soft->'conflicts'->0->>'severity','soft','warn document expiry is a soft conflict') from document_conflict_state;
select is(soft->'conflicts'->0->>'review_action','review_document','pending replacement document exposes review action') from document_conflict_state;
select throws_ok($$select public.list_schedule_draft_document_conflicts_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','7ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1))$$,'42501','schedule manage access denied','same account employee role in another tenant cannot preview Schedule document conflict signals');
set local role postgres;
update public.document_types set expiry_schedule_impact='block' where id='b9500000-0000-4000-8000-000000000001';
select is((select expiry_policy_version from public.document_types where id='b9500000-0000-4000-8000-000000000001'),3,'expiry policy version increments with impact changes');
set local role service_role;
update document_conflict_state
set hard=public.list_schedule_draft_document_conflicts_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1));
select is(hard->'conflicts'->0->>'severity','hard','block document expiry is a hard conflict') from document_conflict_state;
select is(hard->'conflicts'->0->>'overrideable','false','block document expiry is not overrideable') from document_conflict_state;

set local role postgres;
insert into public.schedule_drafts (
  id, workspace_id, week_start, name, revision, created_by, updated_by
) values (
  'b9500000-0000-4000-8000-000000000006',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  current_date - (extract(isodow from current_date)::integer - 1),
  'Document hard conflict publish draft', 1,
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);
insert into public.schedule_draft_shifts (
  id, workspace_id, draft_id, location_id, employee_id, job_id,
  shift_type_id, scheduled_date, start_time, end_time, note, revision
) values (
  'b9500000-0000-4000-8000-000000000007',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'b9500000-0000-4000-8000-000000000006',
  '11000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000002',
  current_date - (extract(isodow from current_date)::integer - 1) + 3,
  '02:00', '03:00', 'Document hard conflict fixture', 1
);
create temp table document_publish_hard_state (preview jsonb);
grant select, insert on document_publish_hard_state to service_role;
set local role service_role;
select is(
  jsonb_array_length(public.list_schedule_draft_document_conflicts_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'b9500000-0000-4000-8000-000000000006',
    current_date - (extract(isodow from current_date)::integer - 1),
    array['11000000-0000-4000-8000-000000000001'::uuid],
    null,
    true
  )->'conflicts'),
  1,
  'scoped document conflict preview returns selected location blockers'
);
select is(
  jsonb_array_length(public.list_schedule_draft_document_conflicts_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'b9500000-0000-4000-8000-000000000006',
    current_date - (extract(isodow from current_date)::integer - 1),
    array['11000000-0000-4000-8000-000000000002'::uuid],
    null,
    true
  )->'conflicts'),
  0,
  'scoped document conflict preview omits unselected location blockers'
);
select throws_ok(
  $$select public.list_schedule_draft_document_conflicts_service(
    '53000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'b9500000-0000-4000-8000-000000000006',
    current_date - (extract(isodow from current_date)::integer - 1),
    array['11000000-0000-4000-8000-000000000002'::uuid],
    null,
    true
  )$$,
  '42501',
  'schedule publication scope denied',
  'scoped document conflict preview rejects inaccessible locations'
);
insert into document_publish_hard_state(preview)
values(public.preview_schedule_publication_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'b9500000-0000-4000-8000-000000000006',
  array['11000000-0000-4000-8000-000000000001'::uuid],
  null,
  true
));
select throws_ok(
  format($$select public.publish_schedule_draft_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'b9500000-0000-4000-8000-000000000006',
    array['11000000-0000-4000-8000-000000000001'::uuid],
    null,
    true,
    1,
    %L,
    '[]'::jsonb)$$,
    (select preview->>'fingerprint' from document_publish_hard_state)),
  '23514', 'schedule has hard document blockers',
  'expired hard-block document prevents publish'
);
select is((select count(*)::integer from public.schedule_location_publications where source_draft_id = 'b9500000-0000-4000-8000-000000000006'), 0, 'hard document conflict publish rolls back');
set local role postgres;
update public.schedule_drafts set week_start=week_start-7 where id='85000000-0000-4000-8000-000000000001';
select is(public.preview_schedule_publication_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','85000000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid])->>'status','past_week_closed','past week closes without payroll dependencies');

select * from finish();
rollback;
