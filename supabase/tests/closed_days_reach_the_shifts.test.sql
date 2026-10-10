begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.7 C / EKRAN-08: an important date that closes a location, or gives it
-- short hours, and the shifts already there. Saving one lists the published
-- shifts it lands on; each is removed, opened or kept as the manager chooses,
-- removed by default on a closed day, and with short hours removed when it
-- lies wholly outside them and kept when it only runs over (K13, B12);
-- whoever lost a shift hears it once, with the closing (K14); taking the date
-- away does not hand the shifts back, and says how many stay open (K15); a
-- draft's shifts on it drop quietly (K16). Writing onto a closed span or
-- outside short hours later is blocked, confirmed each time, or confirmed once
-- per editing session (K17). A published shift whose person marked themselves
-- unavailable after publishing says so (K18).
-- Rules: KARARLAR "Duyurular ve önemli tarihler" K13-K18, "Important Dates
-- çekmecesi A (Stacked)", Mert's decisions of 2026-10-10.

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
  {"label": "emre_mon", "person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "13:00", "end": "17:00"},
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

-- What a date does at each location, by key: {"K": {"status": "closed"}}.
create function pg_temp.days(spec jsonb) returns jsonb language sql as $$
  select case when spec is not null then
    coalesce((select jsonb_object_agg(tests.id('c:' || entry.key)::text, entry.value) from jsonb_each(spec) entry), '{}') end
$$;

create function pg_temp.closed(keys text[]) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(tests.id('c:' || k)::text, '{"status": "closed"}'::jsonb), '{}') from unnest(keys) k
$$;

-- The manager's choices, by shift label: {"can_mon": "keep"}.
create function pg_temp.choose(spec jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(tests.id('c:shift:' || entry.key)::text, entry.value), '{}') from jsonb_each(spec) entry
$$;

create function pg_temp.preview(person text, keys text[], day date, id uuid default null, spec jsonb default null,
  all_day boolean default true, starts time default null, ends time default null)
returns jsonb language sql as $$
  select public.preview_important_date_closure_service(pg_temp.u(person), tests.id('c'), id, day, day, 'none',
    pg_temp.locs(keys), all_day, starts, ends, coalesce(pg_temp.days(spec), pg_temp.closed(keys)))
$$;

create function pg_temp.close_day(person text, keys text[], title text, day date, choices jsonb default '{}',
  fingerprint text default null, id uuid default null, spec jsonb default null, all_day boolean default true,
  starts time default null, ends time default null, kind text default 'holiday') returns jsonb language sql as $$
  select public.save_important_date_service(pg_temp.u(person), tests.id('c'), id, title, kind, day, day,
    'none', '', pg_temp.locs(keys), (select d.revision from public.important_dates d where d.id = close_day.id),
    all_day, starts, ends, coalesce(pg_temp.days(spec), pg_temp.closed(keys)), choices, fingerprint)
$$;

create function pg_temp.published(shift_label text) returns boolean language sql as $$
  select exists (select 1 from public.schedule_published_shifts p where p.id = tests.id('c:shift:' || shift_label))
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

select is(pg_temp.listed_ids(pg_temp.preview('ayse', array['K'], tests.week(0))), pg_temp.ids(array['ali_mon', 'can_mon', 'emre_mon']),
  'K13: closing Kadikoy on Monday lists Ali''s, Can''s and Emre''s published shifts there, not the open one, nor Besiktas''s');
select ok(pg_temp.preview('ayse', array['K'], tests.week(0)) -> 'shifts' -> 0 ? 'employee_name',
  'K13: each listed shift says whose it is');
select is((select array_agg(distinct s ->> 'default_choice') from jsonb_array_elements(pg_temp.preview('ayse', array['K'], tests.week(0)) -> 'shifts') s),
  array['remove'], 'K13: on a closed day each defaults to Remove (drawer decision 6)');
select is((select array_agg(distinct s ->> 'reason') from jsonb_array_elements(pg_temp.preview('ayse', array['K'], tests.week(0)) -> 'shifts') s),
  array['closed'], 'K13: each says the location is closed');
select is(pg_temp.listed_ids(pg_temp.preview('ayse', array['K'], tests.week(0), spec => '{}')), '{}'::text[],
  'K13: a date that closes nothing lists nothing');
select is(pg_temp.try($$select pg_temp.preview('veli', array['K'], tests.week(0))$$), '42501 authz.out_of_scope',
  'K13: Veli, Besiktas''s manager, cannot look at Kadikoy''s shifts this way');

-- One date, two days: Kadikoy closed, Besiktas open 10 AM to 3 PM. Deniz's
-- 9-to-5 only runs over the short hours: it is listed, kept by default (B12).
create temporary table thanksgiving as select pg_temp.preview('owner', array['K', 'B'], tests.week(0),
  spec => '{"K": {"status": "closed"}, "B": {"status": "short", "opens": "10:00", "closes": "15:00"}}') result;
select is((select pg_temp.listed_ids(result) from thanksgiving), pg_temp.ids(array['ali_mon', 'can_mon', 'emre_mon', 'deniz_mon']),
  'L1: closing Kadikoy and shortening Besiktas lists the shifts at both');
select is((select s ->> 'reason' from thanksgiving, jsonb_array_elements(result -> 'shifts') s
           where (s ->> 'id')::uuid = tests.id('c:shift:deniz_mon')), 'short_hours',
  'B12: Deniz''s shift is there for the short hours');
select is((select jsonb_build_object('default', s ->> 'default_choice', 'opens', s ->> 'opens', 'closes', s ->> 'closes')
           from thanksgiving, jsonb_array_elements(result -> 'shifts') s where (s ->> 'id')::uuid = tests.id('c:shift:deniz_mon')),
  '{"default": "keep", "opens": "10:00", "closes": "15:00"}'::jsonb, 'B12: it only runs over them, so it is kept by default');

select is(pg_temp.listed_ids(pg_temp.preview('dina', array['K'], tests.week(0))), '{}'::text[],
  'D1: Dina, who may not read Kadikoy''s Schedule, is not shown whose shifts they are');
select is((pg_temp.preview('dina', array['K'], tests.week(0)) ->> 'hidden_shift_count')::integer, 3,
  'D1: she is told three shifts she cannot see are on that day');
select is(pg_temp.try($$select pg_temp.close_day('dina', array['K'], 'Dina closes', tests.week(0),
  fingerprint => pg_temp.preview('dina', array['K'], tests.week(0)) ->> 'fingerprint')$$),
  '42501 authz.missing_permission', 'D4: she cannot remove them: closing over shifts needs schedule.edit there');
select is(pg_temp.holder('ali_mon'), tests.id('c:ali'), 'D4: Ali keeps his shift');

-- BL-958: the refusal answers PT409, never 40001: PostgREST takes 40001 for a
-- passing conflict and runs the same request again forever, holding a connection.
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0))$$),
  'PT409 important_date.closure_changed', 'K13: closing it without having seen the shifts is refused');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0), fingerprint => 'stale')$$),
  'PT409 important_date.closure_changed', 'K13: so is closing it on a list that changed since');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0),
  choices => pg_temp.choose('{"ali_tue": "keep"}'), fingerprint => pg_temp.preview('ayse', array['K'], tests.week(0)) ->> 'fingerprint')$$),
  'PT409 important_date.closure_changed', 'K13: so is a choice for a shift the list does not hold');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0),
  choices => pg_temp.choose('{"ali_mon": "delete"}'), fingerprint => pg_temp.preview('ayse', array['K'], tests.week(0)) ->> 'fingerprint')$$),
  'PT409 important_date.closure_changed', 'K13: and a choice other than Remove, Open shift or Keep');

create temporary table monday_saved as select pg_temp.close_day('ayse', array['K'], 'Inventory closed', tests.week(0),
  choices => pg_temp.choose('{"ali_mon": "open", "can_mon": "keep"}'),
  fingerprint => pg_temp.preview('ayse', array['K'], tests.week(0)) ->> 'fingerprint') result;
select tests.remember('c:date:monday', (select (result ->> 'important_date_id')::uuid from monday_saved));
select is((select jsonb_build_object('opened', result -> 'shifts_opened', 'removed', result -> 'shifts_removed') from monday_saved),
  '{"opened": 1, "removed": 1}'::jsonb, 'BL-884: the save says one shift was opened and one removed');
select is(pg_temp.holder('ali_mon'), null, 'K13: Ali''s Monday shift, opened, is an open shift now');
select ok(pg_temp.published('ali_mon'), 'K13: it is still on the Schedule');
select is(pg_temp.holder('can_mon'), tests.id('c:can'), 'K13: Can''s, kept for prep, is still his');
select ok(not pg_temp.published('emre_mon'), 'K13: Emre''s, removed by default, is gone from the Schedule');
select is(pg_temp.holder('ali_tue'), tests.id('c:ali'), 'K13: Ali''s Tuesday shift is untouched');
select is(pg_temp.holder('deniz_mon'), tests.id('c:deniz'), 'K13: Besiktas''s Monday is untouched');
select is((select array_agg(r.outcome order by r.outcome) from public.important_date_shift_releases r
           where r.important_date_id = tests.id('c:date:monday')), array['opened', 'removed'],
  'K13: the date keeps which shift it opened and which it removed');
select is((select r.before_assignment ->> 'employee_id' from public.important_date_shift_releases r
           where r.important_date_id = tests.id('c:date:monday') and r.outcome = 'removed'), tests.id('c:emre')::text,
  'K13: and whose the removed one was');

-- 3. K14: one notice for whoever lost a shift --------------------------------------------------

select is(cardinality(pg_temp.notices('ali', tests.id('c:date:monday'))), 1, 'K14: Ali hears it once');
select ok((pg_temp.notices('ali', tests.id('c:date:monday')))[1] like '%your shift was removed%',
  'K14: the one notice says Kadikoy is closed and his shift was removed');
select is(cardinality(pg_temp.notices('emre', tests.id('c:date:monday'))), 1, 'K14: Emre, whose shift was removed, hears it once too');
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
select ok((pg_temp.inbox('emre', tests.id('c:date:monday')))[1] like 'Kadikoy is closed on % — your shift was removed',
  'K14: Emre''s reads the same');

-- 4. K15: taking the closed day away hands nothing back ---------------------------------------

select is((public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:date:monday'), 'archive')
  ->> 'shifts_stay_open')::integer, 1, 'K15: archiving it tells Ayse one shift stays open');
select is(pg_temp.holder('ali_mon'), null, 'K15: Ali''s Monday shift does not come back by itself');
select ok(not pg_temp.published('emre_mon'), 'K15: nor does Emre''s removed one');

-- Republishing a closed day lands on the shifts again: they are listed first.
select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:date:monday'), 'restore');
select is(pg_temp.try(format($$select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), %L, 'republish')$$,
  tests.id('c:date:monday'))), 'PT409 important_date.closure_changed',
  'K13: republishing a closed day over published shifts asks for the list first');
select is(pg_temp.try(format($$select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('c'), %L, 'republish',
  %L::jsonb, %L)$$, tests.id('c:date:monday'), pg_temp.choose('{"can_mon": "keep"}'),
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
-- EKRAN-01 #12 (BL-762): the closing is nobody's step in the edit, and the
-- owner's steps before it go with it: Undo cannot put Can back on the closed
-- Wednesday, through the closing or through an older step.
select is((public.get_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'), tests.id('c:open-edit'))
    ->> 'undo_depth')::integer, 0, 'BL-762: after the closing the owner''s edit has nothing to take back');
select is(pg_temp.try(format('select public.undo_schedule_edit_session_step_service(%L, %L, %L, %s)',
    pg_temp.u('owner'), tests.id('c'), tests.id('c:open-edit'),
    (select revision from public.schedule_edit_sessions where id = tests.id('c:open-edit')))),
  'PT409 schedule.nothing_to_undo', 'BL-762: and Undo says so');
select is((select employee_id from public.schedule_edit_session_shifts s
           where s.session_id = tests.id('c:open-edit') and s.scheduled_date = tests.week(2) + 2), null::uuid,
  'BL-762: Can stays off the closed Wednesday');

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
  choices => pg_temp.choose('{"ali_wed4": "keep"}'),
  fingerprint => pg_temp.preview('ayse', array['K'], tests.week(4) + 2) ->> 'fingerprint');
select is(pg_temp.holder('ali_wed4'), tests.id('c:ali'), 'BL-545: kept, Ali stays on the published shift');
select is((select employee_id from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft4')),
  tests.id('c:ali'), 'BL-545: and on the saved draft''s copy');
select is((select employee_id from public.schedule_edit_session_shifts s where s.session_id = tests.id('c:edit4b')),
  tests.id('c:ali'), 'BL-545: and in the open edit');

-- EKRAN-08: removed, the shift leaves the saved draft and the open edit too,
-- or the next publish would bring it back.

select tests.publish_week('c', 7, '[{"label": "ali_wed7", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}]');
select tests.remember('c:edit7', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(7), 'published', null) -> 'session' ->> 'id')::uuid);
select tests.remember('c:draft7', (public.save_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.id('c:edit7'), (select revision from public.schedule_edit_sessions where id = tests.id('c:edit7')),
  'Changes', null, null) ->> 'id')::uuid);
select tests.remember('c:edit7b', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(7), 'draft', tests.id('c:draft7')) -> 'session' ->> 'id')::uuid);
select pg_temp.close_day('ayse', array['K'], 'Flood', tests.week(7) + 2,
  fingerprint => pg_temp.preview('ayse', array['K'], tests.week(7) + 2) ->> 'fingerprint');
select ok(not pg_temp.published('ali_wed7'), 'Remove: Ali''s Wednesday is gone from the published week');
select is((select count(*)::integer from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft7')), 0,
  'Remove: and from the saved draft');
select is((select count(*)::integer from public.schedule_edit_session_shifts s where s.session_id = tests.id('c:edit7b')), 0,
  'Remove: and from the open edit');

-- O1 (K11): Can's Tuesday shift sits in a draft four years back, and a yearly
-- closed day that began that day is republished.
-- ponytail: the old draft and the yearly date are put in place directly; the
-- rule under test is what the republish reaches.
update public.schedule_draft_shifts set scheduled_date = (tests.week(1) + 1 - interval '4 years')::date
where draft_id = tests.id('c:draft') and scheduled_date = tests.week(1) + 1;
insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note, location_days,
  location_ids, location_id, created_by, updated_by, status)
values (tests.id('c'), 'Founders closed', 'holiday', (tests.week(1) + 1 - interval '4 years')::date,
  (tests.week(1) + 1 - interval '4 years')::date, 'annual', '', pg_temp.closed(array['K']), array[tests.id('c:K')], tests.id('c:K'),
  pg_temp.u('ayse'), pg_temp.u('ayse'), 'unpublished');
select tests.remember('c:date:yearly', (select d.id from public.important_dates d
  where d.workspace_id = tests.id('c') and d.title = 'Founders closed'));
create function pg_temp.yearly_preview() returns jsonb language sql as $$
  select public.preview_important_date_closure_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:date:yearly'),
    (tests.week(1) + 1 - interval '4 years')::date, (tests.week(1) + 1 - interval '4 years')::date,
    'annual', array[tests.id('c:K')], true, null, null, pg_temp.closed(array['K']))
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

-- 7. Short hours and a closed span (B12, B13) ----------------------------------------------
-- Week 3, Monday at Kadikoy: Emre 7-9 AM, Can 11 AM-2 PM, Ali noon-6 PM.
-- Kadikoy opens 10 AM to 3 PM that day.

select tests.publish_week('c', 3, $$[
  {"label": "emre_w3", "person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "07:00", "end": "09:00"},
  {"label": "can_w3", "person": "can", "loc": "K", "job": "cook", "day": 0, "start": "11:00", "end": "14:00"},
  {"label": "ali_w3", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "12:00", "end": "18:00"}
]$$::jsonb);
create function pg_temp.short_preview() returns jsonb language sql as $$
  select pg_temp.preview('ayse', array['K'], tests.week(3), spec => '{"K": {"status": "short", "opens": "10:00", "closes": "15:00"}}')
$$;
select is(pg_temp.listed_ids(pg_temp.short_preview()), pg_temp.ids(array['emre_w3', 'ali_w3']),
  'B12: short hours list the shifts outside them, not Can''s inside them');
select is((select jsonb_object_agg(s ->> 'employee_id', s ->> 'default_choice') from jsonb_array_elements(pg_temp.short_preview() -> 'shifts') s),
  jsonb_build_object(tests.id('c:emre'), 'remove', tests.id('c:ali'), 'keep'),
  'B12: Emre''s, wholly outside, defaults to Remove; Ali''s, running over, to Keep');
create temporary table short_saved as select pg_temp.close_day('ayse', array['K'], 'Christmas Eve', tests.week(3),
  spec => '{"K": {"status": "short", "opens": "10:00", "closes": "15:00"}}',
  fingerprint => pg_temp.short_preview() ->> 'fingerprint') result;
select tests.remember('c:date:short', (select (result ->> 'important_date_id')::uuid from short_saved));
select ok(not pg_temp.published('emre_w3'), 'B12: saved as listed, Emre''s shift is removed');
select is(pg_temp.holder('ali_w3'), tests.id('c:ali'), 'B12: Ali keeps his');
select is(pg_temp.holder('can_w3'), tests.id('c:can'), 'B12: Can''s was never in question');
select ok((pg_temp.notices('emre', tests.id('c:date:short')))[1] like 'Kadikoy has short hours on % — your shift was removed',
  'K14: Emre hears that Kadikoy has short hours and his shift was removed');
select is((select jsonb_build_object('kind', c.kind, 'all_day', c.is_all_day, 'opens', c.window_start, 'closes', c.window_end)
           from public.schedule_closures c where c.important_date_id = tests.id('c:date:short')),
  '{"kind": "short", "all_day": false, "opens": "10:00:00", "closes": "15:00:00"}'::jsonb,
  'B12: the Schedule reads Kadikoy''s short hours that day');

-- Week 5, Monday: Ali 8 AM-noon, Can 4-8 PM. Kadikoy closes 1 to 5 PM only
-- (All day off: the hours are the closing''s, B13).
select tests.publish_week('c', 5, $$[
  {"label": "ali_w5", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "08:00", "end": "12:00"},
  {"label": "can_w5", "person": "can", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "20:00"}
]$$::jsonb);
create function pg_temp.span_preview() returns jsonb language sql as $$
  select pg_temp.preview('ayse', array['K'], tests.week(5), all_day => false, starts => '13:00', ends => '17:00')
$$;
select is(pg_temp.listed_ids(pg_temp.span_preview()), pg_temp.ids(array['can_w5']),
  'B13: a closing from 1 to 5 PM lists Can''s 4 PM shift, not Ali''s morning');
create temporary table span_saved as select pg_temp.close_day('ayse', array['K'], 'Water off', tests.week(5),
  choices => pg_temp.choose('{"can_w5": "open"}'), all_day => false, starts => '13:00', ends => '17:00',
  fingerprint => pg_temp.span_preview() ->> 'fingerprint') result;
select tests.remember('c:date:span', (select (result ->> 'important_date_id')::uuid from span_saved));
select is(pg_temp.holder('can_w5'), null, 'B13: Can''s shift, opened, is an open shift');
select is(pg_temp.holder('ali_w5'), tests.id('c:ali'), 'B13: Ali''s morning is untouched');
select is((select jsonb_build_object('all_day', c.is_all_day, 'from', c.window_start, 'until', c.window_end)
           from public.schedule_closures c where c.important_date_id = tests.id('c:date:span')),
  '{"all_day": false, "from": "13:00:00", "until": "17:00:00"}'::jsonb, 'B13: the Schedule reads the closed span');

-- K17 for both: a shift written into the closed span or outside the short
-- hours meets the "Closed location" rule (Mert, 2026-10-10); one inside does not.
create function pg_temp.assess_at(day date, starts text, ends text) returns jsonb language sql as $$
  select public.assess_weekly_shift_availability(tests.id('c'), null, jsonb_build_object(
    'location_id', tests.id('c:K'), 'job_id', tests.id('c:job:cook'), 'scheduled_date', day,
    'time_basis', 'explicit', 'start_time', starts, 'end_time', ends, 'time_timezone', 'Europe/Istanbul'))
$$;
select pg_temp.rule('block');
select is(pg_temp.assess_at(tests.week(3), '16:00', '18:00') ->> 'operation', 'blocked',
  'K17: a shift after the short hours meets the rule');
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(3), '11:00', '14:00')), null,
  'K17: one inside them does not');
select is(pg_temp.assess_at(tests.week(5), '15:00', '16:00') ->> 'operation', 'blocked',
  'K17: a shift in the closed span meets the rule');
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(5), '08:00', '10:00')), null,
  'K17: one before it does not');

-- 8. What a date may say ----------------------------------------------------------------------

select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Old kind', tests.week(6), kind => 'closed_day')$$),
  '22023 ', 'Types: "Closed day" is no longer a type: closing is a location''s');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Old kind', tests.week(6), kind => 'blackout')$$),
  '22023 ', 'Types: nor is "Blackout"');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Elsewhere', tests.week(6), spec => '{"B": {"status": "closed"}}')$$),
  '22023 ', 'L1: a date cannot close a location it is not for');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Backwards', tests.week(6),
  spec => '{"K": {"status": "short", "opens": "15:00", "closes": "10:00"}}')$$),
  '22023 ', 'L1: short hours open before they close');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Odd', tests.week(6), spec => '{"K": {"status": "open"}}')$$),
  '22023 ', 'L1: an open location is one left out');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Timed', tests.week(6), starts => '09:00', ends => '17:00')$$),
  '22023 ', 'B13: an all-day date has no hours');
select is(pg_temp.try($$select pg_temp.close_day('ayse', array['K'], 'Timed', tests.week(6), all_day => false, starts => '17:00', ends => '09:00')$$),
  '22023 ', 'B13: a one-day date ends after it starts');
select is(pg_temp.try($$select pg_temp.close_day('veli', array['K'], 'Not mine', tests.week(6))$$),
  '42501 authz.out_of_scope', 'K1: Veli cannot close Kadikoy');

-- 9. K18: unavailable after publishing ---------------------------------------------------------

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
