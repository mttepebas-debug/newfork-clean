begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EKRAN-08 (one record): a post whose last day is over is Past. A past post is
-- read-only and can only be archived (Mert, 2026-10-12); a past closed day
-- stays on the Schedule (KK-97); a past post leaves the inboxes and stays in
-- the lists as Past (K12); a started post keeps its days, its locations and its
-- repeat, and only its text, boxes, people and Ends change; a yearly post that
-- went Past opens next year's (K22); a scheduled post that couldn't go out says
-- why and tells whoever scheduled it, the owner when they are gone (K21,
-- KK-98); acknowledgements stay unless the writer asks again (K27).

-- 1. The world ------------------------------------------------------------------------

select tests.world('p');
select tests.person('p', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('p', 'mina', 'manager', array['K'], array['cook']);
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

create function pg_temp.rev(id uuid) returns integer language sql as $$
  select a.revision from public.announcements a where a.id = rev.id
$$;

-- The drawer's fields for a post at Kadikoy; extra overrides any of them.
create function pg_temp.payload(title text, starts date default current_date + 10, ends date default null,
  extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('title', title, 'body', title || ' body', 'starts_on', starts, 'ends_on', ends,
    'locations', jsonb_build_array(jsonb_build_object('location_id', tests.id('p:K'), 'day', 'open'))) || extra
$$;

create function pg_temp.save(person text, id uuid, p jsonb, intent text) returns jsonb language sql as $$
  select public.save_announcement_service(pg_temp.u(person), tests.id('p'), id, pg_temp.rev(id), p, intent)
$$;

create function pg_temp.post(person text, p jsonb) returns uuid language sql as $$
  select (pg_temp.save(person, null, p, 'draft') ->> 'announcement_id')::uuid
$$;

create function pg_temp.publish(person text, p jsonb) returns uuid language plpgsql as $$
declare made uuid := pg_temp.post(person, p);
begin
  perform pg_temp.save(person, made, p, 'publish');
  return made;
end;
$$;

create function pg_temp.set_state(person text, id uuid, action text) returns jsonb language sql as $$
  select public.set_announcement_state_service(pg_temp.u(person), tests.id('p'), id, pg_temp.rev(id), action)
$$;

create function pg_temp.listed(person text, id uuid) returns jsonb language sql as $$
  select a from jsonb_array_elements(public.get_announcements_service(pg_temp.u(person), tests.id('p')) -> 'announcements') a
  where (a ->> 'id')::uuid = id
$$;

-- ponytail: the transaction's now() is fixed, so a post's days are moved back
-- by hand; the rules under test are what the reads and the release make of it.
create function pg_temp.move_back(id uuid, starts date, ends date) returns void language sql as $$
  update public.announcements set starts_on = starts, ends_on = ends where announcements.id = move_back.id
$$;

-- 2. Past posts are read-only; only Archive -------------------------------------------

select is(pg_temp.try($$select pg_temp.publish('owner', pg_temp.payload('Last month''s tasting', current_date - 30))$$),
  '22023 announcement.start_past', 'a new post cannot start before today');
select is(pg_temp.try($$select pg_temp.post('owner', pg_temp.payload('Old idea', current_date - 30))$$),
  'ok', 'a draft may hold any day: it needs only a title');

select tests.remember('p:ann:past', pg_temp.publish('owner', pg_temp.payload('Inventory day')));
select pg_temp.move_back(tests.id('p:ann:past'), current_date - 20, current_date - 20);
select is(pg_temp.listed('owner', tests.id('p:ann:past')) ->> 'display_status', 'past', 'last month''s "Inventory day" is Past');
select is(pg_temp.listed('owner', tests.id('p:ann:past')) ->> 'can_edit', 'false', 'nobody may edit it, not even the owner');
select is(pg_temp.listed('owner', tests.id('p:ann:past')) ->> 'can_unpublish', 'false', 'nor unpublish it');
select is(pg_temp.listed('owner', tests.id('p:ann:past')) ->> 'can_archive', 'true', 'the owner may archive it');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('Inventory day, renamed', current_date - 20), 'save')$$,
  tests.id('p:ann:past'))), 'PT409 announcement.read_only', 'a save on it is refused as read-only');
select is(pg_temp.try(format($$select pg_temp.set_state('owner', %L, 'unpublish')$$, tests.id('p:ann:past'))),
  'PT409 announcement.read_only', 'so is Unpublish');
select is(pg_temp.try(format($$select public.preview_announcement_service(pg_temp.u('owner'), tests.id('p'), %L, '{}')$$,
  tests.id('p:ann:past'))), 'PT409 announcement.read_only', 'and its drawer has nothing to check');
select is(pg_temp.set_state('owner', tests.id('p:ann:past'), 'archive') ->> 'display_status', 'archived', 'Archive is the one way out');
select is(pg_temp.try(format($$select pg_temp.set_state('owner', %L, 'archive')$$, tests.id('p:ann:past'))),
  'PT409 announcement.read_only', 'an archived post is done');

-- A post that has started: its text, boxes, people and Ends change; its days,
-- locations, event time and repeat stay.
select tests.remember('p:ann:week', pg_temp.publish('owner', pg_temp.payload('Inventory week', current_date + 10, current_date + 14)));
select pg_temp.move_back(tests.id('p:ann:week'), current_date - 2, current_date + 4);
select is(pg_temp.listed('owner', tests.id('p:ann:week')) ->> 'display_status', 'published', 'a post that began two days ago is still out');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('Stock count', current_date - 2, current_date + 6), 'save')$$,
  tests.id('p:ann:week'))), 'ok', 'the owner renames it and moves its Ends');
select is((select (a.title, a.starts_on, a.ends_on)::text from public.announcements a where a.id = tests.id('p:ann:week')),
  ('Stock count', current_date - 2, current_date + 6)::text, 'the change is in place: one record, its start as it was');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('Stock count', current_date - 1, current_date + 6), 'save')$$,
  tests.id('p:ann:week'))), '22023 announcement.started_locked', 'its start cannot move once it has started');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('Stock count', current_date - 2, current_date + 6,
  jsonb_build_object('locations', jsonb_build_array(jsonb_build_object('location_id', tests.id('p:K'), 'day', 'closed')))), 'save')$$,
  tests.id('p:ann:week'))), '22023 announcement.started_locked', 'nor can what it does to the location');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('Stock count', current_date - 2, current_date - 2), 'save')$$,
  tests.id('p:ann:week'))), '22023 announcement.ends_past', 'and Ends cannot go before today');

-- A post wholly ahead changes in place.
select tests.remember('p:ann:ahead', pg_temp.publish('owner', pg_temp.payload('Menu tasting', current_date + 60)));
select pg_temp.save('owner', tests.id('p:ann:ahead'), pg_temp.payload('Menu tasting, moved', current_date + 61), 'save');
select is((select count(*)::integer from public.announcements a where a.workspace_id = tests.id('p') and a.title like 'Menu tasting%'), 1,
  'a post wholly ahead changes in place');

-- 3. A yearly post that went Past opens next year's ------------------------------------

select tests.remember('p:ann:yearly', pg_temp.publish('owner', pg_temp.payload('Founders day', current_date + 10, null,
  '{"recurrence": "date"}')));
select pg_temp.move_back(tests.id('p:ann:yearly'), current_date - 3, current_date - 3);
select app_private.announcement_release(tests.id('p'));
select is((select (a.title, a.starts_on, a.status::text, a.recurrence)::text from public.announcements a
           where a.repeats_from = tests.id('p:ann:yearly')),
  ('Founders day', (current_date - 3 + interval '1 year')::date, 'scheduled', 'date')::text,
  'K22: last year''s "Founders day" went Past and next year''s is scheduled on the same date');
select ok((select a.publish_at < (select m.starts_at from app_private.announcement_moments(a) m) from public.announcements a
           where a.repeats_from = tests.id('p:ann:yearly')), 'K22: it goes out before its day starts');
select is((select a.scheduled_by from public.announcements a where a.repeats_from = tests.id('p:ann:yearly')), pg_temp.u('owner'),
  'K22: with the authority of whoever published this year''s');
select is(pg_temp.listed('owner', tests.id('p:ann:yearly')) ->> 'display_status', 'past', 'this year''s stays Past, a record of its own');
select app_private.announcement_release(tests.id('p'));
select is((select count(*)::integer from public.announcements a where a.repeats_from = tests.id('p:ann:yearly')), 1,
  'the next minute opens no second copy');

-- 4. KK-97: a past closed day stays on the Schedule -------------------------------------

select tests.remember('p:ann:closed-past', tests.closed_day(tests.id('p'), array[tests.id('p:K')], current_date - 6, current_date - 6,
  pg_temp.u('owner'), title => 'Water cut'));
select is((select count(*)::integer from public.schedule_closures c where c.workspace_id = tests.id('p')
           and c.location_id = tests.id('p:K') and c.closed_date = current_date - 6), 1,
  'KK-97: last week''s closed day still closes that day on the Schedule');
select is((select c ->> 'title' from jsonb_array_elements(
    public.get_schedule_read_model_service(pg_temp.u('owner'), tests.id('p'), current_date - 6) -> 'closures') c
  where (c ->> 'closed_date')::date = current_date - 6), 'Water cut', 'KK-97: the Schedule''s read of that week shows it');
select is(pg_temp.try(format($$select pg_temp.set_state('owner', %L, 'unpublish')$$, tests.id('p:ann:closed-past'))),
  'PT409 announcement.read_only', 'KK-97: it is Past, so it cannot be unpublished');

-- 5. K12: a post past its end leaves the inboxes and stays in the lists as Past ---------

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

create function pg_temp.notices_to(person text, subject uuid) returns integer language sql as $$
  select count(*)::integer from public.notification_outbox o
  where o.subject_id = subject::text and o.payload -> 'recipient_user_ids' ? pg_temp.u(person)::text
$$;

select tests.remember('p:ann:tasting', pg_temp.publish('ayse', pg_temp.payload('New menu tasting', current_date + 1, current_date + 2)));
select pg_temp.deliver();
select ok(pg_temp.has_notice('emre', tests.id('p:ann:tasting')), 'K12: while it runs, Emre has the notice');
select is(pg_temp.listed('emre', tests.id('p:ann:tasting')) ->> 'recipient_count', null, 'D3: Emre is not told how many it reached');
select is((pg_temp.listed('ayse', tests.id('p:ann:tasting')) ->> 'recipient_count')::integer, 3,
  'K24: Ayse sees how many it is out to: Mina, Emre and the owner, who work at Kadikoy; not herself (KK-89)');
select pg_temp.move_back(tests.id('p:ann:tasting'), current_date - 3, current_date - 2);
select app_private.announcement_release(tests.id('p'));
select ok(not pg_temp.has_notice('emre', tests.id('p:ann:tasting')), 'K12: past its end, it leaves Emre''s inbox');
select is((select cardinality(a.delivered_to) from public.announcements a where a.id = tests.id('p:ann:tasting')), 0,
  'K12: nobody holds it any more');
select is(pg_temp.listed('ayse', tests.id('p:ann:tasting')) ->> 'display_status', 'past', 'K12: Ayse, who wrote it, sees it as Past');
select is(pg_temp.listed('owner', tests.id('p:ann:tasting')) ->> 'display_status', 'past', 'K12: so does the owner');
select is(pg_temp.listed('emre', tests.id('p:ann:tasting')) ->> 'display_status', 'past', 'K12: Emre finds it under Past');
select is((select count(*)::integer from public.notification_outbox o where o.subject_id = tests.id('p:ann:tasting')::text
           and o.status in ('pending', 'retry')), 0, 'K12: the release tells nobody again');
select app_private.announcement_release(tests.id('p'));
select is((select count(*)::integer from public.notification_outbox o where o.subject_id = tests.id('p:ann:tasting')::text
           and o.status in ('pending', 'retry')), 0, 'K12: nor does the next minute');

-- D4: the owner's post at Kadikoy ran out; Ayse, Kadikoy's manager, may not
-- change it (K2) and still sees it as Past.
select tests.remember('p:ann:owner', pg_temp.publish('owner', pg_temp.payload('Owner note', current_date + 1)));
select pg_temp.move_back(tests.id('p:ann:owner'), current_date - 2, current_date - 2);
select is(pg_temp.listed('ayse', tests.id('p:ann:owner')) ->> 'can_archive', 'false', 'K2: Ayse may not archive the owner''s');
select is(pg_temp.listed('ayse', tests.id('p:ann:owner')) ->> 'display_status', 'past', 'K12: but she sees it Past');

select tests.remember('p:ann:open-ended', pg_temp.publish('ayse', pg_temp.payload('Open ended', null)));
select is(pg_temp.listed('ayse', tests.id('p:ann:open-ended')) ->> 'display_status', 'published',
  'K12: one without a day stays published');

-- 6. KK-98, K21: a scheduled post that could not go out says so -------------------------

create function pg_temp.schedule(person text, title text, starts date) returns uuid language plpgsql as $$
declare
  p jsonb := pg_temp.payload(title, starts) || jsonb_build_object('publish_at', now() + interval '1 hour');
  made uuid := pg_temp.post(person, p);
begin
  perform pg_temp.save(person, made, p, 'schedule');
  return made;
end;
$$;

-- Something broke while it went out: it stays scheduled and goes out at the next try.
select tests.remember('p:ann:due', pg_temp.schedule('ayse', 'Due at nine', current_date + 10));
select is(pg_temp.listed('ayse', tests.id('p:ann:due')) ->> 'display_status', 'scheduled', 'KK-98: it waits for nine');
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('p:ann:due');
-- ponytail: the outbox refuses this one notice inside the test only; the rule
-- under test is what the release does when publishing breaks.
do $$ begin
  execute format('alter table public.notification_outbox add constraint past_dates_refuses check (subject_id <> %L) not valid',
    tests.id('p:ann:due')::text);
end $$;
select app_private.announcement_release(tests.id('p'));
select is((select a.status::text from public.announcements a where a.id = tests.id('p:ann:due')), 'scheduled',
  'KK-98: it did not go out');
select ok((select a.release_error from public.announcements a where a.id = tests.id('p:ann:due')) like '%past_dates_refuses%',
  'KK-98: the error is kept with it');
select is(pg_temp.listed('ayse', tests.id('p:ann:due')) ->> 'display_status', 'scheduled',
  'KK-98: a break that is not about the post is tried again at each read, so it still reads Scheduled');
alter table public.notification_outbox drop constraint past_dates_refuses;
select is(pg_temp.listed('ayse', tests.id('p:ann:due')) ->> 'display_status', 'published', 'KK-98: and it goes out at the next try');
select is((select a.release_error from public.announcements a where a.id = tests.id('p:ann:due')), null, 'KK-98: with the error gone');

-- Its day came first: Couldn't publish, too late; Ayse, who scheduled it, hears it.
select tests.remember('p:ann:late', pg_temp.schedule('ayse', 'Too late', current_date + 10));
select pg_temp.move_back(tests.id('p:ann:late'), current_date - 1, current_date + 1);
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('p:ann:late');
select app_private.announcement_release(tests.id('p'));
select is(pg_temp.listed('ayse', tests.id('p:ann:late')) ->> 'display_status', 'publish_failed',
  'K21: it started before it could go out: Couldn''t publish');
select is(pg_temp.listed('ayse', tests.id('p:ann:late')) ->> 'publish_error_code', 'too_late', 'K21: and why, as a code the screen words');
select is(pg_temp.listed('owner', tests.id('p:ann:late')) ->> 'display_status', 'publish_failed', 'K21: the owner sees the same');
select is(pg_temp.listed('emre', tests.id('p:ann:late')), null, 'K21: Emre sees nothing of it');
select is(pg_temp.notices_to('ayse', tests.id('p:ann:late')), 1, 'K21: Ayse, who scheduled it, is told once');
select app_private.announcement_release(tests.id('p'));
select is(pg_temp.notices_to('ayse', tests.id('p:ann:late')), 1, 'K21: and not again the next minute');
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload('Too late', current_date + 3)
  || jsonb_build_object('publish_at', now() + interval '1 hour'), 'schedule')$$, tests.id('p:ann:late'))), 'ok',
  'KK-98: Ayse picks a new day and schedules it again');
select is(pg_temp.listed('ayse', tests.id('p:ann:late')) ->> 'display_status', 'scheduled', 'KK-98: which clears the failure');

-- Whoever scheduled it lost access: Couldn't publish, not allowed; the owner hears it.
select tests.remember('p:ann:refused', pg_temp.schedule('mina', 'Refused', current_date + 10));
select public.remove_employee_access_service(pg_temp.u('owner'), tests.id('p'), tests.id('p:mina'));
select tests.settle();
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('p:ann:refused');
select app_private.announcement_release(tests.id('p'));
select is(pg_temp.listed('owner', tests.id('p:ann:refused')) ->> 'publish_error_code', 'not_allowed',
  'K21: a release the core refused reads "not_allowed"');
select is(pg_temp.notices_to('owner', tests.id('p:ann:refused')), 1, 'K21: Mina is gone, so the owner is told');
select is(pg_temp.notices_to('mina', tests.id('p:ann:refused')), 0, 'K21: and not Mina');

-- 7. K27: acknowledgements stay unless the writer asks again ----------------------------

select tests.remember('p:ann:rules', pg_temp.publish('ayse', pg_temp.payload('House rules', null, null, '{"ask_ack": true}')));
select public.acknowledge_announcement_service(pg_temp.u('emre'), tests.id('p'), tests.id('p:ann:rules'));
select isnt(pg_temp.listed('emre', tests.id('p:ann:rules')) ->> 'acknowledged_at', null, 'Emre acknowledged the house rules');
select pg_temp.save('ayse', tests.id('p:ann:rules'), pg_temp.payload('House rules', null, null,
  '{"ask_ack": true, "body": "Version two"}'), 'save');
select isnt(pg_temp.listed('emre', tests.id('p:ann:rules')) ->> 'acknowledged_at', null,
  'K27: a new text alone keeps his acknowledgement');
select pg_temp.save('ayse', tests.id('p:ann:rules'), pg_temp.payload('House rules', null, null,
  '{"ask_ack": true, "body": "Version three", "reset_acknowledgements": true}'), 'save');
select is(pg_temp.listed('emre', tests.id('p:ann:rules')) ->> 'acknowledged_at', null,
  'K27: Ayse asks everyone again: his acknowledgement is cleared');
select is(pg_temp.listed('emre', tests.id('p:ann:rules')) ->> 'content_changed_since_acknowledged', 'true',
  'B2: and he is told it changed since he acknowledged');
select public.acknowledge_announcement_service(pg_temp.u('emre'), tests.id('p'), tests.id('p:ann:rules'));
select is(pg_temp.listed('emre', tests.id('p:ann:rules')) ->> 'content_changed_since_acknowledged', 'false',
  'B2: once he acknowledges the new text, it no longer says so');

select * from finish();
rollback;
