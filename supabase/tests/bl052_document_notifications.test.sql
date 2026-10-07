begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('15200000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl052-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000001','BL052 test','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
 ('35200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','owner','active',true),
 ('35200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','employee','active',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values('45200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','E-0001','Document','Employee','','bl052-2@example.test','15200000-0000-4000-8000-000000000001');
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id)
values('55200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','35200000-0000-4000-8000-000000000002');
insert into public.employee_onboarding_requirements(id,workspace_id,employee_id,case_id,kind,title,required,blocks_activation,requires_review,sort_order,source_snapshot,lifecycle_user_id,lifecycle_settings,deadline_at)
values('65200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','document','Certification',true,false,true,1,
 '{"accepted_formats":["pdf"],"tracks_expiry":true,"timezone":"America/Los_Angeles"}','15200000-0000-4000-8000-000000000002',
 '{"mode":"conditional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":true,"extra_fields":[]}',now()+interval '7 days');

insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values
 ('85200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','West','WEST','1 Road','City','CA','90012','US','America/Los_Angeles'),
 ('85200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','East','EAST','2 Road','City','NY','10001','US','America/New_York');
insert into public.departments(id,workspace_id,name) values('95200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','Kitchen');
insert into public.jobs(id,workspace_id,department_id,name) values
 ('a5200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','95200000-0000-4000-8000-000000000001','Cook'),
 ('a5200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',null,'Host');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
select '25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001',id,id='85200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001' from public.locations where workspace_id='25200000-0000-4000-8000-000000000001';
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select '25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001',id,'15200000-0000-4000-8000-000000000001' from public.jobs where workspace_id='25200000-0000-4000-8000-000000000001';

set constraints all immediate;

-- BL-245: the lease takes the oldest 100 due rows of every workspace, so rows
-- other runs left in a shared local queue push this test's own rows out of
-- the window. Park them for this transaction only (the file rolls back).
create function pg_temp.park_other_outbox() returns void language sql as $$
  update public.notification_outbox set available_at = now() + interval '1 day'
  where workspace_id <> '25200000-0000-4000-8000-000000000001' and status in ('pending', 'retry');
  update public.notification_outbox set lease_expires_at = now() + interval '1 day'
  where workspace_id <> '25200000-0000-4000-8000-000000000001' and status = 'leased';
$$;

-- BL-965: the maintenance batch takes up to 100 cases of every workspace (the shared local DB holds 132),
-- so other worlds' cases would crowd this test's case out of the batch and their documents would decide
-- its outcome. Retire their document requirements for this transaction only (the file rolls back).
create function pg_temp.park_other_documents() returns void language sql as $$
  update public.employee_onboarding_requirements set lifecycle_retired_at = now()
  where workspace_id <> '25200000-0000-4000-8000-000000000001' and kind in ('document', 'acknowledgement')
    and lifecycle_retired_at is null;
$$;
select pg_temp.park_other_documents();

create function pg_temp.maintain(t timestamptz) returns jsonb language sql as $$select public.documents_maintain_service(100,t)$$;
-- outbox rows of one type in this test's workspace
create function pg_temp.outbox(t text) returns integer language sql as $$
  select count(*)::integer from public.notification_outbox where workspace_id = '25200000-0000-4000-8000-000000000001' and type_key = t
$$;
select pg_temp.maintain('2026-03-08 15:59:59Z');
select is(pg_temp.outbox('people.documents.missing'),0,'spring DST date before local 09 emits no digest');
select pg_temp.maintain('2026-03-08 16:00:00Z');
select pg_temp.maintain('2026-03-08 17:00:00Z');
select is(pg_temp.outbox('people.documents.missing'),1,'spring DST local 09 emits exactly one digest across retries');
update public.locations set timezone='America/New_York' where id='85200000-0000-4000-8000-000000000001';
select pg_temp.maintain('2026-03-08 17:01:00Z');
select is(pg_temp.outbox('people.documents.missing'),1,'timezone change cannot duplicate the same employee/org/date digest');
update public.locations set timezone='America/Los_Angeles' where id='85200000-0000-4000-8000-000000000001';
select pg_temp.maintain('2026-11-01 16:59:59Z');
select is(pg_temp.outbox('people.documents.missing'),1,'fall DST uses standard-time 09 boundary');
select pg_temp.maintain('2026-11-01 17:00:00Z');
select is(pg_temp.outbox('people.documents.missing'),2,'fall DST emits at local 09');
update public.employee_onboarding_requirements set lifecycle_exempt=true where id='65200000-0000-4000-8000-000000000001';
select pg_temp.maintain('2026-11-02 17:00:00Z');
select is(pg_temp.outbox('people.documents.missing'),2,'exempt requirements produce no missing reminders');
update public.employee_onboarding_requirements set lifecycle_exempt=false,lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"optional"') where id='65200000-0000-4000-8000-000000000001';
select pg_temp.maintain('2026-11-03 17:00:00Z');
select is(pg_temp.outbox('people.documents.missing'),2,'optional requirements produce no missing reminders');
update public.employee_onboarding_requirements set lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"conditional"') where id='65200000-0000-4000-8000-000000000001';
select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',1,'25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/75200000-0000-4000-8000-000000000001.pdf','proof.pdf','application/pdf',100);
select public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',2,(select id from public.employee_document_submissions where requirement_id='65200000-0000-4000-8000-000000000001' and state='draft'),current_date+365,'{}');
select is(pg_temp.outbox('people.documents.review'),1,'real Submit produces one reviewer event');
select pg_temp.park_other_outbox();
create temp table reviewer_leased as select * from public.lease_notification_outbox_service('bl052-reviewer-worker',100,60);
select public.process_notification_outbox_service('bl052-reviewer-worker',id) from reviewer_leased;
select ok(exists(select 1 from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id join public.notification_events e on e.id=r.event_id where e.type_key='people.documents.review' and r.recipient_user_id='15200000-0000-4000-8000-000000000001'),'review notification is actually projected to its authorized reviewer');
select is(jsonb_array_length(public.get_notification_inbox_v2_service('15200000-0000-4000-8000-000000000001',null,null,null,null,null,null,30)->'notifications'),0,'Account self-document inbox excludes actual reviewer notices');
select pg_temp.maintain('2026-11-04 17:00:00Z');
select is(pg_temp.outbox('people.documents.missing'),2,'pending review is omitted from missing digest');
select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',3,(select id from public.employee_document_submissions where requirement_id='65200000-0000-4000-8000-000000000001' and state='pending_review'),'approve','','full',(select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files where submission_id=(select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001')));
select is(pg_temp.outbox('people.documents.approved'),1,'approval produces one employee event');
select pg_temp.maintain(((current_date+335)::text||' 09:00:00')::timestamp at time zone 'America/Los_Angeles');
select pg_temp.maintain(((current_date+335)::text||' 10:00:00')::timestamp at time zone 'America/Los_Angeles');
select pg_temp.maintain(((current_date+358)::text||' 09:00:00')::timestamp at time zone 'America/Los_Angeles');
select pg_temp.maintain(((current_date+364)::text||' 09:00:00')::timestamp at time zone 'America/Los_Angeles');
select is(pg_temp.outbox('people.documents.expiry'),3,'30/7/1 expiry milestones each enqueue once per approved version');
select pg_temp.park_other_outbox();
create temp table leased as select * from public.lease_notification_outbox_service('bl052-worker',100,60);
select lives_ok($$select public.process_notification_outbox_service('bl052-worker',id) from leased$$,'existing outbox pipeline projects document notifications');
select ok(exists(select 1 from public.notification_inbox_items where workspace_id='25200000-0000-4000-8000-000000000001' and action_url like '/app/account/documents?workspace=25200000-0000-4000-8000-000000000001%'),'employee inbox links retain organization-specific Documents destination');
select is(public.resolve_notification_policy_v1_service('25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','people.documents.missing','email')->>'decision','deny','unsupported document email never reports allowed delivery');
update public.workspace_memberships set status='pending_activation' where user_id='15200000-0000-4000-8000-000000000002';
select is(public.resolve_notification_policy_v1_service('25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','people.documents.missing','in_app')->>'decision','allow','pending onboarding can receive its self-document reminders');
select is(public.resolve_notification_policy_v1_service('25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','schedule.published','in_app')->>'decision','deny','pending onboarding exception does not open unrelated notifications');
select is(app_private.document_notification_policy((select id from public.notification_outbox where workspace_id='25200000-0000-4000-8000-000000000001' and type_key='people.documents.review' limit 1),'15200000-0000-4000-8000-000000000002','{"decision":"allow"}')->>'decision','deny','processing revalidates reviewer permission');
update public.employee_profiles set user_id=null where id='45200000-0000-4000-8000-000000000001';
select is(app_private.document_notification_policy((select id from public.notification_outbox where workspace_id='25200000-0000-4000-8000-000000000001' and type_key='people.documents.approved' limit 1),'15200000-0000-4000-8000-000000000002','{"decision":"allow"}')->>'decision','deny','unlinked account cannot receive a queued private document update');
select is(app_private.document_notification_policy((select id from public.notification_outbox where workspace_id='25200000-0000-4000-8000-000000000001' and type_key='people.documents.missing' limit 1),'15200000-0000-4000-8000-000000000002','{"decision":"allow"}')->>'decision','deny','resolved or unlinked missing reminders are suppressed at processing');
select is(app_private.document_notification_policy((select id from public.notification_outbox where workspace_id='25200000-0000-4000-8000-000000000001' and type_key='people.documents.review' limit 1),'15200000-0000-4000-8000-000000000001','{"decision":"allow"}')->>'decision','deny','already reviewed submissions cannot produce a stale reviewer alert');
update public.employee_onboarding_requirements set lifecycle_retired_at=now() where id='65200000-0000-4000-8000-000000000001';
select is(app_private.document_notification_policy((select id from public.notification_outbox where workspace_id='25200000-0000-4000-8000-000000000001' and type_key='people.documents.expiry' limit 1),'15200000-0000-4000-8000-000000000002','{"decision":"allow"}')->>'decision','deny','retired requirement notifications cannot expose retained private history');

-- BL-965: an approved document that tracks no expiry has no days left. The nightly batch must step over it:
-- before the fix the expiry key was NULL, the dedup insert failed and the whole batch rolled back, so no
-- workspace got its reminders or its suspensions. A second employee of this workspace holds one such
-- document and one overdue requirement that suspends access.
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
 ('35200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000003','employee','active',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values('45200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000003','E-0002','Undated','Employee','','bl052-3@example.test','15200000-0000-4000-8000-000000000001');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
values('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000002','85200000-0000-4000-8000-000000000001',true,'15200000-0000-4000-8000-000000000001');
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id)
values('55200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000002','35200000-0000-4000-8000-000000000003');
insert into public.employee_onboarding_requirements(id,workspace_id,employee_id,case_id,kind,title,required,blocks_activation,requires_review,sort_order,source_snapshot,lifecycle_user_id,lifecycle_settings,deadline_at)
values
 ('65200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000002','55200000-0000-4000-8000-000000000002','document','Food permit',true,false,true,1,
  '{"accepted_formats":["pdf"],"tracks_expiry":false,"timezone":"America/Los_Angeles"}','15200000-0000-4000-8000-000000000003',
  '{"mode":"conditional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":true,"extra_fields":[]}',now()+interval '7 days'),
 ('65200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000002','55200000-0000-4000-8000-000000000002','document','Background check',true,false,true,2,
  '{"accepted_formats":["pdf"],"tracks_expiry":false,"timezone":"America/Los_Angeles"}','15200000-0000-4000-8000-000000000003',
  '{"mode":"conditional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":true,"extra_fields":[]}',now()-interval '1 day');
select is(public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000003','65200000-0000-4000-8000-000000000002',1,
 '25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000002/65200000-0000-4000-8000-000000000002/75200000-0000-4000-8000-000000000003.pdf','permit.pdf','application/pdf',100),2,'undated document: draft');
select is(public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000003','65200000-0000-4000-8000-000000000002',2,
 (select id from public.employee_document_submissions where requirement_id='65200000-0000-4000-8000-000000000002' and state='draft'),null,'{}'),3,'undated document: submitted without an expiry date');
select is(public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000002',3,
 (select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000002'),'approve','','full',
 (select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files where submission_id=(select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000002'))),4,'undated document: approved');
select ok((select s.state='accepted' and s.expiry_date is null from public.employee_onboarding_requirements r join public.employee_document_submissions s on s.id=r.approved_document_id where r.id='65200000-0000-4000-8000-000000000002'),'an approved document without an expiry date is in place');
select lives_ok($$select pg_temp.maintain(((current_date+5)::text||' 10:00:00')::timestamp at time zone 'America/Los_Angeles')$$,'the batch steps over an approved document without an expiry date');
select is((select count(*)::integer from public.notification_outbox where workspace_id='25200000-0000-4000-8000-000000000001' and type_key='people.documents.expiry' and subject_id='45200000-0000-4000-8000-000000000002'),0,'a document without an expiry date gets no expiry reminder');
select ok((select document_suspended_at is not null from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000003'),'the same batch still suspends access for an overdue requirement');
select is((select count(*)::integer from public.notification_outbox where workspace_id='25200000-0000-4000-8000-000000000001' and type_key='people.documents.missing' and subject_id='45200000-0000-4000-8000-000000000002'),1,'the same batch still sends the missing-documents reminder');
select * from finish();rollback;
