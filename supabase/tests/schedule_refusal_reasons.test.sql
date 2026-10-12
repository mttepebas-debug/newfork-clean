begin;
-- BL-1044: a Schedule write refused with PT409 says which kind of refusal in
-- its hint. The edit session refusals already did; auto-fill, default hours,
-- pasted batches, templates, reference hours, the availability review,
-- publishing and the conflict rules raised a bare PT409, so the API told the
-- availability review apart by its English sentence and the screens guessed
-- auto-fill's and the templates' refusals from the sentence or the status.
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; key text;
begin
 execute statement;
 return 'no refusal';
exception when others then
 get stacked diagnostics state=returned_sqlstate, key=pg_exception_hint;
 return state||' '||coalesce(nullif(key,''),'(no hint)');
end;
$$;

-- Every PT409 the Schedule functions raise carries one of the known keys.
create temp table refusal_functions as
select p.oid, n.nspname||'.'||p.proname fn
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname||'.'||p.proname = any(array[
 'public.add_schedule_pending_op_service','public.apply_schedule_auto_fill_service','public.apply_schedule_default_hours_service',
 'public.apply_schedule_template_service','public.bulk_delete_schedule_edit_shifts_service','public.create_schedule_shifts_batch_service',
 'public.delete_schedule_draft_service','public.delete_schedule_template_service','public.heartbeat_schedule_edit_session_service',
 'public.mutate_schedule_edit_shift_service','public.normalize_schedule_time_source','public.prepare_weekly_schedule_assignment',
 'public.preview_schedule_auto_fill_service','public.preview_schedule_default_hours_service','public.publish_schedule_draft_service',
 'public.rename_schedule_template_service','public.save_schedule_edit_session_service','public.undo_schedule_edit_session_step_service',
 'public.unpublish_schedule_service','public.update_scheduling_settings_service']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions),20,'every listed Schedule function exists');
select ok((select count(*)>=50 from refusal_raises),'the PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn),'{}') from refusal_raises where statement !~* 'hint'),'{}'::text[],
 'no Schedule PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key),'{}') from (select (regexp_match(statement,$re$hint\s*=\s*'([^']*)'$re$,'i'))[1] key from refusal_raises) k
 where key is null or key not in ('schedule.edit_session_closed','schedule.edit_lease_expired','schedule.edit_session_stale','schedule.draft_being_edited',
  'schedule.nothing_to_undo','schedule.auto_fill_stale','schedule.default_hours_stale','schedule.request_key_reused','schedule.template_changed',
  'schedule.reference_hours_changed','schedule.availability_review_required','schedule.publication_changed','schedule.rules_changed')),'{}'::text[],
 'every key is one the screens know');

-- A throwaway world (the fixture of schedule_templates_autofill_export.test.sql).
select tests.world('sr');
select tests.person('sr', 'alex', 'employee', array['K'], array['cook']);
select tests.remember('sr:draft', gen_random_uuid());
insert into public.schedule_drafts(id,workspace_id,week_start,name,revision,created_by,updated_by,location_ids)
select tests.id('sr:draft'), tests.id('sr'), tests.week(1), 'Refusal source', 1, tests.user('sr:owner'), tests.user('sr:owner'), array[tests.id('sr:K')];
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note,revision) values
(gen_random_uuid(), tests.id('sr'), tests.id('sr:draft'), tests.id('sr:K'), null, tests.id('sr:job:cook'), null, tests.week(1)+1, '10:00','14:00','Open slot',1);
create temp table sr as select tests.user('sr:owner') owner_id, tests.id('sr') w, tests.id('sr:K') k, tests.id('sr:alex') alex,
 tests.id('sr:job:cook') cook, tests.week(1) week1, tests.id('sr:draft') draft_id, null::jsonb template, null::jsonb session, null::jsonb autofill;

-- Templates: a rename or delete on an old revision names the changed template.
update sr set template=public.create_schedule_template_service(owner_id,w,draft_id,'Refusal week',true);
select is(pg_temp.refusal($$select public.rename_schedule_template_service(owner_id,w,(template->'template'->>'id')::uuid,'Stale',99) from sr$$),
 'PT409 schedule.template_changed','a rename on an old revision names the changed template');
select is(pg_temp.refusal($$select public.delete_schedule_template_service(owner_id,w,(template->'template'->>'id')::uuid,99) from sr$$),
 'PT409 schedule.template_changed','a delete on an old revision names the changed template');

-- Auto-fill: an apply that no longer matches its review names the stale review.
update sr set session=public.acquire_schedule_edit_session_service(owner_id,w,week1,'blank',null)->'session';
update sr set session=public.apply_schedule_template_service(owner_id,w,(session->>'id')::uuid,(session->>'revision')::integer,(template->'template'->>'id')::uuid,'overwrite')->'session';
update sr set autofill=public.preview_schedule_auto_fill_service(owner_id,w,(session->>'id')::uuid);
select is(pg_temp.refusal($$select public.apply_schedule_auto_fill_service(owner_id,w,(autofill->>'session_id')::uuid,(autofill->>'session_revision')::integer,repeat('f',64),'[]') from sr$$),
 'PT409 schedule.auto_fill_stale','auto-fill on a changed review names the stale review');
select is(pg_temp.refusal($$select public.apply_schedule_auto_fill_service(owner_id,w,(autofill->>'session_id')::uuid,(autofill->>'session_revision')::integer-1,autofill->>'fingerprint','[]') from sr$$),
 'PT409 schedule.auto_fill_stale','auto-fill on an older edit names the stale review');

-- The availability review: an assignment on a closed day saved with an old
-- assessment names the review, which the API used to find by its sentence.
insert into public.important_dates(id,workspace_id,location_id,location_ids,starts_on,ends_on,title,type,created_by)
select gen_random_uuid(),w,k,array[k],week1,week1,'Closed','closed_day',owner_id from sr;
select is(pg_temp.refusal($$select public.mutate_schedule_edit_shift_service(owner_id,w,(session->>'id')::uuid,
  (select revision from public.schedule_edit_sessions where id=(session->>'id')::uuid),'create',gen_random_uuid(),null,
  jsonb_build_object('location_id',k,'employee_id',alex,'job_id',cook,'scheduled_date',week1,'time_basis','explicit','start_time','09:00','end_time','13:00',
   'time_timezone',(select timezone from public.locations where id=k),'note','','availability_assessment_fingerprint','stale'),gen_random_uuid()) from sr$$),
 'PT409 schedule.availability_review_required','an assignment saved on an old availability review names the review');

-- Settings > Conflict handling: a save over newer rules names the changed rules.
select is(pg_temp.refusal($$select public.update_scheduling_settings_service(owner_id,w,
  jsonb_build_object('conflict_rules_revision',(select coalesce(conflict_rules_revision,0) from public.workspace_scheduling_settings where workspace_id=w)+99)) from sr$$),
 'PT409 schedule.rules_changed','a conflict rules save over newer rules names the changed rules');

select * from finish();
rollback;
