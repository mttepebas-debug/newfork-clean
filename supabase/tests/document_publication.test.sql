begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Schema-only replay supplies its own minimal synthetic permission catalog.
insert into public.permissions(key,label,category,description) select p,p,'People',p from unnest(array['documents.read','documents.manage','employee_documents.read','employee_documents.review','employees.read','employees.update']) p on conflict do nothing;
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle)
select 'people.documents.'||kind,1,'people',case when kind in ('review','missing','rejected','restricted') then 'action_required' else 'info' end,'confidential',array['in_app'],'immediate',
 case when kind='review' then 'document_reviewers' else 'document_employee' end,
 jsonb_build_object('route',case when kind='review' then '/app/settings/documents' else '/app/account/documents' end,'allowed_query_keys',jsonb_build_array('workspace','requirement','kind')),
 '{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}'::jsonb,'sensitive_30d','people.documents.'||kind||'.v1','active'
from unnest(array['review','missing','expiry','approved','rejected','restricted','restored','assigned','activated']) kind;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('15200000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl052-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,5) n;
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000001','BL052 test','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
 ('35200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','owner','active',true),
 ('35200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','employee','active',true);
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select r.workspace_id,r.id,p.key from public.workspace_roles r cross join public.permissions p where r.workspace_id='25200000-0000-4000-8000-000000000001' and r.system_key='owner' on conflict do nothing;
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


create temp table publication_test(id uuid, preview jsonb);
insert into publication_test(id) select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',null,null,'{"title":"Publication safety","description":"Document","requires_review":true,"accepted_formats":["pdf"],"tracks_expiry":false,"expiry_warning_days":30,"lifecycle_settings":{"mode":"conditional","assignment_scope":"future_onboarding","target":{"operator":"and","location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"period_days":7,"suspend_on_overdue":true,"extra_fields":[]}}');
select is((select lifecycle_settings->>'assignment_scope' from public.document_types where id=(select id from publication_test)),'all_active','document Save uses fixed active plus future scope');
select is((select publication_status from public.document_types where id=(select id from publication_test)),'draft','new Save is a draft');
set constraints all immediate;
select is((select count(*)::int from public.employee_onboarding_requirements where source_id=(select id from publication_test)),0,'draft has no assignments after dynamic reconciliation');
select throws_ok($$select public.apply_document_definition_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test),1,'fake','Bypass')$$,'PT409','Document must be published before applying assignments','old Apply cannot publish a draft');
update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select is((select preview->'employees'->0->>'action' from publication_test),'assign','publish preview uses real employee matching');
select is((select jsonb_array_length(preview->'locations') from publication_test),2,'preview includes actual employee locations');
select is((select jsonb_array_length(preview->'jobs') from publication_test),2,'preview includes actual jobs');
-- The approval reports the canonical location AND department AND job audience, including unchanged rows.
select is((select preview->'employees'->0->>'matches_target' from publication_test),'true','All filters include the current matching employee');
update public.document_types set lifecycle_settings=jsonb_set(lifecycle_settings,'{target}','{"operator":"and","location_ids":["85200000-0000-4000-8000-000000000001"],"department_ids":["95200000-0000-4000-8000-000000000001"],"job_ids":["a5200000-0000-4000-8000-000000000001"],"employee_ids":[]}') where id=(select id from publication_test);
update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select is((select preview->'employees'->0->>'matches_target' from publication_test),'true','selected location and department and job match together');
update public.document_types set lifecycle_settings=jsonb_set(lifecycle_settings,'{target,job_ids}','["a5200000-0000-4000-8000-000000000002"]') where id=(select id from publication_test);
update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select is((select preview->'employees'->0->>'matches_target' from publication_test),'false','job outside selected department does not match even when employee has both jobs');
select is((select preview->'employees'->0->>'action' from publication_test),'unchanged','unmatched employee is not assigned');
update public.document_types set lifecycle_settings=jsonb_set(lifecycle_settings,'{target}','{"operator":"and","location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]}') where id=(select id from publication_test);
update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select throws_ok($$select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test),(select (preview->>'revision')::int from publication_test),1,'stale','Publish','published')$$,'PT409','Document publication impact changed; refresh preview','stale publish rejected');
select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id,(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Publish','published') from publication_test;
select is((select count(*)::int from public.employee_onboarding_requirements where source_id=(select id from publication_test)),1,'publish assigns once');
select is((select deadline_at from public.employee_onboarding_requirements where source_id=(select id from publication_test)),now()+interval '7 days','first publication uses configured delivery period');
select throws_ok($$update public.document_types set title='Bypass' where id=(select id from publication_test)$$,'PT409','Published documents cannot be edited; unpublish first','DB blocks published content edits');
select throws_ok($$select public.save_document_type_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test),'Legacy bypass','Document',false,true,array['pdf'],false,30,'track_only')$$,'PT409','Published documents cannot be edited; unpublish first','legacy Save cannot bypass publication guard');
update public.employee_onboarding_requirements set deadline_at=now()-interval '1 day',document_suspended_at=now() where source_id=(select id from publication_test);
update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select is((select preview->'employees'->0->>'action' from publication_test),'pause','unpublish preview discloses pause');
select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id,(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Unpublish','draft') from publication_test;
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'paused','unpublish exposes paused obligation');
select ok((select not app_private.document_obligation_blocked(r,now()) from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'unpublish removes this document restriction');
select ok((select deadline_at is null and document_suspended_at is null from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'paused document has no running deadline or suspension');
select is((select app_private.document_obligation_json(r)->>'status' from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'paused','read model exposes pause');
select ok((select (app_private.document_obligation_json(r)->>'remaining_seconds') is null from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'paused read model has no running countdown');
select throws_ok($$select public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002',(select id from public.employee_onboarding_requirements where source_id=(select id from publication_test)),(select lifecycle_revision from public.employee_onboarding_requirements where source_id=(select id from publication_test)),gen_random_uuid(),null,'{}')$$,'PT409','Document is unpublished; changes are paused','submission stops while unpublished');
select throws_ok($$select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002',(select id from public.employee_onboarding_requirements where source_id=(select id from publication_test)),(select lifecycle_revision from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'fake','file.pdf','application/pdf',1)$$,'PT409','Document is unpublished; changes are paused','upload confirmation stops while unpublished');
update public.document_types set lifecycle_settings=jsonb_set(lifecycle_settings,'{period_days}','14'),lifecycle_revision=lifecycle_revision+1 where id=(select id from publication_test);
select is((select publication_status from public.document_types where id=(select id from publication_test)),'draft','editing never auto-publishes');
update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select is((select preview->'employees'->0->>'deadline_action' from publication_test),'restart','republish preview discloses full reset');
select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id,(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Republish','published') from publication_test;
select is((select deadline_at from public.employee_onboarding_requirements where source_id=(select id from publication_test)),now()+interval '14 days','republish uses current full duration, not old remaining time');
select ok((select publication_paused_at is null from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'republish clears publication pause');

-- Each transition uses the exact preview shown to the actor.
create function pg_temp.transition(next_status text) returns jsonb language plpgsql as $$
declare preview jsonb; result jsonb;
begin
 preview:=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test));
 result:=public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test),(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Test transition',next_status);
 return result;
end;
$$;
insert into public.employee_document_submissions(id,workspace_id,employee_id,requirement_id,user_id,version,state,submitted_at)
select '75200000-0000-4000-8000-000000000010',workspace_id,employee_id,id,lifecycle_user_id,1,'pending_review',now()-interval '1 day' from public.employee_onboarding_requirements where source_id=(select id from publication_test);
update public.employee_onboarding_requirements set submitted_document_id='75200000-0000-4000-8000-000000000010',paused_remaining_seconds=60 where source_id=(select id from publication_test);
select pg_temp.transition('draft');
select throws_ok($$select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from public.employee_onboarding_requirements where source_id=(select id from publication_test)),(select lifecycle_revision from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'75200000-0000-4000-8000-000000000010','approve','','full','{}')$$,'PT409','Document is unpublished; changes are paused','manager review stops while unpublished');
select is((select paused_remaining_seconds from public.employee_onboarding_requirements where source_id=(select id from publication_test)),60::numeric,'publication pause preserves review pause independently');
select pg_temp.transition('published');
select is((select paused_remaining_seconds from public.employee_onboarding_requirements where source_id=(select id from publication_test)),1209600::numeric,'republish gives pending review the full current period');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'pending_review','republish does not auto-approve a pending review');
update public.employee_document_submissions set state='accepted',reviewed_at=now(),expiry_date=current_date+30 where id='75200000-0000-4000-8000-000000000010';
update public.employee_onboarding_requirements set approved_document_id='75200000-0000-4000-8000-000000000010',status='completed',deadline_at=null,paused_remaining_seconds=null where source_id=(select id from publication_test);
select pg_temp.transition('draft');select pg_temp.transition('published');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'completed','valid approved evidence remains complete after republish');
select ok((select deadline_at is null from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'completed approval receives no artificial deadline');
select is((select expiry_date from public.employee_document_submissions where id='75200000-0000-4000-8000-000000000010'),current_date+30,'actual certificate expiration is unchanged');
select pg_temp.transition('draft');
-- Other document restrictions must survive this document pause.
update public.employee_onboarding_requirements set lifecycle_settings=jsonb_set(lifecycle_settings,'{suspend_on_overdue}','true'),deadline_at=now()-interval '1 day' where id='65200000-0000-4000-8000-000000000001';
select ok(app_private.document_actor_blocked('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001'),'another overdue document still blocks access');
update public.employee_onboarding_requirements set deadline_at=now()+interval '7 days' where id='65200000-0000-4000-8000-000000000001';
insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values('85200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','North','NORTH','3 Road','City','CA','90012','US','America/Los_Angeles');
update public.document_types set lifecycle_settings=jsonb_set(lifecycle_settings,'{target,location_ids}','["85200000-0000-4000-8000-000000000003"]'),lifecycle_revision=lifecycle_revision+1 where id=(select id from publication_test);
select is(public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test))->'employees'->0->>'action','remove','republish shows closure for a former target');
select pg_temp.transition('published');
select ok((select lifecycle_closed_at is not null and publication_paused_at is null from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'former target is closed without a paused backlog');
select is((select approved_document_id::text from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'75200000-0000-4000-8000-000000000010','closure preserves approved evidence');
select pg_temp.transition('draft');select pg_temp.transition('published');
select ok((select lifecycle_closed_at is not null from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'republish does not reopen a closed requirement');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) values('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','85200000-0000-4000-8000-000000000003','15200000-0000-4000-8000-000000000001');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'completed','joining a target later reuses valid approved evidence');
update public.employee_onboarding_requirements set lifecycle_exempt=true where source_id=(select id from publication_test);
update public.employee_profiles set archived_at=now() where id='45200000-0000-4000-8000-000000000001';
update public.employee_profiles set archived_at=null where id='45200000-0000-4000-8000-000000000001';
select ok((select lifecycle_exempt from public.employee_onboarding_requirements where source_id=(select id from publication_test)),'unarchive preserves individual exemption');
update public.employee_onboarding_requirements set lifecycle_exempt=false where source_id=(select id from publication_test);
-- The archived employee is ineligible until restoration, then receives the published document dynamically.
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values('35200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000003','employee','active',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by,archived_at) values('45200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000003','E-0003','Archived','Employee','','bl052-3@example.test','15200000-0000-4000-8000-000000000001',now());
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) values('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000003','85200000-0000-4000-8000-000000000003','15200000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),0,'archived employee receives no new obligation');
update public.employee_profiles set archived_at=null where id='45200000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),1,'unarchive assigns a matching published document');
select throws_ok($$select public.preview_document_publication_service('15200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001',(select id from publication_test))$$,'42501','document management access required','non-manager cannot preview publication');
select throws_ok($$select public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000002',(select id from publication_test))$$,'42501','document management access required','cross-tenant publication is denied');

-- Full target visibility is required even if a scoped manager can see the employee through one location.
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values('35200000-0000-4000-8000-000000000004','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000004','manager','active',false);
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select workspace_id,role_id,'documents.manage' from public.workspace_memberships where id='35200000-0000-4000-8000-000000000004' on conflict do nothing;
insert into public.membership_location_scopes(workspace_id,membership_id,location_id) values('25200000-0000-4000-8000-000000000001','35200000-0000-4000-8000-000000000004','85200000-0000-4000-8000-000000000003');
select throws_ok($$select public.preview_document_publication_service('15200000-0000-4000-8000-000000000004','25200000-0000-4000-8000-000000000001',(select id from publication_test))$$,'42501','Complete document target access required','partial location visibility cannot publish broader effects');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values('35200000-0000-4000-8000-000000000005','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000005','employee','pending_activation',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by) values('45200000-0000-4000-8000-000000000005','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000005','E-0005','Future','Employee','','bl052-5@example.test','15200000-0000-4000-8000-000000000001');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) values('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000005','85200000-0000-4000-8000-000000000003','15200000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000005' and source_id=(select id from publication_test)),1,'future onboarding receives published matching document');
select pg_temp.transition('draft');
select ok(not app_private.document_activation_blocked((select r from public.employee_onboarding_requirements r where employee_id='45200000-0000-4000-8000-000000000005' and source_id=(select id from publication_test))),'publication pause removes the onboarding activation gate');
select ok(not app_private.enqueue_document_notification('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','test-paused-expiry','expiry','Expires','Soon',(select id from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000001' and source_id=(select id from publication_test)),null),'paused expiry reminder producer is suppressed');
select pg_temp.transition('published');
select app_private.enqueue_document_notification('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','test-before-pause','expiry','Expires','Soon',(select id from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000001' and source_id=(select id from publication_test)),null);
create temp table queued_expiry as select id from public.notification_outbox where type_key='people.documents.expiry' order by created_at desc limit 1;
select is(app_private.document_notification_policy((select id from queued_expiry),'15200000-0000-4000-8000-000000000002','{"decision":"allow"}')->>'decision','allow','current published reminder is eligible');
select pg_temp.transition('draft');
select is(app_private.document_notification_policy((select id from queued_expiry),'15200000-0000-4000-8000-000000000002','{"decision":"allow"}')->>'decision','deny','delayed requirement reminder is suppressed while unpublished');
select pg_temp.transition('published');
select is(app_private.document_notification_policy((select id from queued_expiry),'15200000-0000-4000-8000-000000000002','{"decision":"allow"}')->>'decision','deny','republish does not replay the old reminder backlog');
-- Optional documents never receive an artificial countdown or block.
select pg_temp.transition('draft');
update public.document_types set lifecycle_settings=jsonb_set(jsonb_set(jsonb_set(lifecycle_settings,'{mode}','"optional"'),'{period_days}','null'),'{suspend_on_overdue}','false'),lifecycle_revision=lifecycle_revision+1 where id=(select id from publication_test);
select pg_temp.transition('published');
select ok((select bool_and(deadline_at is null and not app_private.document_obligation_blocked(r,now())) from public.employee_onboarding_requirements r where source_id=(select id from publication_test)),'optional republish creates no timer or access restriction');

-- Exemption changes do not restart an unpublished document's clock or trap a future exemption removal.
select pg_temp.transition('draft');
select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id,lifecycle_revision,true,'Individual exception') from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test);
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),'exempt','explicit exemption remains visible while unpublished');
select throws_ok($$select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),(select lifecycle_revision from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),false,'Remove')$$,'PT409','Document is unpublished; changes are paused','exemption removal cannot restart an unpublished requirement');
select pg_temp.transition('published');
select ok((select lifecycle_exempt and publication_paused_at is null from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),'republish preserves exemption without a stale publication pause');
select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id,lifecycle_revision,false,'Remove after publish') from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test);
select ok((select not lifecycle_exempt from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),'existing exemption workflow remains usable after republish');
select pg_temp.transition('draft');
update public.employee_profiles set archived_at=now() where id='45200000-0000-4000-8000-000000000003';
select pg_temp.transition('published');
select ok((select lifecycle_closed_at is not null and publication_paused_at is null from public.employee_onboarding_requirements where employee_id='45200000-0000-4000-8000-000000000003' and source_id=(select id from publication_test)),'republish closes an employee archived during publication pause');
select * from finish();
rollback;
