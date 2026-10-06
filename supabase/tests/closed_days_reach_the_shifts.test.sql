begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.7 C: a "Closed day" and the shifts already on it. Saving one lists the
-- published shifts it lands on; each drops to an open shift unless the manager
-- keeps it (K13); whoever lost a shift hears it once, with the closing (K14);
-- taking the closed day away does not hand the shifts back, and says how many
-- stay open (K15); a draft's shifts on it drop quietly (K16). Writing onto a
-- closed day later is blocked, confirmed each time, or confirmed once per
-- editing session (K17). A published shift whose person marked themselves
-- unavailable after publishing says so (K18).
-- Rules: KARARLAR "Duyurular ve önemli tarihler" K13-K18.

-- 1. The world ------------------------------------------------------------------------
-- Kadikoy (K) and Besiktas (B). Week 0 is published; week 1 is only a draft.

select tests.world('c');
select tests.person('c', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('c', 'veli', 'manager', array['B'], array['cook']);
select tests.person('c', 'ali', 'employee', array['K'], array['cook']);
select tests.person('c', 'can', 'employee', array['K'], array['cook']);
select tests.person('c', 'emre', 'employee', array['K'], array['cook']);
select tests.person('c', 'deniz', 'employee', array['B'], array['server']);
-- Dina keeps Kadikoy's important dates and nothing of its Schedule.
select tests.role('c', 'dates keeper', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('c') and r.system_key = 'manager' and rp.permission_key not like 'schedule.%'));
select tests.person('c', 'dina', 'dates keeper', array['K'], array['cook']);
select tests.publish_week('c', 0, $$[
  {"label": "ali_mon", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"},
  {"label": "can_mon", "person": "can", "loc": "K", "job": "cook", "day": 0, "start": "07:00", "end": "11:00"},
  {"label": "open_mon", "loc": "K", "job": "cook", "day": 0, "start": "12:00", "end": "16:00"},
  {"label": "deniz_mon", "person": "deniz", "loc": "B", "job": "server", "day": 0, "start": "09:00", "end": "17:00"},
  {"label": "ali_tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}
]$$::jsonb);

create function pg_temp.try(statement text) returns text language plpgsql as $$
declare state text; hint text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end;
$$;

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('c:' || person)
$$;

create function pg_temp.locs(keys text[]) returns uuid[] language sql as $$
  select coalesce(array(select tests.id('c:' || k) from unnest(keys) k), '{}')
$$;

-- Who holds a published shift now (null: it is open).
create function pg_temp.holder(shift_label text) returns uuid language sql as $$
  select p.employee_id from public.schedule_published_shifts p
  join public.schedule_location_publications publication on publication.id = p.publication_id and publication.status = 'current'
  where coalesce(p.source_shift_id, p.id) = (
    select coalesce(s.source_shift_id, s.id) from public.schedule_published_shifts s where s.id = tests.id('c:shift:' || shift_label))
$$;

create function pg_temp.preview(person text, keys text[], day date, id uuid default null, kind text default 'closed_day')
returns jsonb language sql as $$
  select public.preview_important_date_closure_service(pg_temp.u(person), tests.id('c'), id, kind, day, day, 'none', pg_temp.locs(keys))
$$;

create function pg_temp.close_day(person text, keys text[], title text, day date, keep uuid[] default '{}',
  fingerprint text default null, id uuid default null) returns jsonb language sql as $$
  select public.save_important_date_service(pg_temp.u(person), tests.id('c'), id, title, 'closed_day', day, day,
    'none', '', true, pg_temp.locs(keys), (select d.revision from public.important_dates d where d.id = close_day.id),
    keep, fingerprint)
$$;

create function pg_temp.listed_ids(preview jsonb) returns text[] language sql as $$
  select coalesce(array_agg(s ->> 'id' order by s ->> 'id'), '{}') from jsonb_array_elements(preview -> 'shifts') s
$$;

create function pg_temp.ids(labels text[]) returns text[] language sql as $$
  select coalesce(array_agg(tests.id('c:shift:' || l)::text order by tests.id('c:shift:' || l)::text), '{}') from unnest(labels) l
$$;

-- The titles of the notices about this record each person was sent.
create function pg_temp.notices(person text, subject uuid) returns text[] language sql as $$
  select coalesce(array_agg(o.payload ->> 'title' order by o.created_at), '{}')
  from public.notification_outbox o
  where o.subject_id = subject::text and o.payload -> 'recipient_user_ids' ? pg_temp.u(person)::text
$$;

-- 2. K13: the shifts a closed day lands on --------------------------------------------------

select is(pg_temp.listed_ids(pg_temp.preview('ayse', array['K'], tests.week(0))), pg_temp.ids(array['ali_mon', 'can_mon']),
  'K13: closing Kadikoy on Monday lists Ali''s and Can''s published shifts there, not the open one, nor Besiktas''s');
select ok(pg_temp.preview('ayse', array['K'], tests.week(0)) -> 'shifts' -> 0 ? 'employee_name',
  'K13: each listed shift says whose it is');
select is(pg_temp.listed_ids(pg_temp.preview('ayse', array['K'], tests.week(0), kind => 'event')), '{}'::text[],
  'K13: a date that does not close anything lists nothing');
select is(pg_temp.try($$select pg_temp.preview('veli', array['K'], tests.week(0))$$), '42501 authz.out_of_scope',
  'K13: Veli, Besiktas''s manager, cannot look at Kadikoy''s shifts this way');

select is(pg_temp.listed_ids(pg_temp.preview('dina', array['K'], tests.week(0))), '{}'::text[],
  'D1: Dina, who may not read Kadikoy''s Schedule, is not shown whose shifts they are');
select is((pg_temp.preview('dina', array['K'], tests.week(0)) ->> 'hidden_shift_count')::integer, 2,
  'D1: she is told two shifts she cannot see are on that day');
select is(pg_temp.try($$select pg_temp.close_day('dina', array['K'], 'Dina closes', tests.week(0),
  fingerprint => pg_temp.preview('dina', array['K'], tests.week(0)) ->> 'fingerprint')$$),
  '42501 authz.missing_permission', 'D4: she cannot drop them: closing over shifts needs schedule.edit there');
select is(pg_temp.holder('ali_mon'), tests.id('c:ali'), 'D4: Ali keeps his shift');

select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0))$$),
  '40001 important_date.closure_changed', 'K13: closing it without having seen the shifts is refused');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0), fingerprint => 'stale')$$),
  '40001 important_date.closure_changed', 'K13: so is closing it on a list that changed since');

select tests.remember('c:date:monday', (pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0),
  keep => array[tests.id('c:shift:can_mon')],
  fingerprint => pg_temp.preview('ayse', array['K'], tests.week(0)) ->> 'fingerprint') ->> 'important_date_id')::uuid);
select is(pg_temp.holder('ali_mon'), null, 'K13: Ali''s Monday shift dropped to an open shift');
select is(pg_temp.holder('can_mon'), tests.id('c:can'), 'K13: Can''s, kept for prep, is still his');
select is(pg_temp.holder('ali_tue'), tests.id('c:ali'), 'K13: Ali''s Tuesday shift is untouched');
select is(pg_temp.holder('deniz_mon'), tests.id('c:deniz'), 'K13: Besiktas''s Monday is untouched');
select is((select count(*)::integer from public.important_date_shift_releases r where r.important_date_id = tests.id('c:date:monday')), 1,
  'K13: the closed day keeps which shift it opened');

-- 3. K14: one notice for whoever lost a shift --------------------------------------------------

select is(cardinality(pg_temp.notices('ali', tests.id('c:date:monday'))), 1, 'K14: Ali hears it once');
select ok((pg_temp.notices('ali', tests.id('c:date:monday')))[1] like '%your shift was removed%',
  'K14: the one notice says Kadikoy is closed and his shift was removed');
select is(pg_temp.notices('can', tests.id('c:date:monday')), array['Inventory closed'],
  'K14: Can, whose shift stays, hears only that Kadikoy is closed');
select is(pg_temp.notices('ayse', tests.id('c:date:monday')), '{}'::text[], 'K14: Ayse, who closed it, hears nothing (KK-89)');
create function pg_temp.deliver() returns void language plpgsql as $$
declare queued uuid;
begin
  for queued in select o.id from public.notification_outbox o
                where o.workspace_id = tests.id('c') and o.status in ('pending', 'retry') loop
    update public.notification_outbox
    set status = 'leased', lease_owner = 'closed-days', lease_expires_at = now() + interval '1 minute'
    where notification_outbox.id = queued;
    perform public.process_notification_outbox_service('closed-days', queued);
  end loop;
end;
$$;
create function pg_temp.inbox(person text, subject uuid) returns text[] language sql as $$
  select coalesce(array_agg(item.title order by item.title), '{}')
  from public.notification_inbox_items item
  join public.notification_recipients recipient on recipient.id = item.recipient_projection_id
  join public.notification_outbox outbox on outbox.event_id = recipient.event_id and outbox.workspace_id = recipient.workspace_id
  where outbox.subject_id = subject::text and recipient.recipient_user_id = pg_temp.u(person) and item.visibility_state = 'visible'
$$;
select pg_temp.deliver();
select is(cardinality(pg_temp.inbox('ali', tests.id('c:date:monday'))), 1, 'K14: one notice lands in Ali''s inbox');
select ok((pg_temp.inbox('ali', tests.id('c:date:monday')))[1] like 'Kadikoy is closed on % — your shift was removed',
  'K14: it reads "Kadikoy is closed on <day> — your shift was removed"');
select is(pg_temp.inbox('can', tests.id('c:date:monday')), array['Inventory closed'], 'K14: Can''s inbox has the closing');

-- 4. K15: taking the closed day away hands nothing back ---------------------------------------

select is((public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:date:monday'), 'archive')
  ->> 'shifts_stay_open')::integer, 1, 'K15: archiving it tells Ayse one shift stays open');
select is(pg_temp.holder('ali_mon'), null, 'K15: Ali''s Monday shift does not come back by itself');

-- Republishing a closed day lands on the shifts again: they are listed first.
select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:date:monday'), 'restore');
select is(pg_temp.try(format($$select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), %L, 'republish')$$,
  tests.id('c:date:monday'))), '40001 important_date.closure_changed',
  'K13: republishing a closed day over published shifts asks for the list first');
select is(pg_temp.try(format($$select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), %L, 'republish',
  array[%L]::uuid[], %L)$$, tests.id('c:date:monday'), tests.id('c:shift:can_mon'),
  pg_temp.preview('ayse', array['K'], tests.week(0), id => tests.id('c:date:monday')) ->> 'fingerprint')), 'ok',
  'K13: with it, keeping Can''s shift, it is out again');
select is(pg_temp.holder('can_mon'), tests.id('c:can'), 'K13: Can keeps his shift');

-- 5. K16: a draft's shifts drop quietly -------------------------------------------------------

create function pg_temp.draft_week(n integer, shifts jsonb) returns uuid language plpgsql as $$
declare session uuid; shift jsonb;
begin
  session := (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'), tests.week(n), 'blank', null)
    -> 'session' ->> 'id')::uuid;
  for shift in select value from jsonb_array_elements(shifts) loop
    perform tests.add_shift(pg_temp.u('owner'), 'c', session, n, shift);
  end loop;
  return (public.save_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session), 'Next week', null, null) ->> 'id')::uuid;
end;
$$;
select tests.remember('c:draft', pg_temp.draft_week(1, $$[
  {"person": "can", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"},
  {"person": "can", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}
]$$::jsonb));
select tests.settle();
select is(pg_temp.listed_ids(pg_temp.preview('ayse', array['K'], tests.week(1))), '{}'::text[],
  'K16: a closed day on a draft week lists nothing to ask about');
select is((pg_temp.preview('ayse', array['K'], tests.week(1)) ->> 'draft_shift_count')::integer, 1,
  'K16: it counts the draft shift that will drop, for the screen to say so');
create temporary table draft_saved as select pg_temp.close_day('ayse', array['K'], 'Plumbing', tests.week(1)) result;
select tests.remember('c:date:draft', (select (result ->> 'important_date_id')::uuid from draft_saved));
select is((select (result ->> 'draft_shifts_opened')::integer from draft_saved), 1, 'K16: the save says one draft shift dropped');
select is((select count(*)::integer from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft')
           and d.scheduled_date = tests.week(1) and d.employee_id is null), 1, 'K16: the draft''s Monday shift dropped to open');
select is((select count(*)::integer from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft')
           and d.scheduled_date = tests.week(1) + 1 and d.employee_id = tests.id('c:can')), 1, 'K16: its Tuesday did not');
select is(pg_temp.notices('can', tests.id('c:date:draft')), array['Plumbing'],
  'K16: Can hears that Kadikoy is closed, nothing about a draft shift');

-- BL-545 (K16 for unsaved work): Can's Wednesday is in the owner's open edit of
-- week 2, not saved yet. Closing Wednesday drops it to open in the edit too and
-- counts it with the draft shifts; Thursday stays his. Saving the edit later
-- cannot put Can back on the closed day.

select tests.remember('c:open-edit', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(2), 'blank', null) -> 'session' ->> 'id')::uuid);
select tests.add_shift(pg_temp.u('owner'), 'c', tests.id('c:open-edit'), 2,
  '{"person": "can", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}');
select tests.add_shift(pg_temp.u('owner'), 'c', tests.id('c:open-edit'), 2,
  '{"person": "can", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "17:00"}');
create temporary table open_edit_before as
  select revision from public.schedule_edit_sessions where id = tests.id('c:open-edit');
select is((pg_temp.preview('ayse', array['K'], tests.week(2) + 2) ->> 'draft_shift_count')::integer, 1,
  'BL-545: the unsaved Wednesday shift is counted with the draft shifts that will drop');
create temporary table open_edit_saved as select pg_temp.close_day('ayse', array['K'], 'Inspection', tests.week(2) + 2) result;
select is((select (result ->> 'draft_shifts_opened')::integer from open_edit_saved), 1,
  'BL-545: the save says one draft shift dropped');
select is((select employee_id from public.schedule_edit_session_shifts s
           where s.session_id = tests.id('c:open-edit') and s.scheduled_date = tests.week(2) + 2), null::uuid,
  'BL-545: the open edit''s Wednesday shift dropped to open');
select is((select employee_id from public.schedule_edit_session_shifts s
           where s.session_id = tests.id('c:open-edit') and s.scheduled_date = tests.week(2) + 3), tests.id('c:can'),
  'BL-545: its Thursday did not');
select cmp_ok((select revision from public.schedule_edit_sessions where id = tests.id('c:open-edit')), '>',
  (select revision from open_edit_before), 'BL-545: the edit''s revision moves, so the open screen reloads it');

-- BL-545, review round 1: a draft saved from the published week and opened
-- again carries the published shift's id without the copy mark. Ayse keeps
-- Ali on Wednesday: the draft and the open edit keep him too (K13).

select tests.publish_week('c', 4, '[{"label": "ali_wed4", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}]');
select tests.remember('c:edit4', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(4), 'published', null) -> 'session' ->> 'id')::uuid);
select tests.remember('c:draft4', (public.save_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.id('c:edit4'), (select revision from public.schedule_edit_sessions where id = tests.id('c:edit4')),
  'Changes', null, null) ->> 'id')::uuid);
select tests.remember('c:edit4b', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(4), 'draft', tests.id('c:draft4')) -> 'session' ->> 'id')::uuid);
select is((pg_temp.preview('ayse', array['K'], tests.week(4) + 2) ->> 'draft_shift_count')::integer, 0,
  'BL-545: a copy of a published shift is not a draft shift that will drop');
select pg_temp.close_day('ayse', array['K'], 'Gas leak', tests.week(4) + 2,
  keep => array[tests.id('c:shift:ali_wed4')],
  fingerprint => pg_temp.preview('ayse', array['K'], tests.week(4) + 2) ->> 'fingerprint');
select is(pg_temp.holder('ali_wed4'), tests.id('c:ali'), 'BL-545: kept, Ali stays on the published shift');
select is((select employee_id from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft4')),
  tests.id('c:ali'), 'BL-545: and on the saved draft''s copy');
select is((select employee_id from public.schedule_edit_session_shifts s where s.session_id = tests.id('c:edit4b')),
  tests.id('c:ali'), 'BL-545: and in the open edit');

-- O1 (K11): Can's Tuesday shift sits in a draft four years back, and a yearly
-- closed day that began that day is republished.
-- ponytail: the old draft and the yearly date are put in place directly; the
-- rule under test is what the republish reaches.
update public.schedule_draft_shifts set scheduled_date = (tests.week(1) + 1 - interval '4 years')::date
where draft_id = tests.id('c:draft') and scheduled_date = tests.week(1) + 1;
insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note, affects_scheduling,
  location_ids, location_id, created_by, updated_by, status)
values (tests.id('c'), 'Founders closed', 'closed_day', (tests.week(1) + 1 - interval '4 years')::date,
  (tests.week(1) + 1 - interval '4 years')::date, 'annual', '', true, array[tests.id('c:K')], tests.id('c:K'),
  pg_temp.u('ayse'), pg_temp.u('ayse'), 'unpublished');
select tests.remember('c:date:yearly', (select d.id from public.important_dates d
  where d.workspace_id = tests.id('c') and d.title = 'Founders closed'));
create function pg_temp.yearly_preview() returns jsonb language sql as $$
  select public.preview_important_date_closure_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:date:yearly'),
    'closed_day', (tests.week(1) + 1 - interval '4 years')::date, (tests.week(1) + 1 - interval '4 years')::date,
    'annual', array[tests.id('c:K')])
$$;
select is((pg_temp.yearly_preview() ->> 'draft_shift_count')::integer, 0,
  'O1: the yearly closed day counts no draft shift in years already past');
select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:date:yearly'), 'republish',
  '{}', pg_temp.yearly_preview() ->> 'fingerprint');
select is((select d.employee_id from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft')
           and d.scheduled_date = (tests.week(1) + 1 - interval '4 years')::date), tests.id('c:can'),
  'O1: republishing it leaves Can on the draft shift four years back');

-- 6. K17: three steps for writing onto a closed day ------------------------------------------

create function pg_temp.rule(step text) returns void language sql as $$
  update public.workspace_scheduling_settings
  set conflict_rules = jsonb_set(conflict_rules, '{closed_location}', to_jsonb(step))
  where workspace_id = tests.id('c')
$$;
create function pg_temp.assess_on_closed_day() returns jsonb language sql as $$
  select public.assess_weekly_shift_availability(tests.id('c'), null, jsonb_build_object(
    'location_id', tests.id('c:K'), 'job_id', tests.id('c:job:cook'), 'scheduled_date', tests.week(0),
    'time_basis', 'explicit', 'start_time', '18:00', 'end_time', '20:00', 'time_timezone', 'Europe/Istanbul'))
$$;
create function pg_temp.closed_reason(assessment jsonb) returns jsonb language sql as $$
  select r from jsonb_array_elements(assessment -> 'reasons') r where r ->> 'code' = 'closed_location'
$$;

select pg_temp.rule('block');
select is(pg_temp.assess_on_closed_day() ->> 'operation', 'blocked', 'K17 (1): "block" keeps every shift off a closed day');
select pg_temp.rule('confirm');
select is(pg_temp.assess_on_closed_day() ->> 'operation', 'warning_requires_override', 'K17 (2): "confirm" asks for each cell');
select is(pg_temp.closed_reason(pg_temp.assess_on_closed_day()) ->> 'confirm_scope', null, 'K17 (2): each cell, every time');
select is(pg_temp.try($$select pg_temp.rule('confirm_once')$$), 'ok', 'K17 (3): "confirm once" is a step of its own');
select is(pg_temp.assess_on_closed_day() ->> 'operation', 'warning_requires_override', 'K17 (3): the first cell still asks');
select is(pg_temp.closed_reason(pg_temp.assess_on_closed_day()) ->> 'severity', 'confirm', 'K17 (3): as a confirmation');
select is(pg_temp.closed_reason(pg_temp.assess_on_closed_day()) ->> 'confirm_scope', 'edit_session',
  'K17 (3): one that holds for the rest of the editing session');
select is(pg_temp.try($$select pg_temp.rule('warn')$$), '23514 ', 'K17: "warn" is not one of the three steps');

-- 7. K18: unavailable after publishing ---------------------------------------------------------

create function pg_temp.read_shift(shift_label text) returns jsonb language sql as $$
  select s from jsonb_array_elements(public.get_schedule_read_model_service(pg_temp.u('owner'), tests.id('c'), tests.week(0)) -> 'shifts') s
  where (s ->> 'id')::uuid = tests.id('c:shift:' || shift_label)
$$;
select is(pg_temp.read_shift('ali_tue') ->> 'availability_changed_after_publish', 'false',
  'K18: Ali''s Tuesday shift went out with nothing against it');
-- Ali marks Tuesdays (0 = Sunday) unavailable after the week went out.
select tests.availability('c', 'ali', 2, '08:00', '18:00');
select ok(pg_temp.read_shift('ali_tue') -> 'warning_codes' ? 'availability', 'K18: his Tuesday shift shows the new mark');
select is(pg_temp.read_shift('ali_tue') ->> 'availability_changed_after_publish', 'true',
  'K18: and that it came after publishing');
select is(pg_temp.holder('ali_tue'), tests.id('c:ali'), 'K18: the shift itself stays his');

select * from finish();
rollback;
