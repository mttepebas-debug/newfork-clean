begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('15200000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl052-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000001','BL052 test','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
 ('35200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','owner','active',true),
 ('35200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','employee','active',true)) as legacy(id, workspace_id, user_id, role, status, all_locations);
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


insert into public.employee_document_submissions(id,workspace_id,employee_id,requirement_id,user_id,version,state,expiry_date,submitted_at)
values('c5200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002',1,'accepted','2026-09-15',now());
update public.employee_onboarding_requirements set approved_document_id='c5200000-0000-4000-8000-000000000001' where id='65200000-0000-4000-8000-000000000001';
select is(app_private.document_employee_timezone('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001'),'America/Los_Angeles','primary location supplies reference despite secondary New York location');
select is((select app_private.document_obligation_state(r,'2026-09-16T04:00:00Z') from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'completed','LA reference keeps expiry September15 valid at September16 04UTC');
update public.locations set timezone='America/New_York' where id='85200000-0000-4000-8000-000000000001';
select is((select app_private.document_obligation_state(r,'2026-09-16T04:00:00Z') from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'expired','same instant with NY primary is September16 and expired');
select is((select expiry_date from public.employee_document_submissions where id='c5200000-0000-4000-8000-000000000001'),'2026-09-15'::date,'changing timezone does not rewrite stored expiry date');
select is((select deadline_at from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),now()+interval '7 days','changing timezone does not move exact grace deadline');
update public.employee_profiles set is_remote=true where id='45200000-0000-4000-8000-000000000001';
-- Mert 2026-10-19, BL-559: any live location, primary or not, controls the timezone.
select throws_ok($$select public.set_employee_document_timezone_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,'Europe/London')$$,'22023','an active location controls the document timezone','explicit document timezone cannot override a live location');
update public.employee_location_assignments set ended_at=now() where employee_id='45200000-0000-4000-8000-000000000001' and is_primary;
-- Mert 2026-10-19, BL-559: without a primary the earliest live location supplies the timezone, as for time off.
select is(app_private.document_employee_timezone('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001'),'America/New_York','without a primary the remaining live location supplies the timezone');
update public.employee_location_assignments set ended_at=now() where employee_id='45200000-0000-4000-8000-000000000001' and ended_at is null;
select is(app_private.document_employee_timezone('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001'),null::text,'no fallback to browser/UTC when no live location remains');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'timezone_required','unknown reference is explicit instead of an invented expiry decision');
select throws_ok($$select public.set_employee_document_timezone_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,'Europe/London')$$,'42501','Not allowed','employee cannot change expiry reference');
select throws_ok($$select public.set_employee_document_timezone_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,'PST')$$,'22023','valid IANA timezone required','abbreviation is not accepted as IANA reference');
select is(public.set_employee_document_timezone_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,'Europe/London'),2,'administrator explicitly saves document-only timezone');
select is(app_private.document_employee_timezone('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001'),'Europe/London','remote employee without primary uses explicit document timezone');
update public.employee_location_assignments set ended_at=null where employee_id='45200000-0000-4000-8000-000000000001' and is_primary;
update public.employee_location_assignments set ended_at=null where employee_id='45200000-0000-4000-8000-000000000001' and location_id='85200000-0000-4000-8000-000000000002';
select is(app_private.document_employee_timezone('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001'),'America/New_York','restoring primary restores canonical primary timezone');
select is((select document_timezone from public.employee_profiles where id='45200000-0000-4000-8000-000000000001'),'Europe/London','manual setting retained when primary takes precedence');
select ok((public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',true)->'timezone_settings'->>'can_manage')::boolean=false,'own document detail never offers admin configuration');
select * from finish();rollback;
