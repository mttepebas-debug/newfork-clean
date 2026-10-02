begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- BL-237: this file used to build its own draft by copying whatever the real
-- seeded Meyhouse workspace's data had `status='current'` right now, and gave
-- that draft current_date's week as its own week_start -- the two only
-- agreed on the day the real data was last published. A throwaway
-- tests.world() that publishes its own seven shifts for this run's own week
-- means the draft's week and its copied shifts' dates always agree.
select tests.world('pub');
-- A second department (tests.world only seeds Kitchen, with Cook and Server)
-- for the department-scoped publish test below: Host lives in Dining, Cook in
-- Kitchen, so naming Dining's department really does leave Cook's shift out.
select tests.remember('pub:dept:dining', (public.create_department_with_jobs_service(
  tests.user('pub:owner'), tests.id('pub'),
  '{"name": "Dining", "color": "#4478A8"}'::jsonb, '[{"name": "Host", "color": "#D39A36"}]'::jsonb
) -> 'department' ->> 'id')::uuid);
select tests.remember('pub:job:host', (select id from public.jobs where workspace_id = tests.id('pub') and department_id = tests.id('pub:dept:dining') and name = 'Host'));
select tests.person('pub', 'mgr', 'manager', array['K'], array['cook']);
select tests.person('pub', 'emp', 'employee', array['K', 'B'], array['cook']);
select tests.person('pub', 'leaveemp', 'employee', array['K'], array['cook']);
select tests.person('pub', 'closureemp', 'employee', array['B'], array['cook']);
select tests.person('pub', 'deptemp1', 'employee', array['K'], array['host']);
select tests.person('pub', 'deptemp2', 'employee', array['K'], array['cook']);

-- Seven real published shifts (five Kadikoy, two Besiktas), matching the
-- real seed's own total this file used to depend on.
select tests.publish_week('pub', 1, '[
  {"label": "k0", "person": "leaveemp", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"},
  {"label": "k1", "person": "leaveemp", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"},
  {"label": "k3", "person": "leaveemp", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "17:00"},
  {"label": "k4", "person": "leaveemp", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "17:00"},
  {"label": "k5", "person": "leaveemp", "loc": "K", "job": "cook", "day": 5, "start": "09:00", "end": "17:00"},
  {"label": "b0", "person": "closureemp", "loc": "B", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"},
  {"label": "b1", "person": "closureemp", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}
]');

select tests.remember('pub:draft:main', gen_random_uuid());
insert into public.schedule_drafts (id, workspace_id, week_start, name, revision, created_by, updated_by, location_ids)
select tests.id('pub:draft:main'), tests.id('pub'), tests.week(1), 'Publication test draft', 1,
  tests.user('pub:owner'), tests.user('pub:owner'), array[tests.id('pub:K'), tests.id('pub:B')];
insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, revision)
select source_shift_id, workspace_id, tests.id('pub:draft:main'), location_id,
employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, 1
from public.schedule_published_shifts
-- Only this fixture's own workspace, and only the live version of each shift:
-- a shared local DB carries other workspaces and republish history
-- (superseded versions repeat a source_shift_id), neither is this draft's business.
where workspace_id = tests.id('pub')
  and publication_id in (select id from public.schedule_location_publications where status = 'current');

-- Two conflicts this draft must surface on its own: an approved leave (K,
-- always a hard block) for leaveemp, and a location closure (soft, needs a
-- reason) for closureemp, on dates nothing else in this fixture has touched.
select tests.remember('pub:shift:leave-conflict', gen_random_uuid());
select tests.remember('pub:shift:closure-conflict', gen_random_uuid());
insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, revision) values
(tests.id('pub:shift:leave-conflict'), tests.id('pub'), tests.id('pub:draft:main'), tests.id('pub:K'), tests.id('pub:leaveemp'), tests.id('pub:job:cook'), null, tests.week(1) + 2, '11:00', '15:00', 'Overlaps an approved leave', 1),
(tests.id('pub:shift:closure-conflict'), tests.id('pub'), tests.id('pub:draft:main'), tests.id('pub:B'), tests.id('pub:closureemp'), tests.id('pub:job:cook'), null, tests.week(1) + 5, '09:00', '17:00', 'Falls on a closure', 1);
select tests.remember('pub:timeoff:leave', gen_random_uuid());
select tests.approved_leave(tests.id('pub'), tests.id('pub:leaveemp'), tests.user('pub:owner'), tests.id('pub:K'), tests.week(1) + 2, '10:00', '14:00', tests.id('pub:timeoff:leave'));
insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, created_by)
 select gen_random_uuid(), tests.id('pub'), tests.id('pub:B'), array[tests.id('pub:B')]::uuid[], (tests.week(1) + 5)::date, (tests.week(1) + 5)::date, 'Deep clean', 'closed_day', tests.user('pub:owner');

-- authenticated/service_role have no USAGE on the tests schema, so every id a
-- role-switched statement needs is resolved here first, while still postgres.
create temp table pub_ids as select
  tests.user('pub:owner') owner_id, tests.user('pub:mgr') mgr, tests.user('pub:emp') emp,
  tests.id('pub') w, tests.id('pub:K') k, tests.id('pub:B') b,
  tests.id('pub:draft:main') draft_id, tests.week(1) week1;
grant select on pub_ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from pub_ids), true);
select throws_ok($$select * from public.schedule_publication_events$$,'42501',null,'events deny direct authenticated reads');
select throws_ok($$select * from public.schedule_publication_overrides$$,'42501',null,'overrides deny direct authenticated reads');

reset role;
select is((select count(distinct r.system_key)::integer from public.workspace_role_permissions g join public.workspace_roles r on r.id=g.role_id where r.workspace_id=(select w from pub_ids) and r.system_key in ('owner','admin','manager') and g.permission_key='schedule.publish'),3,'manager roles receive publish');
select ok(not exists(select 1 from public.workspace_role_permissions g join public.workspace_roles r on r.id=g.role_id where r.workspace_id=(select w from pub_ids) and r.system_key='employee' and g.permission_key='schedule.publish'),'employee does not receive publish');

create temp table publication_state (hard jsonb, soft jsonb, published jsonb, unpreview jsonb, unpublished jsonb);
insert into publication_state (hard,soft)
select public.preview_schedule_publication_service(owner_id, w, draft_id, array[k]),
  public.preview_schedule_publication_service(owner_id, w, draft_id, array[b])
from pub_ids;
select is(hard->>'status','hard_blocked','an approved leave hard-blocks preview') from publication_state;
select is((select count(*)::integer from jsonb_array_elements(hard->'findings') x where x->>'severity'='hard' and x->'shift_ids' ? (select tests.id('pub:shift:leave-conflict')::text)),1,'the hard finding names the shift overlapping the approved leave') from publication_state;
select throws_ok(format($$select public.publish_schedule_draft_service(%L,%L,%L,array[%L::uuid],null,true,1,%L,'[]')$$,(select owner_id from pub_ids),(select w from pub_ids),(select draft_id from pub_ids),(select k from pub_ids),(select hard->>'fingerprint' from publication_state)),'23514','schedule has hard publication blockers','hard blocker cannot be bypassed');
select is((select count(*)::integer from public.schedule_location_publications where location_id=(select k from pub_ids)),1,'hard blocked publish rolls back');
select is(soft->>'status','override_required','a closure requires override') from publication_state;
select is((select count(*)::integer from jsonb_array_elements(soft->'findings') x where x->>'severity'='soft' and x->'shift_ids' ? (select tests.id('pub:shift:closure-conflict')::text)),1,'the closure finding names the shift falling on the closure') from publication_state;
select throws_ok(format($$select public.publish_schedule_draft_service(%L,%L,%L,array[%L::uuid],null,true,1,%L,'[]')$$,(select owner_id from pub_ids),(select w from pub_ids),(select draft_id from pub_ids),(select b from pub_ids),(select soft->>'fingerprint' from publication_state)),'22023','Confirm the current schedule conflicts before publishing','soft finding requires reason');
select throws_ok(format($$select public.publish_schedule_draft_service(%L,%L,%L,array[%L::uuid],null,true,1,%L,'[]')$$,(select owner_id from pub_ids),(select w from pub_ids),(select draft_id from pub_ids),(select b from pub_ids),repeat('f',64)),'PT409','stale publication preview','stale fingerprint fails closed');

update publication_state s set published=(select public.publish_schedule_draft_service(
  owner_id, w, draft_id, array[b], null, true, 1, s.soft->>'fingerprint',
  jsonb_build_array(jsonb_build_object('finding_id', s.soft->'findings'->0->>'id', 'reason', 'Private event staffing approved by location manager.'))
) from pub_ids);
select is(published->>'status','published','reviewed draft publishes') from publication_state;
select is((select version_number from public.schedule_location_publications where location_id=(select b from pub_ids) and status='current'),2,'republish increments version');
select is((select status::text from public.schedule_location_publications where workspace_id=(select w from pub_ids) and location_id=(select b from pub_ids) and version_number=1),'superseded','prior version is superseded');
select is((select count(*)::integer from public.schedule_publication_overrides where workspace_id=(select w from pub_ids)),1,'override is audited');
select is((select count(*)::integer from public.schedule_publication_events where source_draft_id=(select draft_id from pub_ids) and action='published'),1,'publish event is recorded');
select is((select jsonb_array_length(public.get_schedule_read_model_service(owner_id,w,week1)->'shifts') from pub_ids),8,'republish does not duplicate live shifts, and carries the newly reviewed one');

update publication_state set unpreview=(select public.preview_schedule_unpublication_service(owner_id,w,week1,array[b]) from pub_ids);
select is(unpreview->>'status','unpublish_ready','current location previews for unpublish') from publication_state;
select throws_ok(format($$select public.unpublish_schedule_service(%L,%L,%L,array[%L::uuid],repeat('e',64))$$,(select owner_id from pub_ids),(select w from pub_ids),(select week1 from pub_ids),(select b from pub_ids)),'PT409','stale unpublication preview','stale unpublish fails closed');
update publication_state s set unpublished=(select public.unpublish_schedule_service(owner_id,w,week1,array[b],s.unpreview->>'fingerprint') from pub_ids);
select is(unpublished->>'status','unpublished','selected location unpublishes') from publication_state;
select is((select jsonb_array_length(public.get_schedule_read_model_service(owner_id,w,week1)->'shifts') from pub_ids),5,'unpublished location leaves live read model');
select is((select count(*)::integer from public.schedule_location_publications where location_id=(select b from pub_ids)),2,'unpublish preserves history');
select is((select count(*)::integer from public.schedule_publication_events where source_draft_id=(select draft_id from pub_ids) or (action='unpublished' and location_ids @> array[(select b from pub_ids)])),2,'publish and unpublish events remain');
select is((select jsonb_array_length(public.get_schedule_publication_history_service(mgr,w,week1)->'publications') from pub_ids),1,'publication history is limited to manager location scope');

select throws_ok(format($$select public.preview_schedule_publication_service(%L,%L,%L,array[%L::uuid])$$,(select emp from pub_ids),(select w from pub_ids),(select draft_id from pub_ids),(select k from pub_ids)),'42501','Not allowed','employee cannot preview');
select throws_ok(format($$select public.preview_schedule_publication_service(%L,%L,%L,array[%L::uuid])$$,(select mgr from pub_ids),(select w from pub_ids),(select draft_id from pub_ids),(select b from pub_ids)),'42501','Not allowed','scoped manager cannot preview another location');
-- The message alone ('Not allowed') is the same string for every authz.*
-- reason; check the reason itself (nf-guvenlik D2, 2026-09-26).
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
select is(pg_temp.said(format($$select public.preview_schedule_publication_service(%L,%L,%L,array[%L::uuid])$$,(select emp from pub_ids),(select w from pub_ids),(select draft_id from pub_ids),(select k from pub_ids))),
  '42501 authz.missing_permission schedule.publish', 'an employee is refused for missing permission, not some other reason');
select is(pg_temp.said(format($$select public.preview_schedule_publication_service(%L,%L,%L,array[%L::uuid])$$,(select mgr from pub_ids),(select w from pub_ids),(select draft_id from pub_ids),(select b from pub_ids))),
  '42501 authz.out_of_scope schedule.publish', 'a scoped manager is refused as out of scope for the other location, not some other reason');
set local role postgres;
insert into public.document_types(
 id,workspace_id,title,description,required_at_onboarding,requires_review,accepted_formats,tracks_expiry,expiry_warning_days,expiry_schedule_impact,sort_order,created_by
)
select gen_random_uuid(), w, 'Schedule certificate', 'Schedule conflict fixture', true, false, array['pdf'], true, 14, 'track_only', 200, owner_id
from pub_ids;
-- A document requirement is only created against a published document type;
-- against a draft, the row is dropped without a word and everything that
-- points at it fails later (same trap noted in schedule_edit_sessions.test.sql).
update public.document_types set publication_status='published' where workspace_id = (select w from pub_ids) and title = 'Schedule certificate';
create temp table pub_doc_ids as select
  (select id from public.document_types where workspace_id = w and title = 'Schedule certificate') doc_type,
  (select id from public.workspace_memberships where workspace_id = w and user_id = tests.user('pub:leaveemp')) membership,
  (select id from public.employee_onboarding_cases where employee_id = (select tests.id('pub:leaveemp'))) case_id,
  gen_random_uuid() requirement_id, gen_random_uuid() document_id_1, gen_random_uuid() document_id_2
from pub_ids;
update public.employee_onboarding_cases set status='approved', submitted_at=now(), approved_at=now(), approved_by=(select owner_id from pub_ids)
where id = (select case_id from pub_doc_ids);
insert into public.employee_onboarding_requirements(id,workspace_id,case_id,employee_id,kind,source_id,title,required,blocks_activation,requires_review,sort_order,status)
select doc_ids.requirement_id, ids.w, doc_ids.case_id, tests.id('pub:leaveemp'), 'document', doc_ids.doc_type, 'Schedule certificate', true, true, false, 200, 'completed'
from pub_ids ids, pub_doc_ids doc_ids;
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
select doc_ids.document_id_1, ids.w, tests.id('pub:leaveemp'), doc_ids.requirement_id, 1,
  ids.w || '/' || tests.id('pub:leaveemp') || '/' || doc_ids.requirement_id || '/' || doc_ids.document_id_1 || '.pdf',
  'schedule-cert.pdf', 'application/pdf', 1024, 'accepted', ids.week1 - 1, ids.owner_id
from pub_ids ids, pub_doc_ids doc_ids;
set local role service_role;
select is((select jsonb_array_length(public.list_schedule_draft_document_conflicts_service(owner_id,w,draft_id,week1,array(select distinct d.location_id from public.schedule_draft_shifts d where d.draft_id=(select draft_id from pub_ids)))->'conflicts') from pub_ids),0,'tracking-only document expiry does not create Schedule conflicts');
set local role postgres;
-- A published document type's policy fields are frozen; step out to draft to
-- change the impact, then back, same as the real unpublish/republish flow.
update public.document_types set publication_status='draft' where id=(select doc_type from pub_doc_ids);
update public.document_types set expiry_schedule_impact='warn' where id=(select doc_type from pub_doc_ids);
update public.document_types set publication_status='published' where id=(select doc_type from pub_doc_ids);
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
select doc_ids.document_id_2, ids.w, tests.id('pub:leaveemp'), doc_ids.requirement_id, 2,
  ids.w || '/' || tests.id('pub:leaveemp') || '/' || doc_ids.requirement_id || '/' || doc_ids.document_id_2 || '.pdf',
  'schedule-cert-renewal.pdf', 'application/pdf', 1024, 'awaiting_review', current_date + 90, ids.owner_id
from pub_ids ids, pub_doc_ids doc_ids;
create temp table document_conflict_state (soft jsonb, hard jsonb);
grant select, insert, update on document_conflict_state to service_role;
set local role service_role;
insert into document_conflict_state(soft)
select public.list_schedule_draft_document_conflicts_service(owner_id,w,draft_id,week1,array(select distinct d.location_id from public.schedule_draft_shifts d where d.draft_id=(select draft_id from pub_ids)))
from pub_ids;
select ok(jsonb_array_length(soft->'conflicts') > 0,'warn document expiry creates Schedule preview conflicts') from document_conflict_state;
select is(soft->'conflicts'->0->>'severity','soft','warn document expiry is a soft conflict') from document_conflict_state;
select is(soft->'conflicts'->0->>'review_action','review_document','pending replacement document exposes review action') from document_conflict_state;
select throws_ok(format($$select public.list_schedule_draft_document_conflicts_service(%L,'7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',%L,%L,array(select distinct d.location_id from public.schedule_draft_shifts d where d.draft_id=%L))$$,(select owner_id from pub_ids),(select draft_id from pub_ids),(select week1 from pub_ids),(select draft_id from pub_ids)),'42501','Not allowed','same account employee role in another tenant cannot preview Schedule document conflict signals');
set local role postgres;
update public.document_types set publication_status='draft' where id=(select doc_type from pub_doc_ids);
update public.document_types set expiry_schedule_impact='block' where id=(select doc_type from pub_doc_ids);
update public.document_types set publication_status='published' where id=(select doc_type from pub_doc_ids);
select is((select expiry_policy_version from public.document_types where id=(select doc_type from pub_doc_ids)),3,'expiry policy version increments with impact changes');
set local role service_role;
update document_conflict_state
set hard=(select public.list_schedule_draft_document_conflicts_service(owner_id,w,draft_id,week1,array(select distinct d.location_id from public.schedule_draft_shifts d where d.draft_id=(select draft_id from pub_ids))) from pub_ids);
select is(hard->'conflicts'->0->>'severity','hard','block document expiry is a hard conflict') from document_conflict_state;
select is(hard->'conflicts'->0->>'overrideable','false','block document expiry is not overrideable') from document_conflict_state;

set local role postgres;
select tests.remember('pub:draft:doc', gen_random_uuid());
insert into public.schedule_drafts (
  id, workspace_id, week_start, name, revision, created_by, updated_by, location_ids
)
select tests.id('pub:draft:doc'), w, week1, 'Document hard conflict publish draft', 1, owner_id, owner_id, array[k]
from pub_ids;
insert into public.schedule_draft_shifts (
  id, workspace_id, draft_id, location_id, employee_id, job_id,
  shift_type_id, scheduled_date, start_time, end_time, note, revision
)
select gen_random_uuid(), w, tests.id('pub:draft:doc'), k, tests.id('pub:leaveemp'), tests.id('pub:job:cook'),
  null, week1 + 3, '02:00', '03:00', 'Document hard conflict fixture', 1
from pub_ids;
create temp table document_publish_hard_state (preview jsonb);
grant select, insert on document_publish_hard_state to service_role;
set local role service_role;
select is(
  (select jsonb_array_length(public.list_schedule_draft_document_conflicts_service(
    owner_id, w, tests.id('pub:draft:doc'), week1, array[k], null, true
  )->'conflicts') from pub_ids),
  1,
  'scoped document conflict preview returns selected location blockers'
);
select is(
  (select jsonb_array_length(public.list_schedule_draft_document_conflicts_service(
    owner_id, w, tests.id('pub:draft:doc'), week1, array[b], null, true
  )->'conflicts') from pub_ids),
  0,
  'scoped document conflict preview omits unselected location blockers'
);
select throws_ok(
  format($$select public.list_schedule_draft_document_conflicts_service(%L,%L,%L,%L,array[%L::uuid],null,true)$$,
    (select mgr from pub_ids),(select w from pub_ids),(select tests.id('pub:draft:doc')),(select week1 from pub_ids),(select b from pub_ids)),
  '42501',
  'Not allowed',
  'scoped document conflict preview rejects inaccessible locations'
);
insert into document_publish_hard_state(preview)
select public.preview_schedule_publication_service(
  owner_id, w, tests.id('pub:draft:doc'), array[k], null, true
) from pub_ids;
select throws_ok(
  format($$select public.publish_schedule_draft_service(%L,%L,%L,array[%L::uuid],null,true,1,%L,'[]'::jsonb)$$,
    (select owner_id from pub_ids),(select w from pub_ids),(select tests.id('pub:draft:doc')),(select k from pub_ids),
    (select preview->>'fingerprint' from document_publish_hard_state)),
  '23514', 'schedule has hard document blockers',
  'expired hard-block document prevents publish'
);
select is((select count(*)::integer from public.schedule_location_publications where source_draft_id = (select tests.id('pub:draft:doc'))), 0, 'hard document conflict publish rolls back');
set local role postgres;
-- tests.week() anchors 700 days in the future to stay clear of the real
-- seed's own weeks; "a week ago" has to mean the actual calendar's past, not
-- one week earlier in that distant future, or this would still be ahead of
-- today and never close.
update public.schedule_drafts set week_start=current_date - (extract(isodow from current_date)::integer - 1) - 7 where id = (select draft_id from pub_ids);
select is((select public.preview_schedule_publication_service(owner_id,w,draft_id,array[k])->>'status' from pub_ids),'past_week_closed','past week closes without payroll dependencies');

-- O1's fourth protection: a department-scoped publish is genuinely partial.
-- A brand new location with a Dining Room shift and a Kitchen shift; naming
-- only Dining Room publishes that one and leaves the Kitchen one waiting in
-- the same draft, not merely hidden from the preview.
select tests.remember('pub:loc:wing', gen_random_uuid());
insert into public.locations (id, workspace_id, short_name, name, street_address, city, region, postal_code, timezone)
select tests.id('pub:loc:wing'), w, 'T00090', 'Test Wing', '1 Test Wing', 'Los Angeles', 'CA', '90001', 'America/Los_Angeles'
from pub_ids;
insert into public.employee_location_assignments (workspace_id, employee_id, location_id, created_by)
select w, tests.id('pub:deptemp1'), tests.id('pub:loc:wing'), owner_id from pub_ids
union all
select w, tests.id('pub:deptemp2'), tests.id('pub:loc:wing'), owner_id from pub_ids;
select tests.remember('pub:draft:dept', gen_random_uuid());
insert into public.schedule_drafts (id, workspace_id, week_start, name, revision, created_by, updated_by, location_ids)
select tests.id('pub:draft:dept'), w, week1, 'Department publish test', 1, owner_id, owner_id, array[tests.id('pub:loc:wing')]
from pub_ids;
select tests.remember('pub:shift:dining', gen_random_uuid());
select tests.remember('pub:shift:kitchen', gen_random_uuid());
insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, note, revision)
select tests.id('pub:shift:dining'), w, tests.id('pub:draft:dept'), tests.id('pub:loc:wing'), tests.id('pub:deptemp1'), tests.id('pub:job:host'), null::uuid, week1 + 1, '10:00'::time, '14:00'::time, 'Dining Room shift', 1
from pub_ids
union all
select tests.id('pub:shift:kitchen'), w, tests.id('pub:draft:dept'), tests.id('pub:loc:wing'), tests.id('pub:deptemp2'), tests.id('pub:job:cook'), null::uuid, week1 + 1, '10:00'::time, '14:00'::time, 'Kitchen shift', 1
from pub_ids;
create temp table department_publish_state (dining jsonb, published jsonb);
insert into department_publish_state (dining)
select public.preview_schedule_publication_service(
  owner_id, w, tests.id('pub:draft:dept'), array[tests.id('pub:loc:wing')], array[tests.id('pub:dept:dining')], false
) from pub_ids;
select is((dining->'locations'->0->>'next_shift_count')::integer,1,'a department-scoped preview counts only that department''s shift') from department_publish_state;
update department_publish_state s set published = (select public.publish_schedule_draft_service(
  owner_id, w, tests.id('pub:draft:dept'), array[tests.id('pub:loc:wing')], array[tests.id('pub:dept:dining')], false,
  1, s.dining->>'fingerprint', '[]'
) from pub_ids);
select is(published->>'status','published','the named department publishes on its own') from department_publish_state;
select is((select count(*)::integer from public.schedule_published_shifts where location_id=(select tests.id('pub:loc:wing'))),1,'only the Dining Room shift goes live');
select is((select count(*)::integer from public.schedule_draft_shifts where id=(select tests.id('pub:shift:kitchen')) and draft_id=(select tests.id('pub:draft:dept'))),1,'the Kitchen shift itself stays in the draft, unpublished, not merely uncounted');

select * from finish();
rollback;
