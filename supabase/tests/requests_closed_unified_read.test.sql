begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EKRAN-02 A4: Requests -> Closed reads one list.
--   K-S9, K-S10  closed time off and closed shift changes (swap, cover, open
--                shift) in one order, newest decision first, with a total and
--                pages of 25 / 50 / 100, filtered by type, location and search.
--   R2-12        the order runs on across pages.
--   S1           a closed request is read by who could decide it and its owner.
--   K-S2         a manager missing a document reads it.
--   BL-839       in Requests an open shift change is not cut by the date range.

select tests.world('rc');
select tests.person('rc', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('rc', 'hande', 'manager', array['K'], array['cook']);
select tests.person('rc', 'nur', 'manager', array['K'], array['cook']);
select tests.person('rc', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('rc', 'ali', 'employee', array['K'], array['cook']);
select tests.person('rc', 'veli', 'employee', array['K'], array['cook']);
select tests.person('rc', 'deniz', 'employee', array['B'], array['cook']);
-- Tolga leads Kadikoy's time off and nothing of its shift changes.
select tests.role('rc', 'time off lead', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('rc') and r.system_key = 'manager'
    and rp.permission_key not like 'schedule.shift_change_requests.%'
));
select tests.person('rc', 'tolga', 'time off lead', array['K'], array['cook']);
select is(app_private.authz_reason(tests.user('rc:tolga'), tests.id('rc'), 'exchange.read', array[tests.id('rc:K')]) is null,
  false, 'Tolga does not read Kadikoy''s shift changes');

create function pg_temp.closed(who text, kinds text[] default null, loc uuid default null, q text default '',
  page integer default 1, size integer default 50) returns jsonb language sql as $$
  select public.get_schedule_requests_closed_service(tests.user('rc:' || who), tests.id('rc'), kinds, loc, q, page, size)
$$;
create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare h text;
begin
  execute q;
  return 'allowed';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return sqlstate || coalesce(' ' || nullif(h, ''), '');
end $$;
create function pg_temp.snap(person text, loc text, d date) returns jsonb language sql as $$
  select jsonb_build_object('id', gen_random_uuid(), 'source_id', gen_random_uuid(), 'date', d, 'scheduled_date', d,
    'start_time', '09:00:00', 'end_time', '15:00:00', 'starts_at', d + time '06:00', 'ends_at', d + time '12:00',
    'timezone', 'Europe/Istanbul', 'time_timezone', 'Europe/Istanbul', 'time_basis', 'explicit',
    'job_id', tests.id('rc:job:cook'), 'job_name', 'Cook', 'unpaid_break_minutes', 0,
    'location_id', tests.id('rc:' || loc), 'location_name', case loc when 'K' then 'Kadikoy' else 'Besiktas' end,
    'employee_id', case when person is null then null else tests.id('rc:' || person) end,
    'employee_name', case when person is null then null else initcap(person) || ' Person' end)
$$;

-- 60 closed time off and 60 closed shift changes, decided two minutes apart,
-- alternating, newest first; the first two were decided at the same moment.
create temporary table rc_seed (n integer, kind text, id uuid, closed_at timestamptz);
insert into rc_seed
select n, 'time_off', gen_random_uuid(), date_trunc('minute', now()) - make_interval(mins => 2 * n) from generate_series(1, 60) n;
insert into rc_seed
select n, case when n <= 20 then 'swap' else 'cover' end, gen_random_uuid(),
  date_trunc('minute', now()) - make_interval(mins => case when n = 1 then 2 else 2 * n + 1 end)
from generate_series(1, 60) n;

-- Time off: 1 Hande's (a peer of Ayse), 2 Deniz's (Besiktas), the rest Ali's and Veli's.
insert into public.schedule_time_off_requests (id, workspace_id, employee_id, request_type, reason, created_by, status, revision, created_at, updated_at)
select s.id, tests.id('rc'), tests.id('rc:' || p.who), 'time_off', 'Closed ' || s.n, tests.user('rc:' || p.who),
  case when s.n = 3 then 'pending' else (array['approved', 'denied', 'revoked'])[1 + s.n % 3] end::public.time_off_request_status,
  2, s.closed_at - interval '1 day', s.closed_at
from rc_seed s cross join lateral (select case s.n when 1 then 'hande' when 2 then 'deniz' else case when s.n % 2 = 0 then 'ali' else 'veli' end end who) p
where s.kind = 'time_off';
insert into public.time_off_required_locations (request_id, workspace_id, location_id)
select s.id, tests.id('rc'), tests.id(case when s.n = 2 then 'rc:B' else 'rc:K' end) from rc_seed s where s.kind = 'time_off';
-- Request 3 is for March 4, 2031.
insert into public.schedule_time_off_segments (workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day, status)
select tests.id('rc'), s.id, date '2031-03-04', '00:00', '23:59', 'UTC', timestamptz '2031-03-04 00:00Z', timestamptz '2031-03-04 23:59Z', false, 'pending'
from rc_seed s where s.kind = 'time_off' and s.n = 3;
-- A period is added to a waiting request only; then it is approved.
update public.schedule_time_off_requests r set status = 'approved' from rc_seed s where s.kind = 'time_off' and s.n = 3 and r.id = s.id;

-- Shift changes: swaps Ali for Veli at Kadikoy (swap 5 is on March 3, 2031);
-- covers 39, 40 and 60 are Deniz's at Besiktas (41-60 are released shifts:
-- TAKAS-RELEASE, only a release reaches the pool).
insert into public.shift_exchange_cases (id, workspace_id, kind, audience, status, offered_source_id, requested_source_id, owner_id,
  offered_snapshot, requested_snapshot, consent_fingerprint, revision, expires_at, created_by, created_at, updated_at)
select s.id, tests.id('rc'), s.kind, 'eligible_pool', (array['completed', 'cancelled', 'expired', 'invalidated'])[1 + s.n % 4],
  (o.snap ->> 'source_id')::uuid, (r.snap ->> 'source_id')::uuid, (o.snap ->> 'employee_id')::uuid,
  o.snap, r.snap, md5(s.id::text), 2, s.closed_at, tests.user('rc:owner'), s.closed_at - interval '1 day', s.closed_at
from rc_seed s
cross join lateral (select case when s.n = 5 then date '2031-03-03' else current_date + 1 + s.n % 30 end d) dd
cross join lateral (select pg_temp.snap(case when s.n in (39, 40, 60) then 'deniz' else 'ali' end,
  case when s.n in (39, 40, 60) then 'B' else 'K' end, dd.d) snap) o
cross join lateral (select case when s.kind = 'swap' then pg_temp.snap('veli', 'K', dd.d) end snap) r
where s.kind <> 'time_off';
-- Every seeded swap and cover reached the managers: somebody asked or the teammate
-- accepted before it closed (Mert, 2026-10-11; shift_changes_reach_managers_agreed).
insert into public.shift_exchange_events (workspace_id, case_id, action, created_at)
select tests.id('rc'), s.id, case when s.kind = 'swap' then 'peer_accepted' else 'application_submitted' end,
  s.closed_at - interval '12 hours'
from rc_seed s where s.kind in ('swap', 'cover');

-- The expected order: newest decision first, then kind, then id.
create temporary table rc_expected as
select row_number() over (order by closed_at desc, kind, id) pos, kind, id, closed_at from rc_seed;

-- (a) 120 rows in 50s: three pages make the whole list once, in order -------------
create temporary table rc_pages as
select p.page, (item ->> 'kind') kind, (item ->> 'id')::uuid id, (item ->> 'closed_at')::timestamptz closed_at, ord, r.total
from generate_series(1, 3) p(page)
cross join lateral (select pg_temp.closed('owner', page => p.page) j) c
cross join lateral (select (c.j ->> 'total')::integer total) r
cross join lateral jsonb_array_elements(c.j -> 'rows') with ordinality x(item, ord);

select is((select array_agg(distinct total) from rc_pages), array[120], 'the owner''s closed list counts 120');
select is((select array_agg(count order by page) from (select page, count(*)::integer from rc_pages group by page) x),
  array[50, 50, 20], 'in pages of 50, 50 and 20');
select is((select count(distinct id)::integer from rc_pages), 120, 'every request once');
select is(array(select id from rc_pages order by page, ord), array(select id from rc_expected order by pos),
  'newest decision first, the same order across pages, two decided at one moment kept apart');
select is((select kind from rc_pages where page = 1 and ord = 1), 'swap', 'the moment''s tie goes by kind');
select is((select closed_at from rc_pages where id = (select id from rc_seed where kind = 'time_off' and n = 1)),
  (select closed_at from rc_seed where kind = 'time_off' and n = 1), 'a row says when it was decided');
select is(jsonb_array_length(pg_temp.closed('owner', page => 4) -> 'rows'), 0, 'past the last page: no rows');
select is((pg_temp.closed('owner', page => 4) ->> 'total')::integer, 120, 'and the same total');
select is((pg_temp.closed('owner', size => 25) ->> 'page_size')::integer, 25, 'a page of 25');
select is(jsonb_array_length(pg_temp.closed('owner', size => 100) -> 'rows'), 100, 'a page of 100');
select is(pg_temp.refusal($$select pg_temp.closed('owner', size => 30)$$), '22023', 'no page of 30');
select is(pg_temp.refusal($$select pg_temp.closed('owner', page => 0)$$), '22023', 'no page 0');
select is(pg_temp.refusal($$select pg_temp.closed('ali')$$), '42501 authz.missing_permission', 'an employee reads no closed list');

-- A row carries the same object the two lists draw today.
select is(
  (select item -> 'time_off' from jsonb_array_elements(pg_temp.closed('owner', array['time_off']) -> 'rows') item
   where item ->> 'id' = (select id::text from rc_seed where kind = 'time_off' and n = 4)),
  (select item from jsonb_array_elements(public.get_schedule_requests_service(tests.user('rc:owner'), tests.id('rc'), 'closed', null, '', null, 100)
     -> 'time_off_requests') item where item ->> 'id' = (select id::text from rc_seed where kind = 'time_off' and n = 4)),
  'a time-off row is the Time off list''s object');
select is(
  (select item -> 'exchange' from jsonb_array_elements(pg_temp.closed('owner', array['cover']) -> 'rows') item
   where item ->> 'id' = (select id::text from rc_seed where kind = 'cover' and n = 22)),
  (select item from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rc:owner'), tests.id('rc'), true,
     current_date, current_date + 42) -> 'cases') item where item ->> 'id' = (select id::text from rc_seed where kind = 'cover' and n = 22)),
  'a shift-change row is the shift changes list''s object');
select is((select item -> 'exchange' from jsonb_array_elements(pg_temp.closed('owner', array['time_off']) -> 'rows') item limit 1),
  'null'::jsonb, 'a time-off row has no shift change');

-- (b) type filter and count agree ------------------------------------------------
select is((pg_temp.closed('owner', array['time_off']) ->> 'total')::integer, 60, 'Time off: 60');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.closed('owner', array['time_off'], size => 100) -> 'rows') i
  where i ->> 'kind' <> 'time_off'), 0, 'and only time off');
select is((pg_temp.closed('owner', array['swap']) ->> 'total')::integer, 20, 'Swap: 20');
select is((pg_temp.closed('owner', array['cover']) ->> 'total')::integer, 40, 'Cover: 40');
select is((pg_temp.closed('owner', array['nonsense']) ->> 'total')::integer, 0, 'an unknown type reads nothing');

-- Location and search -------------------------------------------------------------
select is((pg_temp.closed('owner', loc => tests.id('rc:B')) ->> 'total')::integer, 4,
  'Besiktas: Deniz''s time off and her three covers');
select is((pg_temp.closed('owner', q => 'deniz') ->> 'total')::integer, 4, 'a name finds Deniz''s four requests');
select is((pg_temp.closed('owner', q => 'Mar 3, 2031') ->> 'total')::integer, 1, 'a date as the list writes it finds the swap');
select is((pg_temp.closed('owner', q => '2031-03-04') ->> 'total')::integer, 1, 'a date finds the time off');
select is(pg_temp.refusal(format('select pg_temp.closed(%L, loc => %L)', 'ayse', tests.id('rc:B'))), '42501 authz.out_of_scope',
  'Ayse cannot filter by a location she does not manage');

-- (c) a peer manager does not read what she cannot decide; its owner does --------
select is((select count(*)::integer from jsonb_array_elements(pg_temp.closed('ayse', array['time_off'], size => 100) -> 'rows') i
  where i ->> 'id' = (select id::text from rc_seed where kind = 'time_off' and n = 1)), 1,
  'Ayse reads her peer Hande''s closed time off: she decides it (KARARLAR S-164, S-169)');
select is((pg_temp.closed('ayse', array['time_off']) ->> 'total')::integer, 59, 'Ayse reads the 59 of Kadikoy''s people');
-- Its owner reads it on Employee hub, not in Requests (time_off_seen_by_who_decides).
select is((select count(*)::integer from jsonb_array_elements(pg_temp.closed('hande', array['time_off'], size => 100) -> 'rows') i
  where i ->> 'id' = (select id::text from rc_seed where kind = 'time_off' and n = 1)), 0, 'nor does Hande in Requests');
select is((select count(*)::integer from rc_pages where id = (select id from rc_seed where kind = 'time_off' and n = 1)), 1,
  'the owner, who decides it, reads it');
select is((pg_temp.closed('ayse', array['swap', 'cover']) ->> 'total')::integer, 57,
  'Ayse reads Kadikoy''s 57 shift changes, not Besiktas''s three');

-- (d) no exchange.read: no shift-change row and no count of them ------------------
select is((pg_temp.closed('tolga', array['swap', 'cover']) ->> 'total')::integer, 0, 'Tolga: no shift changes');
select is((pg_temp.closed('tolga') ->> 'total')::integer, 59, 'Tolga''s whole list is the time off he reads');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.closed('tolga', size => 100) -> 'rows') i
  where i ->> 'kind' <> 'time_off'), 0, 'and every row is time off');

-- A manager who owns or applied to a shift change elsewhere follows it in the employee
-- view, not in Requests: Requests holds what its reader decides (ROL-CIFT design §4.6).
update public.shift_exchange_cases set owner_id = tests.id('rc:mehmet'), private_note = 'Owner note'
where id = (select id from rc_seed where kind = 'cover' and n = 24);
update public.shift_exchange_cases set private_note = 'Owner note' where id = (select id from rc_seed where kind = 'cover' and n = 21);
insert into public.shift_exchange_applications (workspace_id, case_id, employee_id, status, consent_fingerprint, reason)
select tests.id('rc'), s.id, tests.id('rc:' || who), 'closed_case_cancelled', 'x', initcap(who) || ' can cover'
from rc_seed s cross join unnest(array['mehmet', 'veli']) who where s.kind = 'cover' and s.n = 21;
create function pg_temp.case_of(who text, n integer) returns jsonb language sql as $$
  select i -> 'exchange' from jsonb_array_elements(pg_temp.closed(who, array['cover'], size => 100) -> 'rows') i
  where i ->> 'id' = (select id::text from rc_seed where kind = 'cover' and rc_seed.n = case_of.n)
$$;
select is((pg_temp.closed('mehmet', array['swap', 'cover']) ->> 'total')::integer, 3,
  'Mehmet reads Besiktas''s three');
select is(pg_temp.case_of('mehmet', 24), null, 'not the Kadikoy cover he owns');
select is(pg_temp.case_of('mehmet', 21), null, 'nor the one he applied to');
select is((pg_temp.closed('mehmet', q => 'veli') ->> 'total')::integer, 0, 'a search does not find an application he cannot see');
select is((pg_temp.closed('owner', array['cover'], q => 'mehmet') ->> 'total')::integer, 1, 'the owner finds the cover by its applicant');

-- (e) K-S2: a manager missing a document reads the closed list --------------------
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('rc:owner'), tests.id('rc'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('rc:owner'), tests.id('rc'), id);
select public.set_document_publication_service(tests.user('rc:owner'), tests.id('rc'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: nothing in the product moves the clock; the deadline is set by hand.
update public.employee_onboarding_requirements
set lifecycle_exempt = false, deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('rc:nur');
select ok(app_private.document_actor_blocked(tests.user('rc:nur'), tests.id('rc')), 'Nur, a Kadikoy manager, misses the document');
select is((pg_temp.closed('nur') ->> 'total')::integer, 59 + 57, 'Nur reads Kadikoy''s closed time off and shift changes');

-- BL-839: an open shift change nine weeks out is in the list ---------------------
select tests.publish_week('rc', 9, '[
  {"label": "ali-far", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "10:00", "end": "16:00"}
]');
select tests.remember('rc:case:ali-far', (public.shift_exchanges_command_service(tests.user('rc:ali'), tests.id('rc'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('rc:shift:ali-far')), gen_random_uuid()) ->> 'case_id')::uuid);
-- Veli asks for it: a cover reaches the manager once somebody asked (Mert, 2026-10-11).
-- The Food handler card from (e) would hold him back from a pickup; he is exempt here.
update public.employee_onboarding_requirements set lifecycle_exempt = true
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('rc:veli');
select public.shift_exchanges_command_service(tests.user('rc:veli'), tests.id('rc'),
  jsonb_build_object('action', 'apply', 'shift_id', tests.id('rc:shift:ali-far'), 'case_id', tests.id('rc:case:ali-far')), gen_random_uuid());
select ok(exists (select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rc:ayse'), tests.id('rc'), true) -> 'cases') c
  where c ->> 'id' = tests.id('rc:case:ali-far')::text and c ->> 'status' = 'open'),
  'Ayse''s list holds Ali''s open cover nine weeks out');
-- Ali's Shift Hub keeps following the dates it shows (shift_exchange_range_read).
select ok(not exists (select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rc:ali'), tests.id('rc'), false) -> 'cases') c
  where c ->> 'id' = tests.id('rc:case:ali-far')::text), 'Ali''s own list, showing these six weeks, does not');
select is((pg_temp.closed('owner') ->> 'total')::integer, 120, 'an open request is not closed');

select * from finish();
rollback;
