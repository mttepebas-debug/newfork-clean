begin;

create extension if not exists pgtap with schema extensions;

select no_plan();



create function pg_temp.run(action text,payload jsonb) returns jsonb language sql as $$

select public.lineup_operations_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',action,payload);

$$;

create temp table lu_test(target jsonb,op jsonb,preview jsonb,result jsonb,share jsonb,source_id uuid,slot_id uuid);

insert into lu_test(target) values('{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","job_id":"13000000-0000-4000-8000-000000000001","shift_type_id":"14000000-0000-4000-8000-000000000001","start_time":"09:00","end_time":"17:00","section_id":null,"station":"Tables 21–26"}');

-- Planning availability is declared before the first publication.
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,coalesce((select max(version_number) from public.employee_schedule_availability_versions where employee_id=e.id),0)+1,'America/Los_Angeles',

  (select jsonb_agg(jsonb_build_object('day',n,'mode',case when e.id='15000000-0000-4000-8000-000000000001' and n=5 then 'windows' else 'unrestricted' end,'windows',case when e.id='15000000-0000-4000-8000-000000000001' and n=5 then '[{"start":"00:00","end":"06:00"},{"start":"12:00","end":"15:00"}]'::jsonb else '[]'::jsonb end)) from generate_series(0,6) n),'manager','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','2030-01-07',null

from public.employee_profiles e where e.id in('15000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002');

insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',id,'2030-01-07',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.locations where id in('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002');

insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,l.id,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e cross join public.locations l

where e.id in('15000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002') and l.id in('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002')

and not exists(select 1 from public.employee_location_assignments a where a.employee_id=e.id and a.location_id=l.id and a.ended_at is null);

insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,'13000000-0000-4000-8000-000000000001','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e

where e.id='15000000-0000-4000-8000-000000000002' and not exists(select 1 from public.employee_job_assignments a where a.employee_id=e.id and a.job_id='13000000-0000-4000-8000-000000000001' and a.ended_at is null);



select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001',target)->>'status','eligible','full availability with position and location match is eligible') from lu_test;

select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001',target||'{"job_id":"13000000-0000-4000-8000-000000000003"}')->>'status','ineligible','wrong position is blocked') from lu_test;

select is(upper(public.lineup_shift_range('2030-01-07','22:00','02:00','America/Los_Angeles'))-lower(public.lineup_shift_range('2030-01-07','22:00','02:00','America/Los_Angeles')),interval '4 hours','overnight interval preserves adjacent day');

select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001',target||'{"start_time":"22:00","end_time":"02:00"}')->>'status','eligible','unrestricted availability covers midnight') from lu_test;



update lu_test set op=jsonb_build_object('kind','assign','source_entry_id',null,'target_entry_id',null,'employee_id','15000000-0000-4000-8000-000000000001','target',target,'reason','Integration test assignment','travel_minutes',0);

update lu_test set preview=pg_temp.run('preview',jsonb_build_object('operation',op));

select is(preview->>'allowed','true','assignment preview validates') from lu_test;
update public.locations set lineup_operations_enabled=false where id='11000000-0000-4000-8000-000000000001';
select is(pg_temp.run('state','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001"}')->>'read_only','true','rollout switch preserves read access and reports read-only');
select is(pg_temp.run('preview',jsonb_build_object('operation',op))->>'allowed','false','disabled rollout location cannot accept staffing changes') from lu_test;
select throws_ok($$select pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from lu_test$$,'P0001',null,'rollout switch is rechecked when committing a prior preview');
update public.locations set lineup_operations_enabled=true where id='11000000-0000-4000-8000-000000000001';


update lu_test set result=pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','aaa00000-0000-4000-8000-000000000001'));

select is(result->>'status','applied','assignment commits') from lu_test;

select is((select employee_id::text from public.schedule_published_shifts where id=(result->>'shift_id')::uuid),'15000000-0000-4000-8000-000000000001','assignment changes canonical Schedule') from lu_test;

select is(pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','aaa00000-0000-4000-8000-000000000001'))->>'event_id',result->>'event_id','same idempotency key returns the existing event') from lu_test;

select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001',target)->>'status','ineligible','overlapping assignment is rejected') from lu_test;

update lu_test set source_id=(result->>'shift_id')::uuid;

update lu_test set op=jsonb_build_object('kind','move','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=lu_test.source_id),'target_entry_id',null,'employee_id','15000000-0000-4000-8000-000000000001','target',target||'{"location_id":"11000000-0000-4000-8000-000000000002"}','reason','Cross-location integration test','travel_minutes',0);

update lu_test set preview=pg_temp.run('preview',jsonb_build_object('operation',op));

select is(preview->>'allowed','true','move ignores its own source shift') from lu_test;

update lu_test set result=pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','aaa00000-0000-4000-8000-000000000002'));

select is((select location_id::text from public.schedule_published_shifts where id=source_id),'11000000-0000-4000-8000-000000000002','canonical shift moves to destination') from lu_test;

select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date='2030-01-07' and employee_id is null and location_id='11000000-0000-4000-8000-000000000001'),1,'move leaves a real open source need');



update lu_test set result=pg_temp.run('note','{"note_id":null,"expected_revision":null,"note":{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000002","shift_type_id":null,"section_id":null,"category":"priority","content":"Private manager context","visibility":"managers","pinned":true,"expires_at":null}}');

select is(result->>'content','Private manager context','private note persists') from lu_test;

update lu_test set preview=public.preview_schedule_lineup_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000002'::uuid]);

select ok(not preview::text like '%Private manager context%','private notes are excluded from preview and export data') from lu_test;

update lu_test set share=public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000002'::uuid],preview->>'fingerprint');

select is(share->>'status','shared','share creates snapshot') from lu_test;
select is((pg_temp.run('shared_export','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000002"}')->'locations'->0->>'shared_at')::timestamptz,(select shared_at from public.schedule_lineup_snapshots where id=(share->'snapshot_ids'->>0)::uuid),'export metadata uses the actual snapshot publication time') from lu_test;

select is((select count(*)::integer from public.lineup_receipts where snapshot_id=(share->'snapshot_ids'->>0)::uuid),1,'share creates a version-bound receipt for the assigned employee') from lu_test;

select is((select count(*)::integer from public.lineup_notification_outbox where snapshot_id=(share->'snapshot_ids'->>0)::uuid),1,'share creates a transactional notification outbox item') from lu_test;

select ok((select acknowledged_at is null from public.lineup_receipts where snapshot_id=(share->'snapshot_ids'->>0)::uuid),'publishing does not acknowledge on behalf of employee') from lu_test;

select lives_ok($$select pg_temp.run('state','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000002"}')$$,'manager operations state reads notes and receipts');



update public.employee_profiles set user_id='d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' where id='15000000-0000-4000-8000-000000000001';

select is(jsonb_array_length(pg_temp.run('published','{"from":"2030-01-07","to":"2030-01-07"}')),1,'employee receives only their shared plans');

update lu_test set result=pg_temp.run('receipt',jsonb_build_object('snapshot_id',share->'snapshot_ids'->0,'action','view'));

select ok(result->>'viewed_at' is not null and result->>'acknowledged_at' is null,'view is distinct from acknowledgement') from lu_test;

update lu_test set result=pg_temp.run('receipt',jsonb_build_object('snapshot_id',share->'snapshot_ids'->0,'action','acknowledge'));

select ok(result->>'acknowledged_at' is not null,'explicit acknowledgement is recorded') from lu_test;

select lives_ok($$select public.deliver_lineup_notifications_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array[(select share->'snapshot_ids'->>0 from lu_test)::uuid])$$,'notification outbox can be delivered separately');
select is(public.deliver_lineup_notifications_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array[(select share->'snapshot_ids'->>0 from lu_test)::uuid]),0,'repeated delivery creates no duplicate notifications');

update lu_test set result=pg_temp.run('note','{"note_id":null,"expected_revision":null,"note":{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000002","shift_type_id":null,"section_id":null,"category":"priority","content":"Team priority changed","visibility":"team","pinned":true,"expires_at":null}}');
select throws_ok($$select public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000002'::uuid],preview->>'fingerprint') from lu_test$$,'40001','stale schedule line-up share preview','changed notes invalidate a prior share preview');

update lu_test set preview=public.preview_schedule_lineup_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000002'::uuid]);

update lu_test set share=public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000002'::uuid],preview->>'fingerprint');

select ok((select acknowledged_at is null from public.lineup_receipts where snapshot_id=(share->'snapshot_ids'->>0)::uuid),'relevant team note resets the current acknowledgement') from lu_test;

select is((select count(*)::integer from public.lineup_receipts where employee_id='15000000-0000-4000-8000-000000000001' and acknowledged_at is not null),1,'previous acknowledgement remains in history');


-- An accepted offer does not cover the need until an authorized manager confirms.
-- A service-specific share retains other services' last shared assignment details.
select lives_ok($$select pg_temp.run('shared_export','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000002"}')$$,'manager can reopen an immutable shared export');
select lives_ok($$select pg_temp.run('retry_notifications','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000002"}')$$,'notification retry returns a valid JSON result');
update public.schedule_lineup_entries set station='Unshared change to Open service',revision=revision+1 where source_shift_id=(select source_id from lu_test);
update lu_test set preview=public.preview_schedule_lineup_scoped_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000002'::uuid],array['14000000-0000-4000-8000-000000000002'::uuid]);
select ok(not (preview->'content')::text like '%Unshared change to Open service%','sharing Dinner preserves the prior Open service content') from lu_test;
update lu_test set result=public.share_schedule_lineup_scoped_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000002'::uuid],preview->>'fingerprint',array['14000000-0000-4000-8000-000000000002'::uuid]);
select ok(not pg_temp.run('shared_export','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000002"}')::text like '%Unshared change to Open service%','shared export reads the snapshot rather than working changes');
update public.employee_profiles set user_id=null where id='15000000-0000-4000-8000-000000000001';
update public.employee_profiles set user_id='d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' where id='15000000-0000-4000-8000-000000000002';
update lu_test set source_id=(select id from public.schedule_published_shifts where scheduled_date='2030-01-07' and location_id='11000000-0000-4000-8000-000000000001' and employee_id is null limit 1);
update lu_test set op=jsonb_build_object('kind','replace','source_entry_id',coalesce((select id from public.schedule_lineup_entries where source_shift_id=lu_test.source_id),source_id),'target_entry_id',null,'employee_id','15000000-0000-4000-8000-000000000002','target',target,'reason','Coverage offer test','travel_minutes',0);
update lu_test set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
update lu_test set result=public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','offer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','aaa00000-0000-4000-8000-000000000010'));
select is(result->>'status','pending','offer awaits employee response') from lu_test;
update lu_test set slot_id=(result->>'id')::uuid;
select is(public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','respond',jsonb_build_object('id',slot_id,'response','accept'))->>'status','accepted','employee can accept an offer') from lu_test;
select ok((select employee_id is null from public.schedule_published_shifts where id=source_id),'offer acceptance alone does not fill coverage') from lu_test;
update lu_test set result=public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',slot_id,'response','confirm'));
select is(result->>'status','applied','accepted offer can be finalized after fresh eligibility checks') from lu_test;

-- Two independently scoped managers approve a cross-location move.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('aaa00000-0000-4000-8000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lineup-source-manager@example.test','','{}','{}',now(),now()),
('aaa00000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lineup-destination-manager@example.test','','{}','{}',now(),now());
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
('aaa00000-0000-4000-8000-000000000111','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','aaa00000-0000-4000-8000-000000000101','manager','active',false),
('aaa00000-0000-4000-8000-000000000112','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','aaa00000-0000-4000-8000-000000000102','manager','active',false);
select tests.works_at('aaa00000-0000-4000-8000-000000000111', '11000000-0000-4000-8000-000000000001');
select tests.works_at('aaa00000-0000-4000-8000-000000000112', '11000000-0000-4000-8000-000000000002');
update lu_test set op=jsonb_build_object('kind','move','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=lu_test.source_id),'target_entry_id',null,'employee_id','15000000-0000-4000-8000-000000000002','target',target||'{"location_id":"11000000-0000-4000-8000-000000000002"}','reason','Two-location manager approval','travel_minutes',0);
update lu_test set preview=public.lineup_operation_preview('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',op);
select is(preview->>'requires_approval','true','source-only manager needs destination approval') from lu_test;
update lu_test set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','transfer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','aaa00000-0000-4000-8000-000000000011'));
update lu_test set slot_id=(result->>'id')::uuid;
select is((select location_id::text from public.schedule_published_shifts where id=source_id),'11000000-0000-4000-8000-000000000001','pending location approval leaves the source unchanged') from lu_test;
update lu_test set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',slot_id,'response','confirm'));
select is(result->>'status','applied','destination manager completes the jointly authorized move') from lu_test;

select is(public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','state','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001"}')->>'can_manage_sections','false','scoped manager sees global section editing as unavailable');
select is(pg_temp.run('state','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001"}')->>'can_manage_sections','true','owner can manage shared section definitions');

-- Recheck both approvals at finalization; a removed location grant cannot be reused.
update lu_test set op=jsonb_set(op,'{target,location_id}','"11000000-0000-4000-8000-000000000001"');
update lu_test set preview=public.lineup_operation_preview('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',op);
update lu_test set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','transfer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
update lu_test set slot_id=(result->>'id')::uuid;
select tests.stops_working_at('aaa00000-0000-4000-8000-000000000111');
select throws_ok($$select public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',slot_id,'response','confirm')) from lu_test$$,'P0001',null,'revoked location scope prevents pending approval');
select is((select location_id::text from public.schedule_published_shifts where id=source_id),'11000000-0000-4000-8000-000000000002','revoked approval does not move the employee') from lu_test;
-- AT-16: fresh actor/location checks across the manager command boundary.
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','state','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","entries":[]}')$$,'P0001',null,'revoked location scope denies state');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','shared_export','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","entries":[]}')$$,'P0001',null,'revoked location scope denies shared_export');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','retry_notifications','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","entries":[]}')$$,'P0001',null,'revoked location scope denies retry_notifications');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','placements_preview','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","entries":[]}')$$,'P0001',null,'revoked location scope denies placements_preview');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','placements_apply','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","entries":[]}')$$,'P0001',null,'revoked location scope denies placements_apply');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','section_plan','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","entries":[]}')$$,'P0001',null,'revoked location scope denies section_plan');
select throws_ok($$select public.get_schedule_lineup_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000001'::uuid],null)$$,'42501',null,'revoked scope denies daily read');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','candidates',jsonb_build_object('target',target,'source_entry_id',null)) from lu_test$$,'P0001',null,'revoked scope denies candidate lookup');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','note',jsonb_build_object('note',jsonb_build_object('location_id','11000000-0000-4000-8000-000000000001')))$$,'P0001',null,'revoked scope denies note changes');
select throws_ok($$select public.upsert_schedule_lineup_entry_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-01-07',null,null,'{}')$$,'P0001',null,'revoked scope denies entry creation');
select throws_ok($$select public.upsert_schedule_lineup_section_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'{}')$$,'P0001',null,'revoked scope denies global section changes');
select throws_ok($$select public.archive_schedule_lineup_section_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null)$$,'P0001',null,'revoked scope denies global section archive');
select throws_ok($$select public.upsert_schedule_lineup_brief_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-01-07','14000000-0000-4000-8000-000000000001',null,'{}')$$,'42501',null,'revoked scope denies service brief');
select throws_ok($$select public.preview_schedule_lineup_scoped_share_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000001'::uuid],null)$$,'P0001',null,'revoked scope denies share preview');
select throws_ok($$select public.share_schedule_lineup_scoped_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-07',array['11000000-0000-4000-8000-000000000001'::uuid],repeat('0',64),null)$$,'P0001',null,'revoked scope denies share commit');
select throws_ok($$select public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposals','{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001"}')$$,'P0001',null,'revoked scope denies proposal list');
select tests.works_at('aaa00000-0000-4000-8000-000000000111', '11000000-0000-4000-8000-000000000001');
update public.schedule_lineup_entries set revision=revision+1,station='Changed while approval was pending' where source_shift_id=(select source_id from lu_test);
select throws_ok($$select public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',slot_id,'response','confirm')) from lu_test$$,'P0001',null,'source changes invalidate the pending approval');

-- Atomic partial swap, residual coverage, stale choices, and per-service setup.
create function pg_temp.commit_op(op jsonb) returns jsonb language plpgsql as $$
declare preview jsonb;
begin preview:=pg_temp.run('preview',jsonb_build_object('operation',op));
return pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())); end; $$;
create temp table lu_segments(a uuid,b uuid,op jsonb,preview jsonb,result jsonb,target jsonb,slot uuid);
insert into lu_segments(target) select target||'{"date":"2030-01-08","location_id":"11000000-0000-4000-8000-000000000001","start_time":"09:00","end_time":"17:00"}' from lu_test;
update lu_segments set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target,'employee_id','15000000-0000-4000-8000-000000000001','reason','Swap source fixture','travel_minutes',0));
update lu_segments set a=(result->>'shift_id')::uuid;
update lu_segments set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target||'{"location_id":"11000000-0000-4000-8000-000000000002"}','employee_id','15000000-0000-4000-8000-000000000002','reason','Swap destination fixture','travel_minutes',0));
update lu_segments set b=(result->>'shift_id')::uuid;
update lu_segments set op=jsonb_build_object('kind','swap','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=a),'target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b),'target',target||'{"start_time":"12:00","end_time":"15:00"}','reason','Partial swap coverage','travel_minutes',30);
update lu_segments set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select is(preview->>'allowed','true','both directions of a partial swap validate') from lu_segments;
update lu_segments set result=pg_temp.commit_op(op);
select is((select employee_id::text from public.schedule_published_shifts where id=a),'15000000-0000-4000-8000-000000000002','swap assigns the other employee to the source') from lu_segments;
select is((select employee_id::text from public.schedule_published_shifts where id=b),'15000000-0000-4000-8000-000000000001','swap assigns the source employee to the destination') from lu_segments;
select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date='2030-01-08' and employee_id is null),4,'partial swap reserves four open travel gaps');
select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date='2030-01-08' and (start_time='09:00' and end_time='11:30' or start_time='15:30' and end_time='17:00')),4,'unchanged swap segments retain their original employees');
select throws_ok($$select pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from lu_segments$$,'P0001','stale Line Up operation preview','second manager cannot apply an old preview');
-- Block one direction by removing an assignment qualification, then assert no half-operation.
update public.employee_job_assignments set ended_at=now() where employee_id='15000000-0000-4000-8000-000000000001' and job_id='13000000-0000-4000-8000-000000000001' and ended_at is null;
update lu_segments set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select is(preview->>'allowed','false','swap blocks when either employee lacks the required position') from lu_segments;
select throws_ok($$select pg_temp.commit_op(op) from lu_segments$$,'P0001',null,'invalid swap cannot commit either side');
select is((select employee_id::text from public.schedule_published_shifts where id=a),'15000000-0000-4000-8000-000000000002','failed swap preserves the prior source') from lu_segments;
update public.employee_job_assignments set ended_at=null where employee_id='15000000-0000-4000-8000-000000000001' and job_id='13000000-0000-4000-8000-000000000001';
-- Extra line stays the same logical slot when partially filled.
update lu_segments set target=target||'{"date":"2030-01-09"}';
update lu_segments set result=public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-01-09',null,null,target||'{"source_shift_id":null,"employee_id":null,"hidden":false,"call_off":false,"display_order":0}');
update lu_segments set slot=(result->>'entry_id')::uuid;
select ok(slot is not null,'extra line creates an identifiable open need') from lu_segments;
update lu_segments set op=jsonb_build_object('kind','assign','source_entry_id',slot,'target',target||'{"start_time":"12:00","end_time":"15:00"}','employee_id','15000000-0000-4000-8000-000000000001','reason','Partial extra coverage','travel_minutes',0);
update lu_segments set result=pg_temp.commit_op(op);
select is((select employee_id::text from public.schedule_lineup_entries where id=slot),'15000000-0000-4000-8000-000000000001','filling extra line preserves the slot identity') from lu_segments;
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups l on l.id=e.lineup_id where l.lineup_date='2030-01-09' and e.employee_id is null),2,'partial extra assignment leaves both uncovered intervals open');
select is((select count(*)::integer from public.schedule_lineup_entries where source_shift_id=(result->>'shift_id')::uuid),1,'extra assignment creates no duplicate overlay') from lu_segments;
-- Service setup, share, source unpublish, and acknowledgement state.
update lu_segments set result=pg_temp.run('section_plan',jsonb_build_object('date','2030-01-09','location_id','11000000-0000-4000-8000-000000000001','shift_type_id',null,'section_id',(select id from public.schedule_lineup_sections where archived_at is null limit 1),'closed',false,'lead_employee_id','15000000-0000-4000-8000-000000000001','stations','Tables 1-8','expected_revision',null));
select is(result->>'revision','1','service setup has an optimistic revision') from lu_segments;
select ok(jsonb_array_length(pg_temp.run('state','{"date":"2030-01-09","location_id":"11000000-0000-4000-8000-000000000001"}')->'section_plans')=1,'section setup appears in the scoped manager state');
select ok(public.lineup_share_content('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-09',array['11000000-0000-4000-8000-000000000001'::uuid])::text like '%Tables 1-8%','section lead and station briefing is included in the immutable share');
-- A scoped manager can ask the other location to choose a counterpart.
create temp table lu_swap_request(a uuid,b uuid,op jsonb,preview jsonb,result jsonb,target jsonb,proposal_id uuid);
insert into lu_swap_request(target) select target||'{"date":"2030-01-10","start_time":"09:00","end_time":"17:00"}' from lu_segments;
update lu_swap_request set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target,'employee_id','15000000-0000-4000-8000-000000000001','reason','Scoped swap source fixture','travel_minutes',0));
update lu_swap_request set a=(result->>'shift_id')::uuid;
update lu_swap_request set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target||'{"location_id":"11000000-0000-4000-8000-000000000002"}','employee_id','15000000-0000-4000-8000-000000000002','reason','Scoped swap counterpart fixture','travel_minutes',0));
update lu_swap_request set b=(result->>'shift_id')::uuid;
update lu_swap_request set op=jsonb_build_object('kind','swap','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=a),'target_entry_id',null,'target',target||'{"location_id":"11000000-0000-4000-8000-000000000002","start_time":"12:00","end_time":"15:00"}','reason','Request a qualified counterpart','travel_minutes',30);
update lu_swap_request set preview=public.lineup_operation_preview('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',op);
select is(preview->>'requires_approval','true','swap can request a destination-selected counterpart') from lu_swap_request;
update lu_swap_request set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','transfer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
update lu_swap_request set proposal_id=(result->>'id')::uuid;
update lu_swap_request set preview=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',proposal_id,'response','preview','target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b)));
select is(preview->>'allowed','true','destination can preview both qualified swap directions') from lu_swap_request;
select is((select employee_id::text from public.schedule_published_shifts where id=a),'15000000-0000-4000-8000-000000000001','approval preview does not swap employees') from lu_swap_request;
select ok((select operation->>'target_entry_id' is null from public.lineup_proposals where id=proposal_id),'approval preview preserves the unresolved request') from lu_swap_request;
update lu_swap_request set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',proposal_id,'response','confirm','fingerprint',preview->>'fingerprint','target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b)));
select is((select employee_id::text from public.schedule_published_shifts where id=a),'15000000-0000-4000-8000-000000000002','jointly approved swap fills the source atomically') from lu_swap_request;
select is((select employee_id::text from public.schedule_published_shifts where id=b),'15000000-0000-4000-8000-000000000001','jointly approved swap fills the destination atomically') from lu_swap_request;

-- Adjacent-day availability, partial windows, approved time off and travel are server rules.
select is(upper(public.lineup_shift_range('2026-03-08','01:00','04:00','America/Los_Angeles'))-lower(public.lineup_shift_range('2026-03-08','01:00','04:00','America/Los_Angeles')),interval '2 hours','DST uses real instants rather than three wall-clock hours');
-- Friday availability was recorded before publication; published availability cannot be rewritten.

select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001',target||'{"date":"2030-01-11"}')->>'status','partial','partial availability is never reported as a full match') from lu_segments;
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001',target||'{"date":"2030-01-10","location_id":"11000000-0000-4000-8000-000000000002","start_time":"11:45","end_time":"12:00"}',array[]::uuid[],30)->>'status','ineligible','fifteen-minute gap fails a thirty-minute travel requirement') from lu_segments;
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by) values('aaa00000-0000-4000-8000-000000000701','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','approved','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,status) values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','aaa00000-0000-4000-8000-000000000701','2030-01-11','approved');
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000002',target||'{"date":"2030-01-11"}')->>'status','ineligible','approved time off excludes an otherwise free employee') from lu_segments;

-- Moving into an existing extra line consumes that need rather than duplicating it.
create temp table lu_move_need(source_id uuid,slot uuid,op jsonb,result jsonb,target jsonb);
insert into lu_move_need(target) select target||'{"date":"2030-01-12","start_time":"09:00","end_time":"17:00"}' from lu_segments;
update lu_move_need set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target,'employee_id','15000000-0000-4000-8000-000000000001','reason','Move coverage source fixture','travel_minutes',0));
update lu_move_need set source_id=(result->>'shift_id')::uuid;
update lu_move_need set result=public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','2030-01-12',null,null,target||'{"location_id":"11000000-0000-4000-8000-000000000002","start_time":"10:00","end_time":"16:00","source_shift_id":null,"employee_id":null,"hidden":false,"call_off":false,"display_order":0}');
update lu_move_need set slot=(result->>'entry_id')::uuid;
update lu_move_need set op=jsonb_build_object('kind','move','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=lu_move_need.source_id),'target_entry_id',slot,'target',target||'{"location_id":"11000000-0000-4000-8000-000000000002","start_time":"12:00","end_time":"15:00"}','employee_id','15000000-0000-4000-8000-000000000001','reason','Cover an existing extra line','travel_minutes',0);
update lu_move_need set result=pg_temp.commit_op(op);
select is((select employee_id::text from public.schedule_lineup_entries where id=slot),'15000000-0000-4000-8000-000000000001','move fills the selected destination extra-line identity') from lu_move_need;
select ok((select employee_id is null from public.schedule_published_shifts where id=source_id),'move leaves the transferred source interval open') from lu_move_need;
select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date='2030-01-12' and location_id='11000000-0000-4000-8000-000000000002'),1,'move creates only one assigned destination shift');
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id where ln.lineup_date='2030-01-12' and e.location_id='11000000-0000-4000-8000-000000000002' and e.employee_id is null),2,'destination uncovered intervals remain open after the move');

-- Source continuation matches stable IDs and explicitly flags changed details.
-- Transfers preserve actual instants across local dates and a publication-week boundary.
update public.locations set timezone='America/New_York' where id='11000000-0000-4000-8000-000000000002';
insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',id,'2030-01-14',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.locations where id in('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002');
-- The original pre-publication baseline also covers the following week.
create temp table lu_dates(a uuid,b uuid,target jsonb,op jsonb,preview jsonb,result jsonb,proposal uuid);
insert into lu_dates(target) select target||'{"date":"2030-01-13","start_time":"22:00","end_time":"02:00"}' from lu_segments;
update lu_dates set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target,'employee_id','15000000-0000-4000-8000-000000000001','reason','Overnight source','travel_minutes',0));
update lu_dates set a=(result->>'shift_id')::uuid;
update lu_dates set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target||'{"date":"2030-01-14","location_id":"11000000-0000-4000-8000-000000000002","start_time":"01:00","end_time":"05:00"}','employee_id','15000000-0000-4000-8000-000000000002','reason','Next-day counterpart','travel_minutes',0));
update lu_dates set b=(result->>'shift_id')::uuid;
update lu_dates set op=jsonb_build_object('kind','swap','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=a),'target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b),'target',target||'{"start_time":"23:00","end_time":"01:00"}','reason','Different local dates swap','travel_minutes',0);
update public.schedule_location_publications set status='superseded' where location_id='11000000-0000-4000-8000-000000000001' and week_start='2030-01-14';
select ok(pg_temp.run('preview',jsonb_build_object('operation',op))->'blockers' ? 'Publish the affected next Schedule week before splitting this overnight assignment','preview explains the missing next-week publication before any overnight split') from lu_dates;
update public.schedule_location_publications set status='current' where location_id='11000000-0000-4000-8000-000000000001' and week_start='2030-01-14';
update lu_dates set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select is(preview->>'allowed','true','swap accepts counterpart on a different local calendar date') from lu_dates;
update lu_dates set result=pg_temp.commit_op(op);
select is((select scheduled_date::text||' '||start_time::text from public.schedule_published_shifts where id=a),'2030-01-13 23:00:00','source swap retains Los Angeles local date') from lu_dates;
select is((select action_url from public.notifications where source_id=(result->>'event_id')::uuid and event_key='manager_assignment_changed' and recipient_user_id='aaa00000-0000-4000-8000-000000000101'),'/app/schedule/lineup?date=2030-01-13&location=11000000-0000-4000-8000-000000000001','source manager notification opens the source local day and location') from lu_dates;
select is((select action_url from public.notifications where source_id=(result->>'event_id')::uuid and event_key='manager_assignment_changed' and recipient_user_id='aaa00000-0000-4000-8000-000000000102'),'/app/schedule/lineup?date=2030-01-14&location=11000000-0000-4000-8000-000000000002','counterpart manager notification opens its next local day and location') from lu_dates;
select is((select scheduled_date::text||' '||start_time::text from public.schedule_published_shifts where id=b),'2030-01-14 02:00:00','counterpart swap uses New York date and equivalent instant') from lu_dates;
select ok(not exists(select 1 from public.schedule_published_shifts ps join public.schedule_location_publications pub on pub.id=ps.publication_id where ps.workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd' and ps.scheduled_date in('2030-01-13','2030-01-14') and not ps.scheduled_date between pub.week_start and pub.week_start+6),'overnight residuals belong to the publication covering their own date');
select ok(pg_temp.run('state','{"date":"2030-01-14","location_id":"11000000-0000-4000-8000-000000000002"}')::text like '%Different local dates swap%','counterpart local-day history includes the cross-date operation');

-- Source-only manager requests a next-day move and destination manager confirms it.
update lu_dates set target=target||'{"date":"2030-01-15"}';
update lu_dates set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target,'employee_id','15000000-0000-4000-8000-000000000001','reason','Cross-date move source','travel_minutes',0));
update lu_dates set a=(result->>'shift_id')::uuid;
update lu_dates set op=jsonb_build_object('kind','move','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=a),'target_entry_id',null,'target',target||'{"date":"2030-01-16","location_id":"11000000-0000-4000-8000-000000000002","start_time":"01:00","end_time":"05:00"}','reason','Cross-date approved move','travel_minutes',0);
update lu_dates set preview=public.lineup_operation_preview('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',op);
select is(preview->>'allowed','true','source-scoped preview finds its shift on the prior local day') from lu_dates;
update lu_dates set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','transfer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
update lu_dates set proposal=(result->>'id')::uuid;
select is((select source_date::text from public.lineup_proposals where id=proposal),'2030-01-15','proposal preserves its source local date') from lu_dates;
update lu_dates set preview=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',proposal,'response','preview'));
update lu_dates set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',proposal,'response','confirm','fingerprint',preview->>'fingerprint'));
select is(result->>'status','applied','separate managers can confirm a next-local-day transfer') from lu_dates;
select is((select scheduled_date::text from public.schedule_published_shifts where id=a),'2030-01-16','approved move writes destination local date') from lu_dates;
select ok(public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposals','{"date":"2030-01-15","location_id":"11000000-0000-4000-8000-000000000001"}')::text like '%Cross-date approved move%','source-day queue retains the confirmed transfer after the source moved');
-- Candidate suggestions expose movable assignments only within the manager's scope.
select is((select c->>'status' from jsonb_array_elements(pg_temp.run('candidates',jsonb_build_object('target',target,'source_entry_id',(select ps.id from public.schedule_published_shifts ps where ps.location_id='11000000-0000-4000-8000-000000000001' and ps.scheduled_date='2030-01-15' and ps.employee_id is null limit 1)))) c where c->>'employee_id'='15000000-0000-4000-8000-000000000001'),'movable','candidate in another local-day assignment is suggested as movable') from lu_dates;
select ok((select c->'move_source'->>'date'='2030-01-16' from jsonb_array_elements(pg_temp.run('candidates',jsonb_build_object('target',target,'source_entry_id',null))) c where c->>'employee_id'='15000000-0000-4000-8000-000000000001'),'movable candidate carries the actual source local day') from lu_dates;
select ok(not public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','candidates',jsonb_build_object('target',target,'source_entry_id',null))::text like '%move_source%','source assignment details are not exposed outside location management scope') from lu_dates;
select is((select c->>'status' from jsonb_array_elements(pg_temp.run('candidates',jsonb_build_object('target',target||'{"job_id":"13000000-0000-4000-8000-000000000003"}','source_entry_id',null))) c where c->>'employee_id'='15000000-0000-4000-8000-000000000001'),'ineligible','movable suggestion never overrides position eligibility') from lu_dates;

-- A next-day counterpart can also be selected by a separately scoped destination manager.
update lu_dates set target=target||'{"date":"2030-01-17"}';
update lu_dates set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target,'employee_id','15000000-0000-4000-8000-000000000001','reason','Cross-date scoped swap source','travel_minutes',0));
update lu_dates set a=(result->>'shift_id')::uuid;
update lu_dates set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target||'{"date":"2030-01-18","location_id":"11000000-0000-4000-8000-000000000002","start_time":"01:00","end_time":"05:00"}','employee_id','15000000-0000-4000-8000-000000000002','reason','Cross-date scoped swap counterpart','travel_minutes',0));
update lu_dates set b=(result->>'shift_id')::uuid;
update lu_dates set op=jsonb_build_object('kind','swap','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=a),'target_entry_id',null,'target',target||'{"date":"2030-01-18","location_id":"11000000-0000-4000-8000-000000000002","start_time":"02:00","end_time":"04:00"}','reason','Next-day counterpart requested','travel_minutes',0);
update lu_dates set preview=public.lineup_operation_preview('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',op);
update lu_dates set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','transfer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
update lu_dates set proposal=(result->>'id')::uuid;
update lu_dates set preview=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',proposal,'response','preview','target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b)));
select is(preview->>'allowed','true','scoped swap review resolves source and counterpart on different dates') from lu_dates;
update lu_dates set result=public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',proposal,'response','confirm','fingerprint',preview->>'fingerprint','target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b)));
select is((select employee_id::text||' '||scheduled_date::text from public.schedule_published_shifts where id=a),'15000000-0000-4000-8000-000000000002 2030-01-17','approved swap assigns counterpart to source local day') from lu_dates;
select is((select employee_id::text||' '||scheduled_date::text from public.schedule_published_shifts where id=b),'15000000-0000-4000-8000-000000000001 2030-01-18','approved swap assigns source employee to destination local day') from lu_dates;
select is((select operation->'target'->>'date' from public.lineup_proposals where id=proposal),'2030-01-18','confirmed request retains its originally requested destination date') from lu_dates;
select is((select operation->'target'->>'start_time' from public.lineup_proposals where id=proposal),'02:00','confirmed request retains its originally requested destination time') from lu_dates;
update public.locations set timezone='America/Los_Angeles' where id='11000000-0000-4000-8000-000000000002';

-- Two independently accepted offers for one need still result in exactly one assignment.
update public.employee_profiles set user_id='aaa00000-0000-4000-8000-000000000101' where id='15000000-0000-4000-8000-000000000001';
create temp table lu_competing(slot uuid,first_offer uuid,second_offer uuid,target jsonb,op jsonb,preview jsonb,result jsonb);
insert into lu_competing(target) select target||'{"date":"2030-01-19","start_time":"10:00","end_time":"16:00"}' from lu_segments;
update lu_competing set result=public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-01-19',null,null,target||'{"source_shift_id":null,"employee_id":null,"hidden":false,"call_off":false,"display_order":0}');
update lu_competing set slot=(result->>'entry_id')::uuid;
update lu_competing set op=jsonb_build_object('kind','replace','source_entry_id',slot,'target_entry_id',null,'employee_id','15000000-0000-4000-8000-000000000001','target',target,'reason','First candidate offer','travel_minutes',0);
update lu_competing set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
update lu_competing set result=public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','offer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
update lu_competing set first_offer=(result->>'id')::uuid,op=op||'{"employee_id":"15000000-0000-4000-8000-000000000002","reason":"Second candidate offer"}';
update lu_competing set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
update lu_competing set result=public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','propose',jsonb_build_object('kind','offer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()));
update lu_competing set second_offer=(result->>'id')::uuid;
select is(public.lineup_proposals_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','respond',jsonb_build_object('id',first_offer,'response','accept'))->>'status','accepted','first employee can accept their own offer') from lu_competing;
select is(public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','respond',jsonb_build_object('id',second_offer,'response','accept'))->>'status','accepted','second employee can accept before manager finalization') from lu_competing;
update lu_competing set result=public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',first_offer,'response','confirm'));
select is((select employee_id::text from public.schedule_lineup_entries where id=slot),'15000000-0000-4000-8000-000000000001','one accepted offer fills the single coverage need') from lu_competing;
select is((select status from public.lineup_proposals where id=second_offer),'cancelled','competing accepted offer closes after the need is filled') from lu_competing;
select ok((select result->>'reason' like '%another accepted offer%' from public.lineup_proposals where id=second_offer),'closed offer explains why no second assignment was made') from lu_competing;
select throws_ok($$select public.lineup_proposals_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','proposal_action',jsonb_build_object('id',second_offer,'response','confirm')) from lu_competing$$,'P0001','stale or expired proposal','second finalization cannot overwrite the assigned employee');
select is((select count(*)::integer from public.notifications where source_id=second_offer and event_key='coverage_filled'),1,'other employee receives one closure notification') from lu_competing;

-- Only employees affected by a note re-acknowledge; removed recipients remain notified.
create temp table lu_receipt_scope(preview jsonb,share jsonb,entry jsonb,result jsonb);
insert into lu_receipt_scope(result) select pg_temp.commit_op(jsonb_build_object('kind','assign','target',target||'{"shift_type_id":"14000000-0000-4000-8000-000000000002"}','employee_id','15000000-0000-4000-8000-000000000002','reason','Different service receipt fixture','travel_minutes',0)) from lu_competing;
update lu_receipt_scope set preview=public.preview_schedule_lineup_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-19',array['11000000-0000-4000-8000-000000000001'::uuid]);
update lu_receipt_scope set share=public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-19',array['11000000-0000-4000-8000-000000000001'::uuid],preview->>'fingerprint');
update lu_receipt_scope set result=public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','receipt',jsonb_build_object('snapshot_id',share->'snapshot_ids'->0,'action','acknowledge'));
update lu_receipt_scope set result=pg_temp.run('receipt',jsonb_build_object('snapshot_id',share->'snapshot_ids'->0,'action','acknowledge'));
update lu_receipt_scope set result=pg_temp.run('note','{"note_id":null,"expected_revision":null,"note":{"date":"2030-01-19","location_id":"11000000-0000-4000-8000-000000000001","shift_type_id":"14000000-0000-4000-8000-000000000001","section_id":null,"category":"priority","content":"Open service only instruction","visibility":"team","pinned":true,"expires_at":null}}');
update lu_receipt_scope set preview=public.preview_schedule_lineup_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-19',array['11000000-0000-4000-8000-000000000001'::uuid]);
update lu_receipt_scope set share=public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-19',array['11000000-0000-4000-8000-000000000001'::uuid],preview->>'fingerprint');
select ok((select acknowledged_at is null from public.lineup_receipts where snapshot_id=(share->'snapshot_ids'->>0)::uuid and employee_id='15000000-0000-4000-8000-000000000001'),'employee in changed service must acknowledge again') from lu_receipt_scope;
select ok((select acknowledged_at is not null from public.lineup_receipts where snapshot_id=(share->'snapshot_ids'->>0)::uuid and employee_id='15000000-0000-4000-8000-000000000002'),'unrelated service employee keeps their acknowledgement') from lu_receipt_scope;
select ok(not pg_temp.run('published','{"from":"2030-01-19","to":"2030-01-19"}')::text like '%Open service only instruction%','employee does not receive another service scoped note');
update lu_receipt_scope set entry=(select e from jsonb_array_elements(public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-19',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries') e where e->>'employee_id'='15000000-0000-4000-8000-000000000001');
update lu_receipt_scope set result=public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-01-19',(entry->>'overlay_id')::uuid,(entry->>'revision')::integer,entry||'{"call_off":true}');
update lu_receipt_scope set preview=public.preview_schedule_lineup_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-19',array['11000000-0000-4000-8000-000000000001'::uuid]);
update lu_receipt_scope set share=public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-19',array['11000000-0000-4000-8000-000000000001'::uuid],preview->>'fingerprint');
select is((select count(*)::integer from public.lineup_notification_outbox where snapshot_id=(share->'snapshot_ids'->>0)::uuid and employee_id='15000000-0000-4000-8000-000000000001'),1,'employee removed from shared assignments still receives a change notification') from lu_receipt_scope;
select is(jsonb_array_length(public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','published','{"from":"2030-01-19","to":"2030-01-19"}')->0->'entries'),0,'removed employee sees the changed plan with no stale personal assignment');

-- Explicit replacement by a movable candidate updates both canonical assignments.
create temp table lu_movable(a uuid,b uuid,target jsonb,op jsonb,result jsonb,preview jsonb,candidate jsonb);
insert into lu_movable(target) select target||'{"date":"2030-01-20","start_time":"10:00","end_time":"16:00"}' from lu_competing;
update lu_movable set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target||'{"location_id":"11000000-0000-4000-8000-000000000002"}','employee_id','15000000-0000-4000-8000-000000000001','reason','Movable candidate source','travel_minutes',0));
update lu_movable set a=(result->>'shift_id')::uuid;
update lu_movable set result=pg_temp.commit_op(jsonb_build_object('kind','assign','target',target,'employee_id','15000000-0000-4000-8000-000000000002','reason','Replacement target','travel_minutes',0));
update lu_movable set b=(result->>'shift_id')::uuid;
update lu_movable set candidate=(select c from jsonb_array_elements(pg_temp.run('candidates',jsonb_build_object('target',target,'source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b)))) c where c->>'employee_id'='15000000-0000-4000-8000-000000000001');
select is(candidate->>'status','movable','replacement panel can propose a qualified person from another assignment') from lu_movable;
update lu_movable set op=jsonb_build_object('kind','move','source_entry_id',candidate->'move_source'->'entry_id','target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b),'employee_id','15000000-0000-4000-8000-000000000001','replace_target',true,'target',target,'reason','Replace using another location staff','travel_minutes',0);
update lu_movable set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select ok(preview->>'allowed'='true' and (preview->'effects') is not null,'explicit target replacement is previewed before moving staff') from lu_movable;
select ok((preview->'effects')::text like '%Replaces %','move replacement preview names the displaced assignment') from lu_movable;
update lu_movable set result=pg_temp.commit_op(op);
select is((select employee_id::text from public.schedule_published_shifts where id=b),'15000000-0000-4000-8000-000000000001','movable replacement fills the existing target Schedule shift') from lu_movable;
select ok((select employee_id is null from public.schedule_published_shifts where id=a),'movable replacement leaves the source Schedule interval open') from lu_movable;
select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date='2030-01-20' and employee_id='15000000-0000-4000-8000-000000000002'),0,'displaced employee is released only from the selected future interval');

-- Same-location interval placements, atomic bulk conflict handling, and immutable employee context.
create temp table lu_placement(a uuid,b uuid,original jsonb,batch jsonb,preview jsonb,result jsonb,share jsonb,canonical_hash text);
insert into public.schedule_lineup_sections(id,workspace_id,name,color) values
 ('bbb00000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Placement test dining','#779988'),
 ('bbb00000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Placement test patio','#997788');
insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
 values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-04',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
 select 'bbb00000-0000-4000-8000-000000000011','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',id,'15000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-02-04','17:00','23:00',gen_random_uuid() from public.schedule_location_publications where location_id='11000000-0000-4000-8000-000000000001' and week_start='2030-02-04';
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
 select 'bbb00000-0000-4000-8000-000000000012','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',id,'15000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-02-04','20:00','23:00',gen_random_uuid() from public.schedule_location_publications where location_id='11000000-0000-4000-8000-000000000001' and week_start='2030-02-04';
insert into lu_placement(a,b) values('bbb00000-0000-4000-8000-000000000011','bbb00000-0000-4000-8000-000000000012');
select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-04',null,null,e||'{"section_id":"bbb00000-0000-4000-8000-000000000001"}') from jsonb_array_elements(public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-04',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries') e;
update lu_placement set original=public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-04',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0;
update lu_placement set canonical_hash=(select md5(jsonb_agg(to_jsonb(ps) order by id)::text) from public.schedule_published_shifts ps where scheduled_date='2030-02-04');
update lu_placement set preview=public.preview_schedule_lineup_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-04',array['11000000-0000-4000-8000-000000000001'::uuid]);
update lu_placement set share=public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-04',array['11000000-0000-4000-8000-000000000001'::uuid],preview->>'fingerprint');
update lu_placement set batch=jsonb_build_object('date','2030-02-04','location_id',original->'id','entries',(select jsonb_agg(jsonb_build_object('id',e->'id','expected_revision',e->'revision','entry',e||'{"section_id":"bbb00000-0000-4000-8000-000000000002","placement_range":{"start_time":"18:00","end_time":"22:00"}}')) from jsonb_array_elements(original->'entries') e));
update lu_placement set preview=pg_temp.run('placements_preview',batch);
select is(preview->>'allowed','false','bulk preview rejects the employee whose shift cannot cover the chosen interval') from lu_placement;
select is((select count(*)::integer from jsonb_array_elements(preview->'rows') e where (e->>'allowed')::boolean),1,'bulk preview separates the valid employee from the conflicting employee') from lu_placement;
select throws_ok($$select pg_temp.run('placements_apply',batch||jsonb_build_object('fingerprint',preview->'fingerprint','idempotency_key',gen_random_uuid())) from lu_placement$$,'P0001','Resolve the highlighted section placement conflicts first','bulk conflict cannot partly save valid rows');
select is((select count(*)::integer from public.schedule_lineup_entries where placement_segments<>'[]' and source_shift_id in(a,b)),0,'failed bulk placement preserves every selected row') from lu_placement;
update lu_placement set batch=jsonb_set(batch,'{entries}',(select jsonb_agg(e) from jsonb_array_elements(batch->'entries') e where e->'entry'->>'source_shift_id'=a::text));
update lu_placement set preview=pg_temp.run('placements_preview',batch);
select is(preview->>'allowed','true','future partial section move is allowed') from lu_placement;
select ok(preview::text like '%loses this assignment%','section move explains lost source coverage before saving') from lu_placement;
update lu_placement set result=pg_temp.run('placements_apply',batch||jsonb_build_object('fingerprint',preview->'fingerprint','idempotency_key','bbb00000-0000-4000-8000-000000000021'));
select is(pg_temp.run('placements_apply',batch||jsonb_build_object('fingerprint',preview->'fingerprint','idempotency_key','bbb00000-0000-4000-8000-000000000021'))::text,result::text,'placement retry is idempotent') from lu_placement;
select is((select jsonb_array_length(placement_segments) from public.schedule_lineup_entries where source_shift_id=a),3,'middle-of-shift placement preserves earlier and later sections') from lu_placement;
select is((select sum((e->>'end_at')::timestamptz-(e->>'start_at')::timestamptz) from public.schedule_lineup_entries l cross join lateral jsonb_array_elements(l.placement_segments) e where source_shift_id=a),interval '6 hours','placement segments neither duplicate nor lose any shift time') from lu_placement;
select is((select md5(jsonb_agg(to_jsonb(ps) order by id)::text) from public.schedule_published_shifts ps where scheduled_date='2030-02-04'),canonical_hash,'same-location placement leaves canonical Schedule byte-for-byte unchanged') from lu_placement;
select throws_ok($$select pg_temp.run('section_plan','{"date":"2030-02-04","location_id":"11000000-0000-4000-8000-000000000001","shift_type_id":null,"section_id":"bbb00000-0000-4000-8000-000000000002","closed":true,"lead_employee_id":null,"stations":"","expected_revision":null}')$$,'P0001','Reassign this section before closing it','section closure checks partial assignments as well as base placement');
update lu_placement set preview=public.preview_schedule_lineup_share_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-04',array['11000000-0000-4000-8000-000000000001'::uuid]);
update lu_placement set share=public.share_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-04',array['11000000-0000-4000-8000-000000000001'::uuid],preview->>'fingerprint');
update lu_placement set result=public.lineup_operations_service('aaa00000-0000-4000-8000-000000000101','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','published','{"from":"2030-02-04","to":"2030-02-04"}')->0;
select is(jsonb_array_length(result->'entries'),3,'employee receives all three immutable placement intervals') from lu_placement;
select is(result->'changes'->>'assignment_changed','true','employee personal change summary detects interval placement changes') from lu_placement;
select is(jsonb_array_length(result->'changes'->'previous_entries'),1,'employee can compare the original full-shift placement') from lu_placement;
select is(jsonb_array_length(result->'section_team'),1,'employee sees the teammate from their shared section and service') from lu_placement;
select ok(not (result->'section_team'->0 ? 'employee_id') and not (result->'section_team'->0 ? 'user_id'),'section team exposes only operational display fields') from lu_placement;
select is(result->'entries',(select jsonb_agg(e) from jsonb_array_elements(pg_temp.run('shared_export','{"date":"2030-02-04","location_id":"11000000-0000-4000-8000-000000000001"}')->'locations'->0->'entries') e where e->>'employee_id'='15000000-0000-4000-8000-000000000001'),'employee assignment intervals are identical to the frozen export') from lu_placement;
update lu_placement set batch=jsonb_set(batch,'{entries}',(select jsonb_agg(jsonb_build_object('id',l.id,'expected_revision',l.revision,'entry',e)) from jsonb_array_elements(original->'entries') e join public.schedule_lineup_entries l on l.source_shift_id=(e->>'source_shift_id')::uuid where l.source_shift_id=a));
update lu_placement set preview=pg_temp.run('placements_preview',batch);
select is(preview->>'allowed','true','restoring the prior section placements is validated as a new operation') from lu_placement;
update lu_placement set result=pg_temp.run('placements_apply',batch||jsonb_build_object('fingerprint',preview->'fingerprint','idempotency_key',gen_random_uuid()));
select is((select jsonb_array_length(placement_segments) from public.schedule_lineup_entries where source_shift_id=a),0,'undo restores the original full-shift placement') from lu_placement;
select throws_ok($$select pg_temp.run('placements_apply',batch||jsonb_build_object('fingerprint',preview->'fingerprint','idempotency_key',gen_random_uuid())) from lu_placement$$,'40001','stale section placement preview','a later edit invalidates an older placement preview');
select throws_ok($$select public.lineup_prepare_placement('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',current_date-2,'America/Los_Angeles',original->'entries'->0,(original->'entries'->0)||'{"section_id":"bbb00000-0000-4000-8000-000000000002","placement_segments":[]}') from lu_placement$$,'P0001','Past placement is preserved; choose an interval that starts in the future','completed past placement cannot be rewritten');
select is(jsonb_array_length(public.lineup_clip_placements('[{"id":"bbb00000-0000-4000-8000-000000000051","start_at":"2030-02-05T06:00:00Z","end_at":"2030-02-05T10:00:00Z","section_id":null,"station":""}]','[2030-02-05T08:00:00Z,2030-02-05T09:00:00Z)'::tstzrange)),1,'canonical staffing splits retain intersecting placement segments');

select is(jsonb_array_length(public.lineup_prepare_placement('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-04','America/Los_Angeles',original->'entries'->0,(original->'entries'->0)||'{"placement_range":{"start_time":"21:00","end_time":"22:00"}}')->'placement_segments'),0,'placing an interval in its current section coalesces to one assignment') from lu_placement;
select is(jsonb_array_length(public.lineup_prepare_placement('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-04','America/Los_Angeles',(original->'entries'->0)||'{"start_time":"22:00","end_time":"02:00"}',(original->'entries'->0)||'{"start_time":"22:00","end_time":"02:00","section_id":"bbb00000-0000-4000-8000-000000000002","placement_range":{"start_time":"00:30","end_time":"01:30"}}')->'placement_segments'),3,'after-midnight placement is anchored to the next day inside its overnight shift') from lu_placement;
select throws_ok($$select public.lineup_prepare_placement('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-04','America/Los_Angeles',(original->'entries'->0)||'{"start_time":"22:00","end_time":"02:00"}',(original->'entries'->0)||'{"start_time":"22:00","end_time":"02:00","section_id":"bbb00000-0000-4000-8000-000000000002","placement_range":{"start_time":"00:30","end_time":"03:00"}}') from lu_placement$$,'P0001','Placement interval must fit inside the published shift','after-midnight placement cannot extend working time');
select ok(not public.lineup_employee_details(jsonb_build_object('entries',jsonb_build_array(original->'entries'->0,(original->'entries'->1)||'{"section_id":"bbb00000-0000-4000-8000-000000000002","employee_name":"Other section secret"}')),'{}',null,(original->'entries'->0->>'employee_id')::uuid)::text like '%Other section secret%','employee team projection excludes employees in another section') from lu_placement;

-- Section applicability is enforced by the same server checks as staffing.
create temp table lu_rules(saved jsonb,original jsonb);
insert into lu_rules(saved) select public.upsert_schedule_lineup_section_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'{"name":"Scoped placement test","color":"#557766","sort_order":90,"location_ids":["11000000-0000-4000-8000-000000000001"],"shift_type_ids":["14000000-0000-4000-8000-000000000001"],"job_ids":["13000000-0000-4000-8000-000000000001"]}');
select is(saved->'location_ids','["11000000-0000-4000-8000-000000000001"]'::jsonb,'section configuration persists location applicability') from lu_rules;
select is(public.lineup_section_restriction('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(saved->>'id')::uuid,'11000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001'),null::text,'allowed location, service and position can use the section') from lu_rules;
select is(public.lineup_section_restriction('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(saved->>'id')::uuid,'11000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001'),'Section is not available at this location','section rejects another location') from lu_rules;
select is(public.lineup_section_restriction('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(saved->>'id')::uuid,'11000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001'),'Section is not available for this service','section rejects another service') from lu_rules;
select is(public.lineup_section_restriction('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(saved->>'id')::uuid,'11000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003'),'Position is not permitted in this section','section rejects another position') from lu_rules;
select ok((public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001',(select target from lu_test)||jsonb_build_object('section_id',saved->'id','location_id','11000000-0000-4000-8000-000000000002'))->'reasons') ? 'Section is not available at this location','candidate reason includes section applicability') from lu_rules;
select throws_ok($$select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-04',null,null,jsonb_build_object('source_shift_id',null,'employee_id',null,'job_id','13000000-0000-4000-8000-000000000003','shift_type_id','14000000-0000-4000-8000-000000000001','start_time','18:00','end_time','22:00','section_id',saved->'id','station','','hidden',false,'call_off',false,'display_order',0)) from lu_rules$$,'P0001','Position is not permitted in this section','extra line cannot bypass section position restrictions');
select throws_ok($$select public.upsert_schedule_lineup_section_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'{"name":"Unknown scoped test","color":"#557766","sort_order":90,"location_ids":["bbb00000-0000-4000-8000-000000000099"]}')$$,'P0001','Choose active locations in this workspace','section scopes cannot reference another workspace or unknown locations');
update lu_rules set original=(select to_jsonb(sec) from public.schedule_lineup_sections sec where id='bbb00000-0000-4000-8000-000000000001');
select throws_ok($$select public.upsert_schedule_lineup_section_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(original->>'id')::uuid,(original->>'revision')::integer,original||'{"job_ids":["13000000-0000-4000-8000-000000000003"]}') from lu_rules$$,'P0001',null,'tightening a section cannot strand existing future assignments');
select is((select job_ids from public.schedule_lineup_sections where id='bbb00000-0000-4000-8000-000000000001'),'{}'::uuid[],'rejected section restriction rolls back completely');
select is((select e->'job_ids' from jsonb_array_elements(public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-04',null,null)->'sections') e where e->>'id'=saved->>'id'),saved->'job_ids','manager read model exposes persisted allowed positions') from lu_rules;

select throws_ok($$select public.archive_schedule_lineup_section_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(original->>'id')::uuid,(original->>'revision')::integer) from lu_rules$$,'P0001','Reassign future assignments and open needs before archiving this section','section archive cannot abandon future interval placements');
select is((select to_jsonb(sec) from public.schedule_lineup_sections sec where id=(original->>'id')::uuid),original,'rejected archive preserves the section and revision') from lu_rules;

-- Historical placements retain their original definition link after archival.
create temp table lu_archive_history(entry jsonb);
with ln as (insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2020-02-04','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5') returning id),
e as (insert into public.schedule_lineup_entries(workspace_id,lineup_id,location_id,job_id,shift_type_id,start_time,end_time,section_id,station,created_by,updated_by)
select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',ln.id,'11000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','09:00','17:00',(r.saved->>'id')::uuid,'Historical station','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from ln cross join lu_rules r returning *)
insert into lu_archive_history select to_jsonb(e) from e;
select lives_ok($$select public.archive_schedule_lineup_section_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(saved->>'id')::uuid,(saved->>'revision')::integer) from lu_rules$$,'section with only historical assignments can be archived');
select is((select to_jsonb(e) from public.schedule_lineup_entries e where id=(entry->>'id')::uuid),entry,'archival leaves historical placement content and revision unchanged') from lu_archive_history;

-- A transfer must preserve source sections on residual work and open coverage.
create temp table lu_segment_transfer(source_id uuid,entry jsonb,op jsonb,result jsonb);
insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','2030-02-04',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into lu_segment_transfer(result) select pg_temp.commit_op(jsonb_build_object('kind','assign','employee_id','15000000-0000-4000-8000-000000000001','target',target||'{"date":"2030-02-05","location_id":"11000000-0000-4000-8000-000000000001","start_time":"09:00","end_time":"17:00","section_id":"bbb00000-0000-4000-8000-000000000001"}','reason','Segment transfer fixture','travel_minutes',0)) from lu_test;
update lu_segment_transfer set source_id=(result->>'shift_id')::uuid;
update lu_segment_transfer set entry=(select e from jsonb_array_elements(public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-05',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries') e where e->>'source_shift_id'=source_id::text);
select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-05',(entry->>'overlay_id')::uuid,(entry->>'revision')::integer,entry||'{"section_id":"bbb00000-0000-4000-8000-000000000002","placement_range":{"start_time":"10:00","end_time":"14:00"}}') from lu_segment_transfer;
update lu_segment_transfer set op=jsonb_build_object('kind','move','source_entry_id',entry->'id','target_entry_id',null,'target',(select target from lu_test)||'{"date":"2030-02-05","location_id":"11000000-0000-4000-8000-000000000002","start_time":"11:00","end_time":"13:00","section_id":"bbb00000-0000-4000-8000-000000000001"}','reason','Transfer within a different section interval','travel_minutes',30);
select is(pg_temp.run('preview',jsonb_build_object('operation',op))->>'allowed','true','section-segment transfer with travel is allowed') from lu_segment_transfer;
update lu_segment_transfer set result=pg_temp.commit_op(op);
select is((select count(*)::integer from public.schedule_published_shifts where location_id='11000000-0000-4000-8000-000000000001' and scheduled_date='2030-02-05' and employee_id is null),3,'transfer leaves the work interval and both travel gaps open');
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id cross join lateral public.lineup_project_entry(to_jsonb(e),'America/Los_Angeles') seg where ln.lineup_date='2030-02-05' and e.location_id='11000000-0000-4000-8000-000000000001' and e.employee_id is null and seg->>'section_id'='bbb00000-0000-4000-8000-000000000002'),3,'all source gaps retain the actual section at that interval');
select is((select sum(end_time-start_time) from public.schedule_published_shifts where location_id='11000000-0000-4000-8000-000000000001' and scheduled_date='2030-02-05'),interval '8 hours','source work and needs preserve the entire original coverage interval');
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id cross join lateral public.lineup_project_entry(to_jsonb(e),'America/Los_Angeles') seg where ln.lineup_date='2030-02-05' and e.location_id='11000000-0000-4000-8000-000000000001' and e.employee_id is not null),4,'both residual assignments preserve their section transitions');
select is((select section_id::text from public.schedule_lineup_entries where source_shift_id=source_id),'bbb00000-0000-4000-8000-000000000001','destination uses the explicitly selected target section') from lu_segment_transfer;

-- Filling part of a segmented extra line preserves remaining section coverage.
create temp table lu_segment_need(entry jsonb,result jsonb);
insert into lu_segment_need(result) select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-06',null,null,'{"source_shift_id":null,"employee_id":null,"job_id":"13000000-0000-4000-8000-000000000001","shift_type_id":"14000000-0000-4000-8000-000000000001","start_time":"09:00","end_time":"17:00","section_id":"bbb00000-0000-4000-8000-000000000001","station":"Need test","call_off":false,"hidden":false,"display_order":0}');
update lu_segment_need set entry=public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-06',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries'->0;
select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-06',(entry->>'overlay_id')::uuid,(entry->>'revision')::integer,entry||'{"section_id":"bbb00000-0000-4000-8000-000000000002","placement_range":{"start_time":"10:00","end_time":"14:00"}}') from lu_segment_need;
update lu_segment_need set result=pg_temp.commit_op(jsonb_build_object('kind','assign','source_entry_id',entry->'id','employee_id','15000000-0000-4000-8000-000000000001','target',(select target from lu_test)||'{"date":"2030-02-06","location_id":"11000000-0000-4000-8000-000000000001","start_time":"11:00","end_time":"13:00","section_id":"bbb00000-0000-4000-8000-000000000002"}','reason','Fill segmented need','travel_minutes',0));
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id cross join lateral public.lineup_project_entry(to_jsonb(e),'America/Los_Angeles') seg where ln.lineup_date='2030-02-06' and e.employee_id is null),4,'residual extra lines retain both original section transitions');
select is((select placement_segments from public.schedule_lineup_entries where id=(entry->>'id')::uuid),'[]'::jsonb,'filled need removes obsolete whole-day segments') from lu_segment_need;
select is((select employee_id::text from public.schedule_lineup_entries where id=(entry->>'id')::uuid),'15000000-0000-4000-8000-000000000001','filled segment retains the original need identity') from lu_segment_need;

-- Overnight open needs are anchored to their original date, not the fill date.
create temp table lu_overnight_need(entry jsonb,result jsonb);
insert into lu_overnight_need(result) select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-07',null,null,'{"source_shift_id":null,"employee_id":null,"job_id":"13000000-0000-4000-8000-000000000001","shift_type_id":"14000000-0000-4000-8000-000000000001","start_time":"22:00","end_time":"02:00","section_id":null,"station":"Overnight need","call_off":false,"hidden":false,"display_order":0}');
update lu_overnight_need set entry=public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-07',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries'->0;
update lu_overnight_need set result=pg_temp.commit_op(jsonb_build_object('kind','assign','source_entry_id',entry->'id','employee_id','15000000-0000-4000-8000-000000000001','target',(select target from lu_test)||'{"date":"2030-02-08","location_id":"11000000-0000-4000-8000-000000000001","start_time":"00:30","end_time":"01:30","section_id":null}','reason','Fill overnight need after midnight','travel_minutes',0));
select is((select sum(upper(public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,'America/Los_Angeles'))-lower(public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,'America/Los_Angeles'))) from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id where ln.lineup_date between '2030-02-07' and '2030-02-08' and e.employee_id is null),interval '3 hours','next-day partial fill leaves only the original three uncovered hours');
select is(public.lineup_entry_day('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(entry->>'id')::uuid),'2030-02-08'::date,'filled overnight need moves its retained identity to the actual local day') from lu_overnight_need;

-- Swapping into a counterpart's partial section retains that duty placement.
create temp table lu_segment_swap(a uuid,b uuid,entry jsonb,other jsonb,op jsonb,result jsonb);
insert into lu_segment_swap(result) select pg_temp.commit_op(jsonb_build_object('kind','assign','employee_id','15000000-0000-4000-8000-000000000001','target',target||'{"date":"2030-02-09","location_id":"11000000-0000-4000-8000-000000000001","start_time":"09:00","end_time":"17:00","section_id":"bbb00000-0000-4000-8000-000000000001"}','reason','Segment swap source','travel_minutes',0)) from lu_test;
update lu_segment_swap set a=(result->>'shift_id')::uuid;
update lu_segment_swap set result=pg_temp.commit_op(jsonb_build_object('kind','assign','employee_id','15000000-0000-4000-8000-000000000002','target',(select target from lu_test)||'{"date":"2030-02-09","location_id":"11000000-0000-4000-8000-000000000002","start_time":"09:00","end_time":"17:00","section_id":"bbb00000-0000-4000-8000-000000000001"}','reason','Segment swap counterpart','travel_minutes',0));
update lu_segment_swap set b=(result->>'shift_id')::uuid;
update lu_segment_swap set entry=public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-09',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries'->0,
other=public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-09',array['11000000-0000-4000-8000-000000000002'::uuid],null)->'locations'->0->'entries'->0;
select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','2030-02-09',(other->>'overlay_id')::uuid,(other->>'revision')::integer,other||'{"section_id":"bbb00000-0000-4000-8000-000000000002","placement_range":{"start_time":"10:00","end_time":"14:00"}}') from lu_segment_swap;
update lu_segment_swap set op=jsonb_build_object('kind','swap','source_entry_id',entry->'id','target_entry_id',other->'id','target',(select target from lu_test)||'{"date":"2030-02-09","location_id":"11000000-0000-4000-8000-000000000001","start_time":"11:00","end_time":"13:00","section_id":"bbb00000-0000-4000-8000-000000000001"}','reason','Swap within counterpart section interval','travel_minutes',0);
update lu_segment_swap set result=pg_temp.commit_op(op);
select is((select seg->>'section_id' from public.schedule_lineup_entries e cross join lateral public.lineup_project_entry(to_jsonb(e),'America/Los_Angeles') seg where e.source_shift_id=b),'bbb00000-0000-4000-8000-000000000002','counterpart keeps its actual section in the swapped interval') from lu_segment_swap;
select is((select employee_id::text from public.schedule_published_shifts where id=a),'15000000-0000-4000-8000-000000000002','source receives the counterpart employee atomically') from lu_segment_swap;
select is((select employee_id::text from public.schedule_published_shifts where id=b),'15000000-0000-4000-8000-000000000001','counterpart receives the source employee atomically') from lu_segment_swap;
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id cross join lateral public.lineup_project_entry(to_jsonb(e),'America/Los_Angeles') seg where ln.lineup_date='2030-02-09' and e.location_id='11000000-0000-4000-8000-000000000002' and e.employee_id='15000000-0000-4000-8000-000000000002'),4,'swap preserves both untouched counterpart section transitions');

-- Removing an assignment preserves the open slot and unchanged working intervals.
create temp table lu_release(op jsonb,entry jsonb,preview jsonb,result jsonb,shift_id uuid,key uuid default gen_random_uuid());
insert into lu_release(result) select pg_temp.commit_op(jsonb_build_object('kind','assign','employee_id','15000000-0000-4000-8000-000000000001','target',target||'{"date":"2030-02-10","start_time":"09:00","end_time":"17:00","section_id":"bbb00000-0000-4000-8000-000000000001"}','reason','Assignment removal fixture','travel_minutes',0)) from lu_test;
update lu_release set shift_id=(result->>'shift_id')::uuid;
update lu_release set entry=(select e from jsonb_array_elements(public.get_schedule_lineup_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-10',array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries') e where e->>'source_shift_id'=shift_id::text);
update lu_release set op=jsonb_build_object('kind','release','source_entry_id',entry->'id','target_entry_id',null,'employee_id',null,'target',(select target from lu_test)||'{"date":"2030-02-10","start_time":"11:00","end_time":"14:00","section_id":"bbb00000-0000-4000-8000-000000000001"}','reason','Leave the service need open','travel_minutes',0);
update lu_release set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select is(preview->>'allowed','true','future partial assignment removal can be previewed') from lu_release;
select is((select employee_id::text from public.schedule_published_shifts where id=shift_id),'15000000-0000-4000-8000-000000000001','removal preview leaves the employee assigned') from lu_release;
select is(pg_temp.run('preview',jsonb_build_object('operation',op||jsonb_build_object('target',op->'target'||'{"location_id":"11000000-0000-4000-8000-000000000002"}')))->>'allowed','false','removal cannot silently relocate the open need') from lu_release;
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','preview',jsonb_build_object('operation',op)) from lu_release$$,'P0001',null,'unrelated destination manager cannot remove a source assignment');
update lu_release set result=pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key));
select is((result->>'shift_id')::uuid,shift_id,'removal retains the canonical slot identity') from lu_release;
select ok((select employee_id is null and not hidden and not call_off from public.schedule_lineup_entries where id=(entry->>'id')::uuid),'the same operational slot becomes open and remains active') from lu_release;
select is((select start_time::text||'-'||end_time::text from public.schedule_published_shifts where id=shift_id),'11:00:00-14:00:00','only the selected interval becomes an open position') from lu_release;
select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date='2030-02-10' and employee_id='15000000-0000-4000-8000-000000000001'),2,'the unchanged before and after intervals remain assigned');
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id where ln.lineup_date='2030-02-10' and section_id='bbb00000-0000-4000-8000-000000000001'),3,'remaining work and the open need preserve their section');
select is(pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key))->>'event_id',result->>'event_id','a repeated confirmed removal is idempotent') from lu_release;
select throws_ok($$select pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid())) from lu_release$$,'P0001','stale Line Up operation preview','a second conflicting removal cannot reuse the old preview');
select is((select count(*)::integer from public.notifications where source_id=(result->>'event_id')::uuid and event_key='manager_assignment_changed' and recipient_user_id='aaa00000-0000-4000-8000-000000000101'),1,'source manager is notified of the confirmed staffing change') from lu_release;
select is((select count(*)::integer from public.notifications where source_id=(result->>'event_id')::uuid and event_key='manager_assignment_changed' and recipient_user_id='aaa00000-0000-4000-8000-000000000102'),0,'unrelated destination manager is not notified of a source-only removal') from lu_release;
select is((select count(*)::integer from public.notifications where source_id=(result->>'event_id')::uuid and event_key='manager_assignment_changed' and recipient_user_id in('aaa00000-0000-4000-8000-000000000101','aaa00000-0000-4000-8000-000000000102')),2,'confirmed cross-location swap notifies both scoped managers') from lu_segment_swap;

-- Extra-line notes travel with their slot, remaining coverage and immutable exports.
create temp table lu_extra_note(slot uuid,entry jsonb,result jsonb,op jsonb,share jsonb);
insert into lu_extra_note(result) select public.upsert_schedule_lineup_entry_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-02-10',null,null,target||'{"source_shift_id":null,"employee_id":null,"start_time":"18:00","end_time":"20:00","note":"Cover the private dining entrance","call_off":false,"hidden":false,"display_order":0}') from lu_test;
update lu_extra_note set slot=(result->>'entry_id')::uuid;
select is((select note from public.schedule_lineup_entries where id=slot),'Cover the private dining entrance','extra-line creation saves its optional team note atomically') from lu_extra_note;
update lu_extra_note set op=jsonb_build_object('kind','assign','source_entry_id',slot,'employee_id','15000000-0000-4000-8000-000000000002','target',(select target from lu_test)||'{"date":"2030-02-10","start_time":"18:00","end_time":"19:00"}','reason','Partial extra-line coverage','travel_minutes',0);
update lu_extra_note set result=pg_temp.commit_op(op);
select is((select note from public.schedule_lineup_entries where id=slot),'Cover the private dining entrance','filled extra line preserves the note and original slot id') from lu_extra_note;
select is((select count(*)::integer from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id where ln.lineup_date='2030-02-10' and e.note='Cover the private dining entrance'),2,'unfilled residual coverage retains the same instruction');
update lu_extra_note set entry=(select e from jsonb_array_elements(public.lineup_share_content('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-02-10',array['11000000-0000-4000-8000-000000000001'::uuid])->'locations'->0->'entries') e where e->>'id'=slot::text);
select is(entry->>'note','Cover the private dining entrance','share and export content include the saved assignment instruction') from lu_extra_note;
select is(public.lineup_employee_assignment(entry)->>'note','Cover the private dining entrance','employee assignment projection preserves the identical instruction') from lu_extra_note;
select isnt(public.lineup_person_fingerprint(jsonb_build_object('entries',jsonb_build_array(entry),'notes','[]'::jsonb,'briefs','[]'::jsonb),'15000000-0000-4000-8000-000000000002'),public.lineup_person_fingerprint(jsonb_build_object('entries',jsonb_build_array(entry||'{"note":"New instruction"}'),'notes','[]'::jsonb,'briefs','[]'::jsonb),'15000000-0000-4000-8000-000000000002'),'assignment note changes require a fresh personal acknowledgement') from lu_extra_note;

-- Acknowledgement reminders use only the current snapshot and pending recipients.
create temp table lu_remind(payload jsonb,result jsonb);
insert into lu_remind(payload) select jsonb_build_object('date','2030-01-19','location_id','11000000-0000-4000-8000-000000000001','snapshot_id',share->'snapshot_ids'->0) from lu_receipt_scope;
update public.lineup_receipts set acknowledged_at=case when employee_id='15000000-0000-4000-8000-000000000001' then now() else null end where snapshot_id=(select (payload->>'snapshot_id')::uuid from lu_remind);
update lu_remind set result=pg_temp.run('remind_unacknowledged',payload);
select is(result->>'sent','1','reminder reaches only the still-unacknowledged active recipient') from lu_remind;
select is((select count(*)::integer from public.notifications where source_id=(payload->>'snapshot_id')::uuid and event_key like 'ack_reminder:%' and recipient_user_id='aaa00000-0000-4000-8000-000000000101'),0,'an employee who already acknowledged is not reminded') from lu_remind;
select is(pg_temp.run('remind_unacknowledged',payload)->>'sent','0','retry within one hour does not duplicate reminders') from lu_remind;
select throws_ok($$select pg_temp.run('remind_unacknowledged',payload||jsonb_build_object('snapshot_id',gen_random_uuid())) from lu_remind$$,'P0001','stale acknowledgement list; open the latest shared version','a stale receipt list cannot target an old shared version');
select throws_ok($$select public.lineup_operations_service('aaa00000-0000-4000-8000-000000000102','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','remind_unacknowledged',payload) from lu_remind$$,'P0001','line-up access denied','reminders require share access to the actual location');
update public.lineup_receipts set acknowledged_at=now() where snapshot_id=(select (payload->>'snapshot_id')::uuid from lu_remind);
select is(pg_temp.run('remind_unacknowledged',payload)->>'sent','0','no reminders are sent after all recipients acknowledge') from lu_remind;

create temp table lu_republication(new_pub uuid);
insert into lu_republication values(gen_random_uuid());
update public.schedule_location_publications set status='superseded' where location_id='11000000-0000-4000-8000-000000000001' and week_start='2030-01-07';
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
select new_pub,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2030-01-07',2,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from lu_republication;
insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select ps.workspace_id,ps.location_id,n.new_pub,ps.employee_id,ps.job_id,ps.shift_type_id,ps.scheduled_date,ps.start_time,'16:00',ps.source_shift_id
from public.schedule_published_shifts ps cross join lu_republication n where ps.id=(select source_shift_id from public.schedule_lineup_entries where id=(select slot from lu_segments));
select ok((select source_changed from public.schedule_lineup_entries where id=slot),'new publication flags changed shift details') from lu_segments;
select is((select end_time::text from public.schedule_lineup_entries where id=slot),'16:00:00','stable source continuation refreshes the operational time') from lu_segments;
select throws_ok($$select public.lineup_share_content('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2030-01-09',array['11000000-0000-4000-8000-000000000001'::uuid])$$,'P0001','Review changed Schedule assignments before sharing','changed source must be reviewed before sharing');
select lives_ok($$select pg_temp.run('state','{"date":"2030-01-09","location_id":"11000000-0000-4000-8000-000000000001"}')$$,'source review state remains readable');
update public.schedule_location_publications set status='superseded' where location_id='11000000-0000-4000-8000-000000000001' and week_start='2030-01-07';
select is(pg_temp.run('state','{"date":"2030-01-09","location_id":"11000000-0000-4000-8000-000000000001"}')->>'source_current','false','unpublished Schedule is reported as unavailable');

set local role service_role;
select is(public.lineup_operations_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','guard','{"location_ids":["11000000-0000-4000-8000-000000000001"],"permission":"schedule.lineup.manage"}')->>'enabled','true','API service role checks rollout through the authenticated RPC boundary');
select is(public.lineup_operations_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','guard','{"entry_id":"bbb00000-0000-4000-8000-000000000011","permission":"schedule.lineup.manage"}')->>'enabled','true','API entry guard resolves the actual source location without direct table access');
reset role;

set local role authenticated;

select throws_ok($$select * from public.lineup_notes$$,'42501',null,'notes table denies direct browser reads');

select throws_ok($$select public.lineup_operations_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','state','{}')$$,'42501',null,'RPC cannot be called directly with a forged actor');

reset role;


select * from finish();

rollback;

