begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ROL-CIFT slice 4.1 (design §4.7, §4.8; KARARLAR S-165, S-167, S-168). Changing somebody's access
-- closes what giving the employee access up leaves open, the way a termination does, and shows it
-- first; it is done one rank above the person's highest access; the owner alone gives themselves the
-- employee access; a management access holds a Management job.

select tests.world('ca');
select tests.person('ca', 'can', 'manager', array['K'], array['cook']);
select tests.person('ca', 'dora', 'manager', array['K'], array['cook']);
select tests.person('ca', 'ada', 'admin', array['K'], array['cook']);
select tests.person('ca', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ca', 'ece', 'employee', array['K'], array['cook']);
select tests.person('ca', 'emir', 'employee', array['K'], array['cook']);
select tests.publish_week('ca', 1, '[
  {"label": "dora-1", "person": "dora", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "dora-2", "person": "dora", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "dora-3", "person": "dora", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "ali-4",  "person": "ali",  "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "emir-5", "person": "emir", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"}
]');

create function pg_temp.said(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return concat_ws(' ', code, nullif(reason, ''));
end;
$$;
create function pg_temp.who(person text) returns uuid language sql as $$ select tests.user('ca:' || person) $$;
create function pg_temp.role(key text) returns uuid language sql as $$
  select r.id from public.workspace_roles r where r.workspace_id = tests.id('ca') and r.system_key::text = key
$$;
create function pg_temp.member(person text) returns public.workspace_memberships language sql as $$
  select m.* from public.workspace_memberships m where m.workspace_id = tests.id('ca') and m.user_id = pg_temp.who(person)
$$;
create function pg_temp.preview(actor text, person text, employee_role uuid, management_role uuid) returns jsonb language sql as $$
  select public.preview_employee_access_change_service(pg_temp.who(actor), tests.id('ca'), tests.id('ca:' || person),
    employee_role, management_role)
$$;
create function pg_temp.change(actor text, person text, employee_role uuid, management_role uuid, places text[],
  jobs text[], impact jsonb) returns text language sql as $$
  select format('select public.change_employee_access_service(%L, %L, %L, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
    pg_temp.who(actor), tests.id('ca'), tests.id('ca:' || person), employee_role, management_role,
    array(select tests.id('ca:' || p) from unnest(places) p), array(select tests.id('ca:job:' || j) from unnest(jobs) j), impact)
$$;
create function pg_temp.nothing() returns jsonb language sql as $$
  select '{"shifts_opened": 0, "requests_closed": 0, "applications_closed": 0, "time_off_withdrawn": 0, "availability_deleted": false}'::jsonb
$$;

-- Dora's employee side: 3 shifts ahead, her own cover, her answer on Ali's, a time off waiting, availability.
select public.shift_exchanges_command_service(pg_temp.who('dora'), tests.id('ca'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ca:shift:dora-1')), gen_random_uuid());
select tests.remember('ca:case:dora-1', (select c.id from public.shift_exchange_cases c where c.owner_id = tests.id('ca:dora')));
select tests.settle();
select tests.cover_case('ca', 'ali-4', 'ali', 'dora');
select tests.leave('ca', 'dora', 2);
select tests.availability('ca', 'dora', 1, '18:00', '22:00');

-- drop_employee_side: what the owner is shown is what happens.
select is((select c ->> 'stage' from jsonb_array_elements(public.shift_exchanges_read_service(pg_temp.who('can'), tests.id('ca'),
  true, tests.week(1), tests.week(1) + 6) -> 'cases') c where (c ->> 'id')::uuid = tests.id('ca:case:ali-4')),
  'ready_for_manager', 'Can has Dora''s answer on Ali''s cover to decide');
select is(pg_temp.preview('owner', 'dora', null, pg_temp.role('manager')),
  '{"shifts_opened": 3, "requests_closed": 1, "applications_closed": 1, "time_off_withdrawn": 1, "availability_deleted": true}'::jsonb,
  'giving the employee access up opens 3 shifts and closes a request, an answer and a time off');
select is(pg_temp.preview('owner', 'dora', pg_temp.role('employee'), pg_temp.role('manager')), pg_temp.nothing(),
  'keeping it changes nothing on the employee side');
select ok((pg_temp.member('dora')).employee_role_id is not null, 'Dora still has the employee access');

-- stale_impact_conflicts: a shift published after the preview makes the numbers shown stale.
create temporary table shown as select pg_temp.preview('owner', 'dora', null, pg_temp.role('manager')) as impact;
select tests.publish_week('ca', 3, '[
  {"label": "dora-6", "person": "dora", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"}
]');
select is(pg_temp.said(pg_temp.change('owner', 'dora', null, pg_temp.role('manager'), array['K'], array['general manager'],
  (select impact from shown))), 'PT409 access.impact_changed', 'a shift added since the preview refuses the change');
select is(pg_temp.said(pg_temp.change('owner', 'dora', null, pg_temp.role('manager'), array['K'], array['general manager'],
  null)), 'PT409 access.impact_changed', 'so do numbers the reader was never shown');
select is((pg_temp.preview('owner', 'dora', null, pg_temp.role('manager')) ->> 'shifts_opened')::integer, 4,
  'the new preview counts the fourth shift');

select lives_ok(pg_temp.change('owner', 'dora', null, pg_temp.role('manager'), array['K'], array['general manager'],
  pg_temp.preview('owner', 'dora', null, pg_temp.role('manager'))), 'the owner gives Dora''s employee access up');
select is((pg_temp.member('dora')).employee_role_id, null, 'Dora has no employee access');
select is((pg_temp.member('dora')).role_id, pg_temp.role('manager'), 'she still manages');
select is((select count(*)::integer from public.schedule_published_shifts s where s.employee_id = tests.id('ca:dora')
  and s.id in (tests.id('ca:shift:dora-1'), tests.id('ca:shift:dora-2'), tests.id('ca:shift:dora-3'))), 0,
  'her three shifts are open');
select is((select status from public.shift_exchange_cases where id = tests.id('ca:case:dora-1')), 'cancelled',
  'her cover is closed');
select is((select status from public.shift_exchange_applications where id = tests.id('ca:application:ali-4')),
  'closed_case_cancelled', 'her answer on Ali''s cover is closed');
select is((select status from public.shift_exchange_cases where id = tests.id('ca:case:ali-4')), 'open',
  'Ali''s cover stays open for others');
select isnt(coalesce((select c ->> 'stage' from jsonb_array_elements(public.shift_exchanges_read_service(pg_temp.who('can'), tests.id('ca'),
  true, tests.week(1), tests.week(1) + 6) -> 'cases') c where (c ->> 'id')::uuid = tests.id('ca:case:ali-4')), 'not listed'),
  'ready_for_manager', 'Can no longer has Dora''s answer to decide');
select is((select status from public.schedule_time_off_requests where id = tests.id('ca:dora:time_off')), 'revoked',
  'her time off is withdrawn');
select ok(not exists (select 1 from public.employee_weekly_preferences p where p.employee_id = tests.id('ca:dora')),
  'her availability is gone');
select is((select array_agg(l.location_id) from public.membership_managed_locations l where l.membership_id = (pg_temp.member('dora')).id),
  array[tests.id('ca:K')], 'she manages Kadikoy');
select is((select array_agg(j.job_id) from public.membership_management_jobs j where j.membership_id = (pg_temp.member('dora')).id),
  array[tests.id('ca:job:general manager')], 'as a General Manager');
select is((select n.title from public.person_notifications n where n.type_key = 'people.role_changed'
  and n.user_id = pg_temp.who('dora') order by n.created_at desc limit 1), 'Your access changed', 'and she is told');

-- rank_above_management: Can is a manager like Can; the admin is above him.
select is(pg_temp.said(pg_temp.change('can', 'can', null, pg_temp.role('manager'), array['K'], array['general manager'],
  pg_temp.nothing())), '42501 authz.owner_only', 'Can may not change his own access: only the owner does, on theirs');
select is(pg_temp.said(format('select public.preview_employee_access_change_service(%L, %L, %L, null, %L)',
  pg_temp.who('can'), tests.id('ca'), tests.id('ca:ada'), pg_temp.role('admin'))), '42501 authz.rank',
  'nor Ada''s, an admin');
select is(pg_temp.said(pg_temp.change('ada', 'can', null, pg_temp.role('manager'), array['K'], array['general manager'],
  pg_temp.preview('ada', 'can', null, pg_temp.role('manager')))), 'ok', 'Ada, the admin, gives Can''s employee access up');
select is(pg_temp.said(pg_temp.change('can', 'ali', pg_temp.role('employee'), pg_temp.role('manager'), array['K'],
  array['general manager'], pg_temp.nothing())), '42501 authz.rank', 'a manager makes nobody a manager');
select is(pg_temp.said(format('select public.preview_employee_access_change_service(%L, %L, %L, %L, null)',
  pg_temp.who('can'), tests.id('ca'), gen_random_uuid(), pg_temp.role('employee'))), '42501 authz.out_of_scope',
  'somebody unknown gets the answer somebody out of reach gets');

-- owner_self_grants_employee: nobody is above the owner; an admin waits for the owner.
select tests.no_employee_slot('ca', 'owner');
select is(pg_temp.said(pg_temp.change('owner', 'owner', pg_temp.role('employee'), pg_temp.role('owner'), '{}', '{}',
  pg_temp.nothing())), 'ok', 'the owner gives themselves the employee access');
select is((pg_temp.member('owner')).employee_role_id, pg_temp.role('employee'), 'and has it');
select is(pg_temp.said(pg_temp.change('owner', 'owner', pg_temp.role('employee'), pg_temp.role('admin'), '{}',
  array['general manager'], pg_temp.nothing())), '42501 authz.rank', 'the owner stays the owner on their own record');
select tests.no_employee_slot('ca', 'ada');
select is(pg_temp.said(pg_temp.change('ada', 'ada', pg_temp.role('employee'), pg_temp.role('admin'), '{}',
  array['general manager'], pg_temp.nothing())), '42501 authz.owner_only', 'Ada may not give herself the employee access');

-- The owner access comes by a transfer alone; only the owner makes an admin.
select is(pg_temp.said(pg_temp.change('owner', 'can', null, pg_temp.role('owner'), '{}', '{}', pg_temp.nothing())),
  '42501 authz.rank', 'nobody is made the owner by an access change');
select is(pg_temp.said(pg_temp.change('ada', 'ece', pg_temp.role('employee'), pg_temp.role('admin'), '{}',
  array['general manager'], pg_temp.nothing())), '42501 authz.owner_only', 'Ada makes nobody an admin');

-- management_job_required (S-168): a management access is opened with a Management job.
select is(pg_temp.said(pg_temp.change('ada', 'ece', pg_temp.role('employee'), pg_temp.role('manager'), array['K'], '{}',
  pg_temp.nothing())), '22023 access.management_job_required', 'Ece becomes no manager without a Management job');
select is(pg_temp.said(pg_temp.change('ada', 'ece', pg_temp.role('employee'), pg_temp.role('manager'), array['K'], array['cook'],
  pg_temp.nothing())), '22023 access.management_job_invalid', 'Cook is no Management job');
select is(pg_temp.said(pg_temp.change('ada', 'ece', pg_temp.role('employee'), pg_temp.role('manager'), '{}',
  array['general manager'], pg_temp.nothing())), '22023 access.manages_required', 'nor without a location to manage');
select is(pg_temp.said(pg_temp.change('ada', 'ece', pg_temp.role('employee'), pg_temp.role('manager'), array['K'],
  array['general manager'], pg_temp.nothing())), 'ok', 'with General Manager and Kadikoy she does');
select ok(exists (select 1 from public.membership_management_jobs j where j.membership_id = (pg_temp.member('ece')).id
  and j.job_id = tests.id('ca:job:general manager')), 'and holds General Manager');

-- A cover Emir asks of Ece alone closes with her employee access, and the Manager note about her goes.
select tests.publish_week('ca', 5, '[
  {"label": "emir-7", "person": "emir", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
select public.shift_exchanges_command_service(pg_temp.who('emir'), tests.id('ca'), jsonb_build_object('action', 'create',
  'kind', 'cover', 'shift_id', tests.id('ca:shift:emir-7'), 'employee_id', tests.id('ca:ece')), gen_random_uuid());
select tests.settle();
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, revision, updated_by)
values (tests.id('ca'), tests.id('ca:ece'), public.empty_weekly_preference(), true, 1, pg_temp.who('can'));
select is(pg_temp.said(pg_temp.change('owner', 'ece', null, pg_temp.role('manager'), array['K'], array['general manager'],
  pg_temp.preview('owner', 'ece', null, pg_temp.role('manager')))), 'ok', 'the owner gives Ece''s employee access up');
select is((select c.status from public.shift_exchange_cases c where c.owner_id = tests.id('ca:emir') and c.audience = 'direct'),
  'cancelled', 'the cover asked of her alone is closed');
select ok(not exists (select 1 from public.manager_weekly_reminders m where m.employee_id = tests.id('ca:ece')),
  'the Manager note about her is gone');
select is(pg_temp.said(pg_temp.change('ada', 'ece', null, null, '{}', '{}', pg_temp.nothing())),
  '22023 access.role_required', 'nobody is left with no access');

-- terminate_closes_applications: a termination closes what the person answered.
select tests.cover_case('ca', 'emir-5', 'emir', 'ali');
select public.terminate_employee_service(pg_temp.who('owner'), tests.id('ca'), tests.id('ca:ali'), localtimestamp,
  'Europe/Istanbul', 'test world', gen_random_uuid());
select is((select status from public.shift_exchange_applications where id = tests.id('ca:application:emir-5')),
  'closed_case_cancelled', 'Ali''s answer on Emir''s cover is closed when he is let go');

-- Remove access keeps the record and its shifts; what the person asked for closes (design §4.8).
select tests.person('ca', 'eda', 'employee', array['K'], array['cook']);
select tests.publish_week('ca', 4, '[
  {"label": "eda-1", "person": "eda", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"}
]');
select public.shift_exchanges_command_service(pg_temp.who('eda'), tests.id('ca'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ca:shift:eda-1')), gen_random_uuid());
select tests.settle();
select public.remove_employee_access_service(pg_temp.who('owner'), tests.id('ca'), tests.id('ca:eda'));
select is((select c.status from public.shift_exchange_cases c where c.owner_id = tests.id('ca:eda')), 'cancelled',
  'Eda''s cover closes when her access is removed');
select is((select s.employee_id from public.schedule_published_shifts s where s.id = tests.id('ca:shift:eda-1')),
  tests.id('ca:eda'), 'and she keeps the shift, as Remove access says');

select * from finish();
rollback;
