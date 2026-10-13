begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.7 C / EKRAN-08 (one announcement record): a post that closes a
-- location, or gives it short hours, and the shifts already there. Its Shifts
-- tab lists the published shifts it lands on (V1): removed by default on a
-- closed day and after closing, kept when it is prep or runs over; each is
-- removed, made open, kept or (short hours) given new hours as the manager
-- chooses (V2-V5). Whoever lost a shift hears it once, with the closing (B1,
-- K14). A draft week's own shifts drop quietly (V6, K16). What it changed can
-- be brought back (V7). Writing onto a closed day or outside short hours later
-- is blocked, confirmed each time, or confirmed once per editing session
-- (K17). A published shift whose person marked themselves unavailable after
-- publishing says so (K18).
-- Rules: KARARLAR "Duyurular ve önemli tarihler" K13-K18, "Important Dates
-- çekmecesi" (Mert, 2026-10-12), the drawer prototype v11.

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

-- A published shift's lasting id (its source), kept by label: a removed shift's
-- row is gone, and one brought back is a new row with the same source.
create temporary table shift_source (label text primary key, source uuid not null);
create function pg_temp.keep_sources() returns void language sql as $$
  insert into shift_source
  select split_part(i.label, ':', 3), s.source_shift_id from tests.ids i
  join public.schedule_published_shifts s on s.id = i.id
  where i.label like 'c:shift:%'
  on conflict (label) do nothing
$$;
select pg_temp.keep_sources();
create function pg_temp.source(shift_label text) returns text language sql as $$
  select source::text from shift_source where label = shift_label
$$;

-- Who holds a published shift now (null: it is open).
create function pg_temp.holder(shift_label text) returns uuid language sql as $$
  select p.employee_id from public.schedule_published_shifts p
  join public.schedule_location_publications publication on publication.id = p.publication_id and publication.status = 'current'
  where p.source_shift_id = (select source from shift_source where label = shift_label)
$$;
create function pg_temp.published(shift_label text) returns boolean language sql as $$
  select exists (
    select 1 from public.schedule_published_shifts p
    join public.schedule_location_publications publication on publication.id = p.publication_id and publication.status = 'current'
    where p.source_shift_id = (select source from shift_source where label = shift_label))
$$;

-- What a post does at each location, by key: {"K": {"day": "closed"}}.
create function pg_temp.rows(spec jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('location_id', tests.id('c:' || entry.key)) || entry.value), '[]'::jsonb)
  from jsonb_each(spec) entry
$$;
-- The manager's choices by shift label: {"can_mon": "keep"} or {"ali_w3": {"choice": "edit", ...}}.
create function pg_temp.choose(spec jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(pg_temp.source(entry.key),
    case when jsonb_typeof(entry.value) = 'object' then entry.value else jsonb_build_object('choice', entry.value) end), '{}'::jsonb)
  from jsonb_each(spec) entry
$$;
create function pg_temp.payload(title text, day date, spec jsonb, choices jsonb default '{}', extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('title', title, 'body', '', 'category', 'holiday', 'starts_on', day, 'ends_on', day,
    'on_schedule', true, 'on_important_dates', true, 'locations', pg_temp.rows(spec), 'people', '[]'::jsonb,
    'choices', pg_temp.choose(choices)) || extra
$$;
create function pg_temp.preview(person text, day date, spec jsonb, choices jsonb default '{}', id uuid default null)
returns jsonb language sql as $$
  select public.preview_announcement_service(pg_temp.u(person), tests.id('c'), id,
    pg_temp.payload('Preview', day, spec, choices) || '{"intent": "publish"}')
$$;
-- Publishes a new post (or saves a published one) with the fingerprint given.
create function pg_temp.publish(person text, title text, day date, spec jsonb, choices jsonb default '{}',
  fingerprint text default null, id uuid default null, extra jsonb default '{}') returns jsonb language sql as $$
  select public.save_announcement_service(pg_temp.u(person), tests.id('c'), id,
    (select a.revision from public.announcements a where a.id = publish.id),
    pg_temp.payload(title, day, spec, choices, extra) || jsonb_build_object('fingerprint', fingerprint),
    case when (select a.status from public.announcements a where a.id = publish.id) = 'published' then 'save' else 'publish' end)
$$;
-- The same, having looked at the Shifts tab first with these choices.
create function pg_temp.publish_seen(person text, title text, day date, spec jsonb, choices jsonb default '{}',
  id uuid default null) returns jsonb language sql as $$
  select pg_temp.publish(person, title, day, spec, choices,
    pg_temp.preview(person, day, spec, choices, id) ->> 'fingerprint', id)
$$;

create function pg_temp.listed(preview jsonb) returns text[] language sql as $$
  select coalesce(array_agg(s ->> 'source_id' order by s ->> 'source_id'), '{}') from jsonb_array_elements(preview -> 'shifts') s
$$;
create function pg_temp.sources(labels text[]) returns text[] language sql as $$
  select coalesce(array_agg(pg_temp.source(l) order by pg_temp.source(l)), '{}') from unnest(labels) l
$$;
create function pg_temp.row_of(preview jsonb, shift_label text) returns jsonb language sql as $$
  select s from jsonb_array_elements(preview -> 'shifts') s where s ->> 'source_id' = pg_temp.source(shift_label)
$$;

-- The notices about this post each person was sent, title and body.
create function pg_temp.notices(person text, subject uuid) returns text[] language sql as $$
  select coalesce(array_agg((o.payload ->> 'title') || ' | ' || (o.payload ->> 'body') order by o.created_at), '{}')
  from public.notification_outbox o
  where o.subject_id = subject::text and o.payload -> 'recipient_user_ids' ? pg_temp.u(person)::text
$$;
create function pg_temp.day_text(day date) returns text language sql as $$ select to_char(day, 'Dy, Mon FMDD') $$;

-- 2. V1: the shifts a closed day lands on --------------------------------------------------

select is(pg_temp.listed(pg_temp.preview('ayse', tests.week(0), '{"K": {"day": "closed"}}')),
  pg_temp.sources(array['ali_mon', 'can_mon', 'emre_mon', 'open_mon']),
  'V1: closing Kadikoy on Monday lists every published shift there that day, the open one too; not Besiktas''s, not Tuesday''s');
select is(pg_temp.row_of(pg_temp.preview('ayse', tests.week(0), '{"K": {"day": "closed"}}'), 'ali_mon')
    - 'id' - 'source_id' - 'employee_id' - 'employee_user_id' - 'job_id' - 'location_id',
  jsonb_build_object('location_name', 'Kadikoy', 'scheduled_date', tests.week(0), 'employee_name', 'Ali Person',
    'job_name', 'Cook', 'start_time', '09:00', 'end_time', '17:00', 'day', 'closed', 'opens', null, 'closes', null,
    'reason', 'closed', 'started', false, 'tied', false, 'changed_in_schedule', false, 'default', 'remove',
    'choice', 'remove', 'from', null, 'until', null, 'outcome', 'removed'),
  'V2: each row says whose shift, where, when, why it is listed, and that a closed day removes it by default');
select is(pg_temp.row_of(pg_temp.preview('ayse', tests.week(0), '{"K": {"day": "closed"}}'), 'open_mon') ->> 'employee_name', null,
  'V1: the open shift is nobody''s');
select is(pg_temp.listed(pg_temp.preview('ayse', tests.week(0), '{"K": {"day": "open"}}')), '{}'::text[],
  'V1: a post that keeps the usual hours lists nothing');
select is(pg_temp.try($$select pg_temp.preview('veli', tests.week(0), '{"K": {"day": "closed"}}')$$), '42501 authz.out_of_scope',
  'K1: Veli, Besiktas''s manager, cannot look at Kadikoy''s shifts this way');

-- One post, two days: Kadikoy closed, Besiktas open 10 AM to 3 PM. Deniz's
-- 9-to-5 runs over the short hours: it is listed, kept by default (V3).
create temporary table thanksgiving as select pg_temp.preview('owner', tests.week(0),
  '{"K": {"day": "closed"}, "B": {"day": "short", "opens": "10:00", "closes": "15:00"}}') result;
select is((select pg_temp.listed(result) from thanksgiving), pg_temp.sources(array['ali_mon', 'can_mon', 'emre_mon', 'open_mon', 'deniz_mon']),
  'V1: closing Kadikoy and shortening Besiktas lists the shifts at both');
select is((select jsonb_build_object('reason', r ->> 'reason', 'default', r ->> 'default', 'day', r ->> 'day',
    'opens', r ->> 'opens', 'closes', r ->> 'closes') from thanksgiving, pg_temp.row_of(result, 'deniz_mon') r),
  '{"reason": "over", "default": "keep", "day": "short", "opens": "10:00", "closes": "15:00"}'::jsonb,
  'V3: Deniz''s shift only runs over the short hours, so it is kept by default');

-- D1: Dina may change Kadikoy's important dates, not read its Schedule.
select is(pg_temp.listed(pg_temp.preview('dina', tests.week(0), '{"K": {"day": "closed"}}')), '{}'::text[],
  'D1: Dina is not shown whose shifts they are');
select is((pg_temp.preview('dina', tests.week(0), '{"K": {"day": "closed"}}') ->> 'hidden_count')::integer, 4,
  'D1: she is told four shifts she cannot see are on that day');
select is(pg_temp.try($$select pg_temp.publish_seen('dina', 'Dina closes', tests.week(0), '{"K": {"day": "closed"}}')$$),
  '42501 authz.missing_permission', 'D4: she cannot remove them: closing over shifts needs schedule.edit there');
select is(pg_temp.holder('ali_mon'), tests.id('c:ali'), 'D4: Ali keeps his shift');

-- BL-958: the refusal answers PT409, never 40001.
select is(pg_temp.try($$select pg_temp.publish('ayse', 'Inventory closed', tests.week(0), '{"K": {"day": "closed"}}')$$),
  'PT409 announcement.shifts_changed', 'V4: publishing without having seen the shifts is refused');
select is(pg_temp.try($$select pg_temp.publish('ayse', 'Inventory closed', tests.week(0), '{"K": {"day": "closed"}}',
  fingerprint => 'stale')$$), 'PT409 announcement.shifts_changed', 'V4: so is publishing on a list that changed since');
select is(pg_temp.try($$select pg_temp.publish_seen('ayse', 'Inventory closed', tests.week(0), '{"K": {"day": "closed"}}',
  '{"ali_mon": "delete"}')$$), '22023 announcement.invalid', 'V4: a choice other than Remove, Open shift, Keep or new hours is refused');
select is(pg_temp.try($$select pg_temp.publish_seen('ayse', 'Inventory closed', tests.week(0), '{"K": {"day": "closed"}}',
  '{"ali_mon": null}')$$), '22023 announcement.invalid', 'V4: so is an empty choice');
select is(pg_temp.try($$select pg_temp.publish_seen('ayse', 'Inventory closed', tests.week(0), '{"K": {"day": "closed"}}',
  '{"ali_mon": {"choice": "edit", "from": "9", "until": "10:00"}}')$$), '22023 announcement.invalid',
  'V4: and new hours that are not hours');
select is(pg_temp.row_of(pg_temp.preview('ayse', tests.week(0), '{"K": {"day": "closed"}}', '{"open_mon": "open"}'), 'open_mon')
  ->> 'choice', 'remove', 'V4: Open shift is not a choice for a shift that is open already: it keeps its default');
select is(pg_temp.row_of(pg_temp.preview('ayse', tests.week(0), '{"K": {"day": "closed"}}',
    '{"ali_mon": {"choice": "edit", "from": "10:00", "until": "12:00"}}'), 'ali_mon') ->> 'choice', 'remove',
  'V4: new hours are for a day with short hours, not a closed one');

-- 3. V5: Ayse publishes with her choices ---------------------------------------------------------
-- Ali's Monday becomes an open shift, Can keeps his for prep, Emre's and the
-- open shift go by default.

create temporary table monday_saved as select pg_temp.publish_seen('ayse', 'Inventory closed', tests.week(0),
  '{"K": {"day": "closed"}}', '{"ali_mon": "open", "can_mon": "keep"}') result;
select tests.remember('c:post:monday', (select (result ->> 'announcement_id')::uuid from monday_saved));
select is((select jsonb_build_object('status', result ->> 'display_status', 'changes', result -> 'shift_changes') from monday_saved),
  '{"status": "published", "changes": 3}'::jsonb, 'V5: it is out, and says it changed three shifts');
select is(pg_temp.holder('ali_mon'), null, 'V5: Ali''s Monday shift, made open, is an open shift now');
select ok(pg_temp.published('ali_mon'), 'V5: it is still on the Schedule');
select is(pg_temp.holder('can_mon'), tests.id('c:can'), 'V5: Can''s, kept for prep, is still his');
select ok(not pg_temp.published('emre_mon'), 'V5: Emre''s, removed by default, is gone from the Schedule');
select ok(not pg_temp.published('open_mon'), 'V5: so is the open shift');
select is(pg_temp.holder('ali_tue'), tests.id('c:ali'), 'V5: Ali''s Tuesday shift is untouched');
select is(pg_temp.holder('deniz_mon'), tests.id('c:deniz'), 'V5: Besiktas''s Monday is untouched');
select is((select array_agg(c.outcome || ':' || coalesce(c.employee_id::text, '-') order by c.outcome, c.employee_id)
           from public.announcement_shift_changes c where c.announcement_id = tests.id('c:post:monday')),
  array['opened:' || tests.id('c:ali'), 'removed:' || tests.id('c:emre'), 'removed:-'],
  'V5: the post keeps which shift it opened and which it removed, and whose they were');
select is((select jsonb_agg(x ->> 'action' order by x ->> 'changed_at', x ->> 'action')
           from jsonb_array_elements(public.get_announcement_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:post:monday'))
             -> 'history') x), '["created", "published"]'::jsonb,
  'History: created and published');
select is((select x -> 'detail' ->> 'shift_changes' from jsonb_array_elements(public.get_announcement_service(pg_temp.u('ayse'),
    tests.id('c'), tests.id('c:post:monday')) -> 'history') x where x ->> 'action' = 'published'), '3',
  'History: the publish says how many shifts it changed');
select is(jsonb_array_length(public.get_announcement_service(pg_temp.u('ayse'), tests.id('c'), tests.id('c:post:monday')) -> 'changes'), 3,
  'V5: the drawer lists the three changes');
select is((select jsonb_build_object('changes', jsonb_array_length(r -> 'changes'), 'hidden', r -> 'hidden_change_count')
           from (select public.get_announcement_service(pg_temp.u('dina'), tests.id('c'), tests.id('c:post:monday')) r) x),
  '{"changes": 0, "hidden": 3}'::jsonb, 'D1: Dina''s drawer counts them without names');
select is(pg_temp.listed(pg_temp.preview('ayse', tests.week(0), '{"K": {"day": "closed"}}', id => tests.id('c:post:monday'))),
  '{}'::text[], 'V1: opened again, the post does not list what it already changed, nor Can''s kept shift');

-- 4. B1, K14: one notice for each person it reaches ----------------------------------------------

select is(pg_temp.notices('ali', tests.id('c:post:monday')),
  array['Kadikoy is closed on ' || pg_temp.day_text(tests.week(0)) || ' | You''re off the 9:00 AM–5:00 PM shift; it''s now open for others'],
  'B1: Ali hears once: Kadikoy is closed, and he is off his shift');
select is(pg_temp.notices('emre', tests.id('c:post:monday')),
  array['Kadikoy is closed on ' || pg_temp.day_text(tests.week(0)) || ' | Your 1:00 PM–5:00 PM shift was removed'],
  'B1: Emre hears once that his shift was removed');
select is(pg_temp.notices('can', tests.id('c:post:monday')),
  array['Kadikoy is closed on ' || pg_temp.day_text(tests.week(0)) || ' | Inventory closed'],
  'B1: Can, whose shift stays, hears only that Kadikoy is closed');
select is(pg_temp.notices('ayse', tests.id('c:post:monday')), '{}'::text[], 'KK-89: Ayse, who published it, hears nothing');
select is(pg_temp.notices('deniz', tests.id('c:post:monday')), '{}'::text[], 'K24: Deniz, at Besiktas, hears nothing');

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
select is(pg_temp.inbox('ali', tests.id('c:post:monday')), array['Kadikoy is closed on ' || pg_temp.day_text(tests.week(0))],
  'B1: one notice lands in Ali''s inbox');
select is(pg_temp.inbox('emre', tests.id('c:post:monday')), array['Kadikoy is closed on ' || pg_temp.day_text(tests.week(0))],
  'B1: and one in Emre''s');

-- 5. V7: unpublishing hands nothing back by itself; Bring back does --------------------------------

create temporary table monday_off as select public.set_announcement_state_service(pg_temp.u('ayse'), tests.id('c'),
  tests.id('c:post:monday'), (select revision from public.announcements where id = tests.id('c:post:monday')), 'unpublish') result;
select is((select result ->> 'display_status' from monday_off), 'unpublished', 'K11: Ayse unpublishes it');
select is(pg_temp.holder('ali_mon'), null, 'V7: Ali''s Monday shift does not come back by itself');
select ok(not pg_temp.published('emre_mon'), 'V7: nor does Emre''s');
select is((pg_temp.notices('ali', tests.id('c:post:monday')))[2],
  'Kadikoy will be open on ' || pg_temp.day_text(tests.week(0)) || ' after all | Inventory closed',
  'B1: Ali hears Kadikoy will be open after all');
create temporary table offered as select public.preview_announcement_service(pg_temp.u('ayse'), tests.id('c'),
  tests.id('c:post:monday'), pg_temp.payload('Inventory closed', tests.week(0), '{"K": {"day": "closed"}}')) -> 'bring_back' result;
select is((select jsonb_agg(x ->> 'outcome' || ':' || coalesce(x ->> 'employee_name', '-') || ':' || coalesce(x ->> 'lock', '-')
             order by x ->> 'outcome', x ->> 'employee_name') from offered, jsonb_array_elements(result) x),
  '["opened:Ali Person:-", "removed:Emre Person:-", "removed:-:-"]'::jsonb,
  'V7: the bring-back list offers the three changes, none locked');
select is(pg_temp.try(format($$select public.set_announcement_state_service(%L, %L, %L, %s, 'bring_back', %L)$$,
    pg_temp.u('ayse'), tests.id('c'), tests.id('c:post:monday'),
    (select revision from public.announcements where id = tests.id('c:post:monday')), array[gen_random_uuid()])),
  'PT409 announcement.bring_back_changed', 'V7: a row the list does not hold is refused');
create temporary table brought as select public.set_announcement_state_service(pg_temp.u('ayse'), tests.id('c'),
  tests.id('c:post:monday'), (select revision from public.announcements where id = tests.id('c:post:monday')), 'bring_back',
  array(select (x ->> 'id')::uuid from offered, jsonb_array_elements(result) x where x ->> 'employee_name' is not null)) result;
select is((select (result ->> 'told')::integer from brought), 2, 'V7: Ali and Emre are told');
select is(pg_temp.holder('ali_mon'), tests.id('c:ali'), 'V7: Ali has his Monday shift back');
select is(pg_temp.holder('emre_mon'), tests.id('c:emre'), 'V7: Emre''s is back on the Schedule, his');
select ok(not pg_temp.published('open_mon'), 'V7: the open shift, not chosen, stays gone');
select is(array(select n from unnest(pg_temp.notices('ali', tests.id('c:post:monday'))) n where n like 'Kadikoy will be open%'),
  array['Kadikoy will be open on ' || pg_temp.day_text(tests.week(0)) || ' after all | Your 9:00 AM–5:00 PM shift is back'],
  'B1, B3: Ali hears his shift is back, in one notice that takes the place of the one before');
select is((select count(*)::integer from public.announcement_shift_changes c
           where c.announcement_id = tests.id('c:post:monday') and c.brought_back_at is null), 1,
  'V7: one change stays: the open shift that was not brought back');

-- 6. V6, K16: a draft week's own shifts drop quietly ------------------------------------------------

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
select is(pg_temp.listed(pg_temp.preview('ayse', tests.week(1), '{"K": {"day": "closed"}}')), '{}'::text[],
  'V6: a closed day on a draft week lists nothing to ask about');
select is((pg_temp.preview('ayse', tests.week(1), '{"K": {"day": "closed"}}') ->> 'quiet_count')::integer, 1,
  'V6: it counts the draft shift that will go, for the screen to say so');
create temporary table draft_saved as select pg_temp.publish_seen('ayse', 'Plumbing', tests.week(1), '{"K": {"day": "closed"}}') result;
select tests.remember('c:post:draft', (select (result ->> 'announcement_id')::uuid from draft_saved));
select is((select count(*)::integer from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft')
           and d.scheduled_date = tests.week(1)), 0, 'V6: the draft''s Monday shift is gone');
select is((select count(*)::integer from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft')
           and d.scheduled_date = tests.week(1) + 1 and d.employee_id = tests.id('c:can')), 1, 'V6: its Tuesday is not');
select is((select c.silent from public.announcement_shift_changes c where c.announcement_id = tests.id('c:post:draft')), true,
  'V6: the post keeps it as a quiet change');
select is(pg_temp.notices('can', tests.id('c:post:draft')),
  array['Kadikoy is closed on ' || pg_temp.day_text(tests.week(1)) || ' | Plumbing'],
  'V6: Can hears that Kadikoy is closed, nothing about a draft shift');

-- BL-545 (V6 for unsaved work): Can's Wednesday is in the owner's open edit of
-- week 2, not saved yet. Closing Wednesday takes it out of the edit too;
-- Thursday stays his. Undo cannot put Can back on the closed day (BL-762).

select tests.remember('c:open-edit', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(2), 'blank', null) -> 'session' ->> 'id')::uuid);
select tests.add_shift(pg_temp.u('owner'), 'c', tests.id('c:open-edit'), 2,
  '{"person": "can", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}');
select tests.add_shift(pg_temp.u('owner'), 'c', tests.id('c:open-edit'), 2,
  '{"person": "can", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "17:00"}');
create temporary table open_edit_before as
  select revision from public.schedule_edit_sessions where id = tests.id('c:open-edit');
select is((pg_temp.preview('ayse', tests.week(2) + 2, '{"K": {"day": "closed"}}') ->> 'quiet_count')::integer, 1,
  'BL-545: the unsaved Wednesday shift is counted with the draft shifts that will go');
select pg_temp.publish_seen('ayse', 'Inspection', tests.week(2) + 2, '{"K": {"day": "closed"}}');
select is((select count(*)::integer from public.schedule_edit_session_shifts s
           where s.session_id = tests.id('c:open-edit') and s.scheduled_date = tests.week(2) + 2), 0,
  'BL-545: the open edit''s Wednesday shift is gone');
select is((select employee_id from public.schedule_edit_session_shifts s
           where s.session_id = tests.id('c:open-edit') and s.scheduled_date = tests.week(2) + 3), tests.id('c:can'),
  'BL-545: its Thursday is not');
select cmp_ok((select revision from public.schedule_edit_sessions where id = tests.id('c:open-edit')), '>',
  (select revision from open_edit_before), 'BL-545: the edit''s revision moves, so the open screen reloads it');
select is((public.get_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'), tests.id('c:open-edit'))
    ->> 'undo_depth')::integer, 0, 'BL-762: after the closing the owner''s edit has nothing to take back');
select is(pg_temp.try(format('select public.undo_schedule_edit_session_step_service(%L, %L, %L, %s)',
    pg_temp.u('owner'), tests.id('c'), tests.id('c:open-edit'),
    (select revision from public.schedule_edit_sessions where id = tests.id('c:open-edit')))),
  'PT409 schedule.nothing_to_undo', 'BL-762: and Undo says so');

-- 7. Every copy of a published shift gets the same outcome ------------------------------------------
-- A draft saved from the published week and opened again carries the published
-- shift's copies. Ayse keeps Ali on Wednesday: the draft and the open edit
-- keep him too. Removed, the shift leaves both, or the next publish would bring
-- it back.

select tests.publish_week('c', 4, '[{"label": "ali_wed4", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}]');
select pg_temp.keep_sources();
select tests.remember('c:edit4', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(4), 'published', null) -> 'session' ->> 'id')::uuid);
select tests.remember('c:draft4', (public.save_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.id('c:edit4'), (select revision from public.schedule_edit_sessions where id = tests.id('c:edit4')),
  'Changes', null, null) ->> 'id')::uuid);
select tests.remember('c:edit4b', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(4), 'draft', tests.id('c:draft4')) -> 'session' ->> 'id')::uuid);
select is((pg_temp.preview('ayse', tests.week(4) + 2, '{"K": {"day": "closed"}}') ->> 'quiet_count')::integer, 0,
  'BL-545: a copy of a published shift is not a draft shift that goes quietly');
select pg_temp.publish_seen('ayse', 'Gas leak', tests.week(4) + 2, '{"K": {"day": "closed"}}', '{"ali_wed4": "keep"}');
select is(pg_temp.holder('ali_wed4'), tests.id('c:ali'), 'Keep: Ali stays on the published shift');
select is((select employee_id from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft4')),
  tests.id('c:ali'), 'Keep: and on the saved draft''s copy');
select is((select employee_id from public.schedule_edit_session_shifts s where s.session_id = tests.id('c:edit4b')),
  tests.id('c:ali'), 'Keep: and in the open edit');

select tests.publish_week('c', 7, '[{"label": "ali_wed7", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}]');
select pg_temp.keep_sources();
select tests.remember('c:edit7', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(7), 'published', null) -> 'session' ->> 'id')::uuid);
select tests.remember('c:draft7', (public.save_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.id('c:edit7'), (select revision from public.schedule_edit_sessions where id = tests.id('c:edit7')),
  'Changes', null, null) ->> 'id')::uuid);
select tests.remember('c:edit7b', (public.acquire_schedule_edit_session_service(pg_temp.u('owner'), tests.id('c'),
  tests.week(7), 'draft', tests.id('c:draft7')) -> 'session' ->> 'id')::uuid);
select pg_temp.publish_seen('ayse', 'Flood', tests.week(7) + 2, '{"K": {"day": "closed"}}');
select ok(not pg_temp.published('ali_wed7'), 'Remove: Ali''s Wednesday is gone from the published week');
select is((select count(*)::integer from public.schedule_draft_shifts d where d.draft_id = tests.id('c:draft7')), 0,
  'Remove: and from the saved draft');
select is((select count(*)::integer from public.schedule_edit_session_shifts s where s.session_id = tests.id('c:edit7b')), 0,
  'Remove: and from the open edit');

-- 8. K17: three steps for writing onto a closed day ------------------------------------------

create function pg_temp.rule(step text) returns void language sql as $$
  update public.workspace_scheduling_settings
  set conflict_rules = jsonb_set(conflict_rules, '{closed_location}', to_jsonb(step))
  where workspace_id = tests.id('c')
$$;
create function pg_temp.assess_at(day date, starts text, ends text) returns jsonb language sql as $$
  select public.assess_weekly_shift_availability(tests.id('c'), null, jsonb_build_object(
    'location_id', tests.id('c:K'), 'job_id', tests.id('c:job:cook'), 'scheduled_date', day,
    'time_basis', 'explicit', 'start_time', starts, 'end_time', ends, 'time_timezone', 'Europe/Istanbul'))
$$;
create function pg_temp.closed_reason(assessment jsonb) returns jsonb language sql as $$
  select r from jsonb_array_elements(assessment -> 'reasons') r where r ->> 'code' = 'closed_location'
$$;

-- Week 1's Monday is closed at Kadikoy (Plumbing).
select pg_temp.rule('block');
select is(pg_temp.assess_at(tests.week(1), '18:00', '20:00') ->> 'operation', 'blocked', 'K17 (1): "block" keeps every shift off a closed day');
select pg_temp.rule('confirm');
select is(pg_temp.assess_at(tests.week(1), '18:00', '20:00') ->> 'operation', 'warning_requires_override', 'K17 (2): "confirm" asks for each cell');
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(1), '18:00', '20:00')) ->> 'confirm_scope', null, 'K17 (2): each cell, every time');
select is(pg_temp.try($$select pg_temp.rule('confirm_once')$$), 'ok', 'K17 (3): "confirm once" is a step of its own');
select is(pg_temp.assess_at(tests.week(1), '18:00', '20:00') ->> 'operation', 'warning_requires_override', 'K17 (3): the first cell still asks');
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(1), '18:00', '20:00')) ->> 'confirm_scope', 'edit_session',
  'K17 (3): one that holds for the rest of the editing session');
select is(pg_temp.try($$select pg_temp.rule('warn')$$), '23514 ', 'K17: "warn" is not one of the three steps');
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(1) + 1, '18:00', '20:00')), null, 'K17: the next day is open');

-- An unpublished post's days ahead are open again; its days already past stay
-- closed (KK-97). A scheduled one closes them for the manager already.
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(0), '18:00', '20:00')), null,
  'K11: unpublished, Inventory closed no longer closes Monday');

-- 9. V3, V5: short hours ---------------------------------------------------------------------
-- Week 3, Monday at Kadikoy: Emre 7-9 AM (prep), Can 11 AM-2 PM (inside),
-- Ali noon-6 PM (runs over), Dina 4-8 PM (after closing). Kadikoy opens 10 AM
-- to 3 PM that day.

select tests.publish_week('c', 3, $$[
  {"label": "emre_w3", "person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "07:00", "end": "09:00"},
  {"label": "can_w3", "person": "can", "loc": "K", "job": "cook", "day": 0, "start": "11:00", "end": "14:00"},
  {"label": "ali_w3", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "12:00", "end": "18:00"},
  {"label": "dina_w3", "person": "dina", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "20:00"}
]$$::jsonb);
select pg_temp.keep_sources();
create temporary table short_preview as select pg_temp.preview('ayse', tests.week(3),
  '{"K": {"day": "short", "opens": "10:00", "closes": "15:00"}}') result;
select is((select pg_temp.listed(result) from short_preview), pg_temp.sources(array['emre_w3', 'ali_w3', 'dina_w3']),
  'V3: short hours list the shifts outside them, not Can''s inside them');
select is((select jsonb_object_agg(s ->> 'employee_name', (s ->> 'reason') || ':' || (s ->> 'default'))
           from short_preview, jsonb_array_elements(result -> 'shifts') s),
  '{"Emre Person": "prep:keep", "Ali Person": "over:keep", "Dina Person": "after_close:remove"}'::jsonb,
  'V3: prep and running over are kept by default; a shift after closing is removed');
create temporary table short_saved as select pg_temp.publish_seen('ayse', 'Christmas Eve', tests.week(3),
  '{"K": {"day": "short", "opens": "10:00", "closes": "15:00"}}',
  '{"ali_w3": {"choice": "edit", "from": "12:00", "until": "15:00"}, "emre_w3": "remove"}') result;
select tests.remember('c:post:short', (select (result ->> 'announcement_id')::uuid from short_saved));
select ok(not pg_temp.published('emre_w3'), 'V5: Emre''s prep shift, removed by choice, is gone');
select is((select to_char(p.start_time, 'HH24:MI') || '-' || to_char(p.end_time, 'HH24:MI') from public.schedule_published_shifts p
           where p.source_shift_id = pg_temp.source('ali_w3')::uuid
             and exists (select 1 from public.schedule_location_publications publication
                         where publication.id = p.publication_id and publication.status = 'current')),
  '12:00-15:00', 'V5: Ali''s shift now ends at closing');
select ok(not pg_temp.published('dina_w3'), 'V3: Dina''s shift after closing is removed by default');
select is(pg_temp.holder('can_w3'), tests.id('c:can'), 'V3: Can''s was never in question');
select is(pg_temp.notices('ali', tests.id('c:post:short')),
  array['Kadikoy has short hours on ' || pg_temp.day_text(tests.week(3)) || ' (10:00 AM–3:00 PM) | Your shift is now 12:00 PM–3:00 PM'],
  'B1: Ali hears that Kadikoy has short hours and his shift''s new hours');
select is((select jsonb_build_object('kind', c.kind, 'all_day', c.is_all_day, 'opens', c.opens, 'closes', c.closes)
           from public.schedule_closures c where c.announcement_id = tests.id('c:post:short')),
  '{"kind": "short", "all_day": false, "opens": "10:00:00", "closes": "15:00:00"}'::jsonb,
  'V3: the Schedule reads Kadikoy''s short hours that day');

-- K17 for short hours: a shift outside them meets the "Closed location" rule
-- (Mert, 2026-10-10); one inside does not.
select pg_temp.rule('block');
select is(pg_temp.assess_at(tests.week(3), '16:00', '18:00') ->> 'operation', 'blocked',
  'K17: a shift after the short hours meets the rule');
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(3), '11:00', '14:00')), null,
  'K17: one inside them does not');
select is(pg_temp.closed_reason(pg_temp.assess_at(tests.week(3), '07:00', '09:00')) ->> 'message',
  'Location is closed or has short hours at this time.', 'K17: prep before opening meets it too, and says why');

-- Short hours that close after midnight (6 AM at most).
select is((select jsonb_agg(p ->> 'code') from jsonb_array_elements(pg_temp.preview('ayse', tests.week(6),
    '{"K": {"day": "short", "opens": "18:00", "closes": "01:00"}}') -> 'problems') p), null,
  'Hours: closing at 1 AM the next day is fine');
select is((select jsonb_agg(p ->> 'code') from jsonb_array_elements(pg_temp.preview('ayse', tests.week(6),
    '{"K": {"day": "short", "opens": "18:00", "closes": "07:00"}}') -> 'problems') p), '["hours_invalid"]'::jsonb,
  'Hours: closing at 7 AM the next day is not');
select is((select jsonb_agg(p ->> 'code') from jsonb_array_elements(pg_temp.preview('ayse', tests.week(6),
    '{"K": {"day": "short", "opens": "15:00", "closes": "10:00"}}') -> 'problems') p), '["hours_invalid"]'::jsonb,
  'Hours: nor does a day open at 3 PM and close at 10 AM');

-- 10. What a post may say ------------------------------------------------------------------------

select is(pg_temp.try($$select pg_temp.publish_seen('ayse', 'Elsewhere', tests.week(6), '{"K": {"day": "short"}}')$$),
  '22023 announcement.invalid', 'L1: short hours need their hours');
select is(pg_temp.try($$select pg_temp.publish_seen('ayse', 'Odd', tests.week(6), '{"K": {"day": "half"}}')$$),
  '22023 announcement.invalid', 'L1: a day is Open, Closed or Short hours');
select is(pg_temp.try(format($$select public.save_announcement_service(%L, %L, null, null, %L::jsonb, 'publish')$$,
    pg_temp.u('ayse'), tests.id('c'), pg_temp.payload('Twice', tests.week(6), '{}') || jsonb_build_object('locations',
      jsonb_build_array(jsonb_build_object('location_id', tests.id('c:K'), 'day', 'closed'),
                        jsonb_build_object('location_id', tests.id('c:K'), 'day', 'open'))))),
  '22023 announcement.invalid', 'L1: a location is checked once');
select is(pg_temp.try(format($$select public.save_announcement_service(%L, %L, null, null, %L::jsonb, 'publish')$$,
    pg_temp.u('ayse'), tests.id('c'), pg_temp.payload('Foreign', tests.week(6), '{}') || jsonb_build_object('locations',
      jsonb_build_array(jsonb_build_object('location_id', gen_random_uuid(), 'day', 'closed'))))),
  '42501 authz.out_of_scope', 'L1: a location that is not one of this workspace''s is the same no as one out of reach');
select is(pg_temp.try($$select pg_temp.publish_seen('veli', 'Not mine', tests.week(6), '{"K": {"day": "closed"}}')$$),
  '42501 authz.out_of_scope', 'K1: Veli cannot close Kadikoy');
select is(pg_temp.try($$select pg_temp.publish_seen('ayse', 'Second closing', tests.week(1), '{"K": {"day": "short", "opens": "10:00", "closes": "14:00"}}')$$),
  '22023 announcement.hours_taken', 'S4: Kadikoy''s hours that Monday are Plumbing''s already');
select is((select p ->> 'message' from jsonb_array_elements(pg_temp.preview('ayse', tests.week(1),
    '{"K": {"day": "closed"}}') -> 'problems') p where p ->> 'code' = 'hours_taken'),
  'Kadikoy already has Closed on ' || pg_temp.day_text(tests.week(1)) || ' (Plumbing). Only one post can set a location''s hours for a day.',
  'S4: and the drawer says which post holds them');
select is(pg_temp.try($$select pg_temp.publish_seen('ayse', 'Open day', tests.week(1), '{"K": {"day": "open"}}')$$),
  'ok', 'S4: another post that keeps the usual hours that day is fine');

-- 11. K18: unavailable after publishing ---------------------------------------------------------

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

-- Both ends name their half, even on the same side of noon (Mert, 2026-10-12).
select is(app_private.announcement_hours_text('16:00', '22:00', '12h'), '4:00 PM–10:00 PM',
  'Hours: a 12h workspace writes AM/PM on both ends');
select is(app_private.announcement_hours_text('00:30', '08:00', '12h'), '12:30 AM–8:00 AM',
  'Hours: the morning too');
select is(app_private.announcement_hours_text('16:00', '22:00', '24h'), '16:00–22:00',
  'Hours: a 24h workspace writes no AM/PM');

select * from finish();
rollback;
