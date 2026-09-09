-- Read-only assertions for the named local browser fixture after slices 30/31.
-- This is acceptance evidence, not a fresh-seed migration regression suite.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);
select is((select status::text from employee_onboarding_cases where employee_id='f4dd02f1-937e-4915-92ac-2619994eac55'), 'approved', 'real onboarding submission approved the case');
select is((select status::text from workspace_memberships where workspace_id='e2afe393-c45d-4537-b984-114300cf568e' and user_id='5986e930-d2c2-4648-9d0a-7bce8e142260'), 'active', 'onboarding activated the existing employee membership');
select is((select count(*)::int from employee_schedule_availability_versions where employee_id='f4dd02f1-937e-4915-92ac-2619994eac55'), 4, 'all four immutable availability versions remain');
select is((select count(*)::int from availability_requests where employee_id='f4dd02f1-937e-4915-92ac-2619994eac55' and status='effective'), 4, 'four submitted requests reached effective status');
select is((select array_agg(source order by version_number) from employee_schedule_availability_versions where employee_id='f4dd02f1-937e-4915-92ac-2619994eac55'), array['onboarding','onboarding','onboarding','employee']::text[], 'activation preserves onboarding provenance and new in-app writes use employee source');
select is((select effective_until-effective_from+1 from employee_schedule_availability_versions where employee_id='f4dd02f1-937e-4915-92ac-2619994eac55' and version_number=3), 14, 'replacement did not mutate original temporary bounds');
select is((select replace_version_ids from employee_schedule_availability_versions where employee_id='f4dd02f1-937e-4915-92ac-2619994eac55' and version_number=4), array['b7f75682-cd18-4cfb-9f51-872b18ddc744'::uuid], 'replacement explicitly targets the approved temporary version');
select is((availability_capacity_for_span('e2afe393-c45d-4537-b984-114300cf568e','f4dd02f1-937e-4915-92ac-2619994eac55',tstzrange('2035-01-15 08:00+00','2035-01-16 08:00+00','[)'))).available, tstzmultirange(tstzrange('2035-01-15 20:00+00','2035-01-15 23:00+00','[)')), 'left retained Monday keeps original temporary noon-3pm hours');
select is((availability_capacity_for_span('e2afe393-c45d-4537-b984-114300cf568e','f4dd02f1-937e-4915-92ac-2619994eac55',tstzrange('2035-01-22 08:00+00','2035-01-23 08:00+00','[)'))).available, tstzmultirange(tstzrange('2035-01-22 21:00+00','2035-01-22 22:00+00','[)')), 'selected Monday uses approved 1pm-2pm replacement');
select is((availability_capacity_for_span('e2afe393-c45d-4537-b984-114300cf568e','f4dd02f1-937e-4915-92ac-2619994eac55',tstzrange('2035-01-29 08:00+00','2035-01-30 08:00+00','[)'))).available, tstzmultirange(tstzrange('2035-01-29 19:00+00','2035-01-30 00:00+00','[)')), 'after temporary expiry weekly 11am-4pm hours resume');
select is((availability_capacity_for_span('e2afe393-c45d-4537-b984-114300cf568e','f4dd02f1-937e-4915-92ac-2619994eac55',tstzrange('2035-01-25 08:00+00','2035-01-26 08:00+00','[)'))).sources->0->>'revision', '3', 'right retained dates still use original temporary source');
select is((select count(*)::int from availability_requests where employee_id='f4dd02f1-937e-4915-92ac-2619994eac55' and status in ('pending_review','awaiting_employee','changes_requested')), 0, 'no outstanding QA availability requests remain');
select * from finish();
rollback;
