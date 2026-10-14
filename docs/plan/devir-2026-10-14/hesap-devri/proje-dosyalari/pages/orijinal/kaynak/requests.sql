begin;
create or replace function pg_temp.leave(who text, days date[], reason text) returns uuid language plpgsql as $$
declare sent jsonb;
begin
  sent := public.submit_time_off_service(tests.user('hv:' || who), tests.id('hv'),
    (select jsonb_agg(jsonb_build_object('segment_date', d) order by d) from unnest(days) d), reason, 'America/New_York', gen_random_uuid());
  perform tests.settle();
  return tests.remember('hv:' || who || ':time_off:' || days[1], (sent ->> 'request_id')::uuid);
end $$;
create or replace function pg_temp.cmd(who text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('hv:' || who), tests.id('hv'), command, gen_random_uuid()) $$;
create function pg_temp.doc_ok(person text, doc text) returns void language plpgsql as $f$
declare r public.employee_onboarding_requirements; rev integer;
begin
  select * into r from public.employee_onboarding_requirements q join public.document_types t on t.id = q.source_id
    where q.employee_id = tests.id('hv:' || person) and t.title = doc and q.kind = 'document';
  rev := public.save_employee_document_draft_file_service(tests.user('hv:' || person), r.id, r.lifecycle_revision,
    r.workspace_id || '/' || r.employee_id || '/' || r.id || '/' || gen_random_uuid() || '.pdf', person || '-' || replace(lower(doc), ' ', '-') || '.pdf', 'application/pdf', 240000);
  perform tests.settle();
  perform public.submit_employee_document_lifecycle_service(tests.user('hv:' || person), r.id, rev,
    (select x.id from public.employee_document_submissions x where x.requirement_id = r.id and x.state = 'draft'), date '2028-03-31', '{}'::jsonb);
  perform tests.settle();
  select * into r from public.employee_onboarding_requirements where id = r.id;
  if r.submitted_document_id is null or not (select t.requires_review from public.document_types t where t.id = r.source_id) then return; end if;
  perform public.review_employee_document_lifecycle_service(tests.user('hv:laura'), r.workspace_id, r.id, r.lifecycle_revision,
    r.submitted_document_id, 'approve', '', 'full',
    (select jsonb_agg(jsonb_build_object('id', f.file_id, 'decision', 'keep')) from public.employee_document_submission_files f where f.submission_id = r.submitted_document_id));
  perform tests.settle();
end $f$;
select pg_temp.doc_ok('aisha', 'Food Handler Card');
select pg_temp.doc_ok('aisha', 'Employee Handbook');
select pg_temp.doc_ok('daniel', 'Employee Handbook');
select pg_temp.doc_ok('luis', 'Employee Handbook');
-- time off: pending, approved, denied
select pg_temp.leave('maria', array[tests.week(1) + 1, tests.week(1) + 2], 'Family visiting from out of town');
select pg_temp.leave('noah', array[tests.week(1) + 5], 'Sister''s wedding');
select pg_temp.leave('olivia', array[tests.week(2) + 3, tests.week(2) + 4], 'Midterm exams');
select pg_temp.leave('priya', array[tests.week(1) + 3], 'Doctor''s appointment');
select pg_temp.leave('tom', array[tests.week(2) + 0], 'Moving apartments');
select public.decide_time_off_service(tests.user('hv:owner'), tests.id('hv'), tests.id('hv:priya:time_off:' || (tests.week(1) + 3)), 'approve', '',
  app_private.time_off_impact(tests.id('hv'), tests.id('hv:priya:time_off:' || (tests.week(1) + 3))) ->> 'fingerprint');
select tests.settle();
select public.decide_time_off_service(tests.user('hv:owner'), tests.id('hv'), tests.id('hv:tom:time_off:' || (tests.week(2) + 0)), 'deny', 'Inventory day, we need you in the morning.',
  app_private.time_off_impact(tests.id('hv'), tests.id('hv:tom:time_off:' || (tests.week(2) + 0))) ->> 'fingerprint');
select tests.settle();
-- swap: Emma (Uptown lunch Mon) <-> Noah (Uptown dinner Sun), Noah accepted -> ready for review
create temp table sw as select (pg_temp.cmd('carlos', jsonb_build_object('action', 'create', 'kind', 'swap',
  'shift_id', tests.id('hv:shift:d1-carlos-linecook-0'), 'requested_shift_id', tests.id('hv:shift:d1-aisha-linecook-5'))) ->> 'case_id')::uuid as case_id;
select tests.settle();
select pg_temp.cmd('aisha', jsonb_build_object('action', 'accept', 'case_id', sw.case_id,
  'application_id', (select a.id from public.shift_exchange_applications a where a.case_id = sw.case_id order by a.created_at limit 1),
  'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = sw.case_id))) from sw;
select tests.settle();
-- swap waiting for Carlos's answer: Aisha (Downtown dinner Wed) <-> Carlos (Downtown lunch Thu)
select pg_temp.cmd('aisha', jsonb_build_object('action', 'create', 'kind', 'swap',
  'shift_id', tests.id('hv:shift:d1-aisha-linecook-2'), 'requested_shift_id', tests.id('hv:shift:d1-carlos-linecook-3')));
select tests.settle();
-- cover with an applicant (ready for review) and one still finding cover
select tests.cover_case('hv', 'd1-luis-dishwasher-4', 'luis', 'tom');
select pg_temp.cmd('maria', jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('hv:shift:d1-maria-server-4')));
select tests.settle();
-- an open shift somebody asked for
select pg_temp.cmd('daniel', jsonb_build_object('action', 'apply', 'shift_id', tests.id('hv:shift:d1-open-busser-5')));
select tests.settle();
commit;
