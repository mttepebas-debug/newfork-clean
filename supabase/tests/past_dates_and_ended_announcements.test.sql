begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.7 C: an important date in the past is read-only like a past Schedule
-- week, and a change to one that runs into the past only changes what is
-- ahead (K11); a past closed day stays on the Schedule (KK-97); an
-- announcement past its end leaves the inboxes and reads as expired (K12); a
-- scheduled one that could not go out says so (KK-98).
-- Rules: KARARLAR "Duyurular ve önemli tarihler" K11, K12; KK-97, KK-98.

-- 1. The world ------------------------------------------------------------------------

select tests.world('p');
select tests.person('p', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('p', 'emre', 'employee', array['K'], array['cook']);

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
  select tests.user('p:' || person)
$$;

-- The first day of the Schedule's editable week: the line K11 draws.
create function pg_temp.b() returns date language sql as $$
  select public.schedule_current_week_start_service(tests.id('p'))
$$;

create function pg_temp.save_date(person text, title text, id uuid default null,
  starts date default current_date + 60, ends date default null, kind text default 'event',
  recurrence text default 'none') returns uuid language sql as $$
  select (public.save_important_date_service(pg_temp.u(person), tests.id('p'), id, title, kind, starts,
    coalesce(ends, starts), recurrence, '', true, array[tests.id('p:K')],
    (select d.revision from public.important_dates d where d.id = save_date.id)) ->> 'important_date_id')::uuid
$$;

create function pg_temp.set_date(person text, id uuid, action text) returns jsonb language sql as $$
  select public.set_important_date_state_service(pg_temp.u(person), tests.id('p'), id, action)
$$;

-- A date written while its days were still ahead: put in place directly, the
-- way an older save left it.
create function pg_temp.old_date(title text, starts date, ends date, kind text default 'event',
  recurrence text default 'none') returns uuid language sql as $$
  insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
    affects_scheduling, location_ids, location_id, created_by, updated_by)
  values (tests.id('p'), title, kind::public.important_date_type, starts, ends,
    recurrence::public.important_date_recurrence, '', true, array[tests.id('p:K')], tests.id('p:K'),
    pg_temp.u('owner'), pg_temp.u('owner'))
  returning id
$$;

create function pg_temp.listed(person text, id uuid) returns jsonb language sql as $$
  select d from jsonb_array_elements(public.read_settings_important_dates_service(pg_temp.u(person), tests.id('p')) -> 'dates') d
  where (d ->> 'id')::uuid = id
$$;

-- 2. K11: nobody writes a day before the editable week ------------------------------------

select is(pg_temp.try($$select pg_temp.save_date('owner', 'Last month''s tasting', starts => pg_temp.b() - 30)$$),
  'P0001 important_date.past', 'K11: the owner cannot add a date that is already past');
select is(pg_temp.try($$select pg_temp.save_date('owner', 'Half past', starts => pg_temp.b() - 3, ends => pg_temp.b() + 3)$$),
  'P0001 important_date.past', 'K11: nor one that starts before this week');
select is(pg_temp.try($$select pg_temp.save_date('owner', 'This week', starts => pg_temp.b(), ends => pg_temp.b() + 1)$$),
  'ok', 'K11: a date in this week is still the owner''s to add (the Schedule''s line)');

select tests.remember('p:date:past', pg_temp.old_date('Inventory day', pg_temp.b() - 20, pg_temp.b() - 20));
select is(pg_temp.try(format($$select pg_temp.save_date('owner', 'Inventory day, renamed', id => %L, starts => %L)$$,
  tests.id('p:date:past'), pg_temp.b() - 20)), 'P0001 important_date.past',
  'K11: last month''s "Inventory day" is read-only, even to the owner');
select is(pg_temp.try(format($$select pg_temp.set_date('owner', %L, 'archive')$$, tests.id('p:date:past'))),
  'P0001 important_date.past', 'K11: it cannot be archived');
select is(pg_temp.try(format($$select pg_temp.set_date('owner', %L, 'unpublish')$$, tests.id('p:date:past'))),
  'P0001 important_date.past', 'K11: nor unpublished');
select is(pg_temp.listed('owner', tests.id('p:date:past')) ->> 'is_past', 'true', 'K11: Settings reads it as past');
select is(pg_temp.listed('owner', tests.id('p:date:past')) ->> 'can_edit', 'false', 'K11: nobody may edit it');
select is(pg_temp.listed('owner', tests.id('p:date:past')) ->> 'can_archive', 'false', 'K11: nor archive it');
select is((public.read_settings_important_dates_service(pg_temp.u('owner'), tests.id('p')) ->> 'locked_before')::date,
  pg_temp.b(), 'K11: Settings is told where the line is, to keep the date picker off past days');

-- A week-long date that began last week: the days already gone stay as they
-- were, the change starts this week.
select tests.remember('p:date:week', pg_temp.old_date('Inventory week', pg_temp.b() - 3, pg_temp.b() + 3));
select is(pg_temp.try(format($$select pg_temp.save_date('owner', 'Stock count', id => %L, starts => %L, ends => %L)$$,
  tests.id('p:date:week'), pg_temp.b() - 3, pg_temp.b() + 3)), 'ok',
  'K11: the owner renames a date that began last week');
select is((select (d.title, d.starts_on, d.ends_on)::text from public.important_dates d where d.id = tests.id('p:date:week')),
  ('Stock count', pg_temp.b(), pg_temp.b() + 3)::text, 'K11: the change covers this week on');
select is((select count(*)::integer from public.important_dates d where d.workspace_id = tests.id('p')
           and d.title = 'Inventory week' and d.starts_on = pg_temp.b() - 3 and d.ends_on = pg_temp.b() - 1
           and d.recurrence = 'none' and d.status = 'published'), 1,
  'K11: last week''s days stay "Inventory week", as they were');
select is((select c.before ->> 'starts_on' from public.important_date_changes c where c.important_date_id = tests.id('p:date:week')
           and c.action = 'updated'), (pg_temp.b() - 3)::text, 'K11: its history keeps the date as it was, from last week');
select is(pg_temp.try(format($$select pg_temp.save_date('owner', 'Stock count', id => %L, starts => %L, ends => %L)$$,
  tests.id('p:date:week'), pg_temp.b() - 1, pg_temp.b() + 3)), 'P0001 important_date.past',
  'K11: moving its start to a past day is refused');

-- A yearly date: past years keep their own record, the change starts with
-- this year's day.
select tests.remember('p:date:yearly', pg_temp.old_date('Founders day', (pg_temp.b() + 3 - interval '1 year')::date,
  (pg_temp.b() + 3 - interval '1 year')::date, recurrence => 'annual'));
select is(pg_temp.try(format($$select pg_temp.save_date('owner', 'Founders night', id => %L, starts => %L, recurrence => 'annual')$$,
  tests.id('p:date:yearly'), (pg_temp.b() + 3 - interval '1 year')::date)), 'ok', 'K11: the owner renames a yearly date');
select is((select (d.title, d.starts_on, d.recurrence::text)::text from public.important_dates d where d.id = tests.id('p:date:yearly')),
  ('Founders night', pg_temp.b() + 3, 'annual')::text, 'K11: the yearly date now starts with this year''s day');
select is((select count(*)::integer from public.important_dates d where d.workspace_id = tests.id('p')
           and d.title = 'Founders day' and d.starts_on = (pg_temp.b() + 3 - interval '1 year')::date and d.recurrence = 'none'), 1,
  'K11: last year''s day stays "Founders day", a record of its own');
select tests.remember('p:date:new-yearly', pg_temp.save_date('owner', 'Opening day', starts => (pg_temp.b() + 5 - interval '2 years')::date,
  recurrence => 'annual'));
select is((select d.starts_on from public.important_dates d where d.id = tests.id('p:date:new-yearly')), pg_temp.b() + 5,
  'K11: a new yearly date given its first, past year starts with this year''s day');

select tests.remember('p:date:ahead', pg_temp.save_date('owner', 'Menu tasting'));
select pg_temp.save_date('owner', 'Menu tasting, moved', id => tests.id('p:date:ahead'), starts => current_date + 61);
select is((select count(*)::integer from public.important_dates d where d.workspace_id = tests.id('p') and d.title like 'Menu tasting%'), 1,
  'K11: a date wholly ahead changes in place');

-- 3. KK-97: a closed day stays on the Schedule after its week has passed ---------------------

select tests.remember('p:date:closed-past', pg_temp.old_date('Water cut', pg_temp.b() - 6, pg_temp.b() - 6, kind => 'closed_day'));
select is((select count(*)::integer from public.schedule_closures c where c.workspace_id = tests.id('p')
           and c.location_id = tests.id('p:K') and c.closed_date = pg_temp.b() - 6), 1,
  'KK-97: last week''s closed day still closes that day on the Schedule');
select is((public.get_schedule_read_model_service(pg_temp.u('owner'), tests.id('p'), pg_temp.b() - 6) -> 'closures' -> 0 ->> 'title'),
  'Water cut', 'KK-97: the Schedule''s read of last week shows it');
select is(pg_temp.try(format($$select pg_temp.set_date('owner', %L, 'archive')$$, tests.id('p:date:closed-past'))),
  'P0001 important_date.past', 'KK-97: and it is locked (K11)');

-- 4. K12: an announcement past its end leaves the inboxes ---------------------------------

create function pg_temp.deliver() returns void language plpgsql as $$
declare queued uuid;
begin
  for queued in select o.id from public.notification_outbox o
                where o.workspace_id = tests.id('p') and o.status in ('pending', 'retry') loop
    update public.notification_outbox
    set status = 'leased', lease_owner = 'past-dates', lease_expires_at = now() + interval '1 minute'
    where notification_outbox.id = queued;
    perform public.process_notification_outbox_service('past-dates', queued);
  end loop;
end;
$$;

create function pg_temp.has_notice(person text, subject uuid) returns boolean language sql as $$
  select exists (
    select 1 from public.notification_inbox_items item
    join public.notification_recipients recipient on recipient.id = item.recipient_projection_id
    join public.notification_outbox outbox
      on outbox.event_id = recipient.event_id and outbox.workspace_id = recipient.workspace_id
    where outbox.subject_id = subject::text and recipient.recipient_user_id = pg_temp.u(person)
      and item.visibility_state = 'visible')
$$;

create function pg_temp.listed_ann(person text, id uuid) returns jsonb language sql as $$
  select a from jsonb_array_elements(public.get_announcements_service(pg_temp.u(person), tests.id('p')) -> 'announcements') a
  where (a ->> 'id')::uuid = id
$$;

create function pg_temp.publish_ann(person text, id uuid) returns jsonb language sql as $$
  select public.publish_announcement_service(pg_temp.u(person), tests.id('p'), id,
    (select a.revision from public.announcements a where a.id = publish_ann.id))
$$;

select tests.remember('p:ann:tasting', (public.save_announcement_audience_service(pg_temp.u('ayse'), tests.id('p'), null, null,
  'New menu tasting', 'Tasting on Friday', 'general', array['employee'], array[tests.id('p:K')], null,
  now() + interval '1 day', null, '{}', '{}') ->> 'announcement_id')::uuid);
select pg_temp.publish_ann('ayse', tests.id('p:ann:tasting'));
select pg_temp.deliver();
select ok(pg_temp.has_notice('emre', tests.id('p:ann:tasting')), 'K12: while it runs, Emre has the notice');
-- ponytail: its end comes by hand; the rule under test is the release's.
update public.announcements set publish_at = now() - interval '1 hour', published_at = now() - interval '1 hour',
  expires_at = now() - interval '1 minute' where id = tests.id('p:ann:tasting');
select app_private.announcement_release(tests.id('p'));
select ok(not pg_temp.has_notice('emre', tests.id('p:ann:tasting')), 'K12: past its end, it leaves Emre''s inbox');
select is((select cardinality(a.delivered_to) from public.announcements a where a.id = tests.id('p:ann:tasting')), 0,
  'K12: nobody holds it any more');
select is(pg_temp.listed_ann('ayse', tests.id('p:ann:tasting')) ->> 'display_status', 'expired',
  'K12: Ayse, who wrote it, sees it as expired');
select is(pg_temp.listed_ann('owner', tests.id('p:ann:tasting')) ->> 'display_status', 'expired',
  'K12: so does the owner');
select is(pg_temp.listed_ann('emre', tests.id('p:ann:tasting')), null, 'K12: Emre no longer sees it');
select is((select count(*)::integer from public.notification_outbox o where o.subject_id = tests.id('p:ann:tasting')::text
           and o.status in ('pending', 'retry')), 0, 'K12: the release tells nobody again');
select app_private.announcement_release(tests.id('p'));
select is((select count(*)::integer from public.notification_outbox o where o.subject_id = tests.id('p:ann:tasting')::text
           and o.status in ('pending', 'retry')), 0, 'K12: nor does the next minute');

select tests.remember('p:ann:open-ended', (public.save_announcement_audience_service(pg_temp.u('ayse'), tests.id('p'), null, null,
  'Open ended', 'No end', 'general', array['employee'], array[tests.id('p:K')], null, null, null, '{}', '{}') ->> 'announcement_id')::uuid);
select pg_temp.publish_ann('ayse', tests.id('p:ann:open-ended'));
select is(pg_temp.listed_ann('ayse', tests.id('p:ann:open-ended')) ->> 'display_status', 'published',
  'K12: one without an end stays published');

-- 5. KK-98: a scheduled announcement that could not go out says so -----------------------

select tests.remember('p:ann:due', (public.save_announcement_audience_service(pg_temp.u('ayse'), tests.id('p'), null, null,
  'Due at nine', 'Morning brief', 'general', array['employee'], array[tests.id('p:K')], now() + interval '1 hour',
  null, null, '{}', '{}') ->> 'announcement_id')::uuid);
select pg_temp.publish_ann('ayse', tests.id('p:ann:due'));
select is(pg_temp.listed_ann('ayse', tests.id('p:ann:due')) ->> 'display_status', 'scheduled', 'KK-98: it waits for nine');
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('p:ann:due');
-- ponytail: the outbox refuses this one notice inside the test only; the rule
-- under test is what the release does when publishing fails.
do $$ begin
  execute format('alter table public.notification_outbox add constraint past_dates_refuses check (subject_id <> %L) not valid',
    tests.id('p:ann:due')::text);
end $$;
select app_private.announcement_release(tests.id('p'));
alter table public.notification_outbox drop constraint past_dates_refuses;
select is((select a.status::text from public.announcements a where a.id = tests.id('p:ann:due')), 'scheduled',
  'KK-98: it did not go out');
select ok((select a.release_error from public.announcements a where a.id = tests.id('p:ann:due')) like '%past_dates_refuses%',
  'KK-98: the error is kept with it');
select is(pg_temp.listed_ann('ayse', tests.id('p:ann:due')) ->> 'display_status', 'publish_failed',
  'KK-98: Ayse, who wrote it, sees that it could not be published');
select is(pg_temp.listed_ann('ayse', tests.id('p:ann:due')) ->> 'publish_error_code', 'failed',
  'KK-98: and why, as a code the screen words');
select is(pg_temp.listed_ann('owner', tests.id('p:ann:due')) ->> 'display_status', 'publish_failed', 'KK-98: so does the owner');
select is(pg_temp.listed_ann('emre', tests.id('p:ann:due')), null, 'KK-98: Emre sees nothing of it');
select public.save_announcement_audience_service(pg_temp.u('ayse'), tests.id('p'), tests.id('p:ann:due'),
  (select a.revision from public.announcements a where a.id = tests.id('p:ann:due')),
  'Due at nine', 'Morning brief', 'general', array['employee'], array[tests.id('p:K')], now() - interval '1 minute',
  null, null, '{}', '{}');
select is((select a.release_error from public.announcements a where a.id = tests.id('p:ann:due')), null,
  'KK-98: saving it again clears the error');
select is(pg_temp.listed_ann('ayse', tests.id('p:ann:due')) ->> 'display_status', 'published',
  'KK-98: and it goes out at the next try');

select * from finish();
rollback;
