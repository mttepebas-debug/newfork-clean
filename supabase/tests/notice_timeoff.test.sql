begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Notification panel, slice 2 (KARARLAR S-247 (3)), time off: every person's card is their own.
--   (a) The reminder a day before a request starts (time_off.decision_reminder) leaves each decider it reaches
--       one open card for the request: the card that asked them before (time_off.requested) closes as
--       superseded, by nobody, and the reminder is the one that waits. Only the people reminded: a decider who
--       was asked but is not reminded keeps their card open, and another request's cards are not touched.
--   (b) An answer, a withdrawal or the start passing closes every decider's card for the request with the
--       outcome and who did it; a superseded card keeps saying it was superseded. Nothing is deleted.
--   Read state is per person: closing a card never marks it seen or read, and one person reading never
--   marks another's.
--
-- World tq: Kadikoy (K) and Besiktas (B), both Istanbul.
--   ayse, emre - managers at K            zeynep - admin
--   ali, can, deniz, fatma, gul - employees at K
--   bora - employee at B, which has no manager until mehmet is made one there

select tests.world('tq');
select tests.person('tq', 'ayse', 'manager', array['K'], array['general manager']);
select tests.person('tq', 'emre', 'manager', array['K'], array['general manager']);
select tests.person('tq', 'zeynep', 'admin', array['K'], array['general manager']);
select tests.person('tq', 'ali', 'employee', array['K'], array['cook']);
select tests.person('tq', 'can', 'employee', array['K'], array['cook']);
select tests.person('tq', 'deniz', 'employee', array['K'], array['cook']);
select tests.person('tq', 'fatma', 'employee', array['K'], array['cook']);
select tests.person('tq', 'gul', 'employee', array['K'], array['cook']);
select tests.person('tq', 'bora', 'employee', array['B'], array['cook']);
select tests.settle();

create temporary table fixture (key text primary key, value uuid);
create function pg_temp.ask(person text, first_day date) returns uuid language sql as $$
  select (public.ask_time_off_service(tests.user('tq:' || person), tests.id('tq'), 'vacation', first_day, first_day, true,
    null, null, 'Family visit', 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid
$$;
create function pg_temp.req(request_label text) returns public.time_off_requests language sql as $$
  select r from public.time_off_requests r where r.id = (select f.value from fixture f where f.key = req.request_label)
$$;
create function pg_temp.answer(person text, request_label text, verdict text) returns jsonb language sql as $$
  select public.answer_time_off_service(tests.user('tq:' || person), tests.id('tq'),
    (select f.value from fixture f where f.key = answer.request_label), verdict, null, (pg_temp.req(request_label)).revision,
    app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(pg_temp.req(request_label))))
$$;
-- ponytail: nothing in the product moves the clock and now() is fixed in a transaction; a request is moved by
-- hand to start `starts_in` from now, a day long, asked `asked_ago` ago.
create function pg_temp.place(request_label text, starts_in interval, asked_ago interval) returns void language sql as $$
  update public.time_off_requests r
  set starts_at = now() + starts_in, ends_at = now() + starts_in + interval '24 hours', created_at = now() - asked_ago
  where r.id = (select f.value from fixture f where f.key = place.request_label)
$$;
-- Every card asking about a request, one per person and type: 'type person outcome by whom', sorted.
create function pg_temp.cards(request_label text) returns text[] language sql as $$
  select coalesce(array_agg(x.card order by x.card), '{}') from (
    select replace(n.type_key, 'time_off.', '') || ' ' || split_part(w.label, ':', 2) || ' '
      || coalesce(n.resolution, 'open') || ' by ' || coalesce(split_part(b.label, ':', 2), '-') card
    from public.person_notifications n
    join tests.ids w on w.id = n.user_id and w.label like 'tq:%:user'
    left join tests.ids b on b.id = n.resolved_by and b.label like 'tq:%:user'
    where n.subject_type = 'time_off' and n.subject_id = (select f.value from fixture f where f.key = cards.request_label)
      and n.type_key in ('time_off.requested', 'time_off.decision_reminder')) x
$$;
-- What each person has done with their own card about a request: 'type person seen|unseen read|unread', sorted.
create function pg_temp.marks(request_label text, person text default null) returns text[] language sql as $$
  select coalesce(array_agg(x.mark order by x.mark), '{}') from (
    select replace(n.type_key, 'time_off.', '') || ' ' || split_part(w.label, ':', 2)
      || case when n.seen_at is null then ' unseen' else ' seen' end
      || case when n.read_at is null then ' unread' else ' read' end mark
    from public.person_notifications n
    join tests.ids w on w.id = n.user_id and w.label like 'tq:%:user'
    where n.subject_type = 'time_off' and n.subject_id = (select f.value from fixture f where f.key = marks.request_label)
      and n.type_key in ('time_off.requested', 'time_off.decision_reminder')
      and (marks.person is null or w.label = 'tq:' || marks.person || ':user')) x
$$;

-- The requests, asked for a day far ahead, then moved by hand.
insert into fixture values
  ('ali', pg_temp.ask('ali', tests.week(0) + 1)),
  ('can', pg_temp.ask('can', tests.week(0) + 1)),
  ('deniz', pg_temp.ask('deniz', tests.week(0) + 1)),
  ('fatma', pg_temp.ask('fatma', tests.week(0) + 1)),
  ('gul', pg_temp.ask('gul', tests.week(0) + 1)),
  ('bora', pg_temp.ask('bora', tests.week(0) + 1));

select is(pg_temp.cards('ali') || pg_temp.cards('bora'),
  array['requested ayse open by -', 'requested emre open by -', 'requested zeynep open by -'],
  'asked: both Kadikoy managers get Ali''s request; Besiktas has no manager, so the admin gets Bora''s');

-- Ayse reads her card about Ali's request; Emre opens his list and sees his, without reading them.
select public.mark_notifications_read_service(tests.user('tq:ayse'), tests.id('tq'), array(
  select n.id from public.person_notifications n
  where n.user_id = tests.user('tq:ayse') and n.type_key = 'time_off.requested'
    and n.subject_id = (select f.value from fixture f where f.key = 'ali')));
select public.mark_notifications_seen_service(tests.user('tq:emre'), tests.id('tq'));

-- Mehmet becomes Besiktas's manager: Bora's request is his to answer now, not the admin's.
select tests.person('tq', 'mehmet', 'manager', array['B'], array['general manager']);
select tests.settle();

-- A day before: Ali's, Can's, Deniz's, Fatma's and Bora's start in 20 hours, asked three days ago; Gul's starts
-- in three days, so nobody is reminded of it yet.
select pg_temp.place(x, interval '20 hours', interval '3 days') from unnest(array['ali', 'can', 'deniz', 'fatma', 'bora']) x;
select pg_temp.place('gul', interval '3 days', interval '3 days');
select app_private.time_off_requests_sweep();

-- (a) One open card per decider per request ------------------------------------------------------------------
select is(pg_temp.cards('ali'),
  array['decision_reminder ayse open by -', 'decision_reminder emre open by -',
        'requested ayse superseded by -', 'requested emre superseded by -'],
  '(a) each manager reminded keeps one open card for Ali''s request: the reminder; the card that asked them closes as superseded');
select is(
  (select count(*)::integer from public.person_notifications n
   where n.type_key = 'time_off.requested' and n.subject_id = (select f.value from fixture f where f.key = 'ali')
     and n.resolution = 'superseded' and n.resolved_at = now() and n.resolved_by is null),
  2, '(a) superseded now, by nobody');
select is(pg_temp.cards('can') || pg_temp.cards('deniz') || pg_temp.cards('fatma'),
  array['decision_reminder ayse open by -', 'decision_reminder emre open by -',
        'requested ayse superseded by -', 'requested emre superseded by -',
        'decision_reminder ayse open by -', 'decision_reminder emre open by -',
        'requested ayse superseded by -', 'requested emre superseded by -',
        'decision_reminder ayse open by -', 'decision_reminder emre open by -',
        'requested ayse superseded by -', 'requested emre superseded by -'],
  '(a) the same for Can''s, Deniz''s and Fatma''s');
select is(pg_temp.marks('ali'),
  array['decision_reminder ayse unseen unread', 'decision_reminder emre unseen unread',
        'requested ayse seen read', 'requested emre seen unread'],
  '(a) closing a card marks nothing: Ayse''s read card stays read, Emre''s seen card stays unread; the reminders are new');
select is(pg_temp.cards('bora'),
  array['decision_reminder mehmet open by -', 'requested zeynep open by -'],
  '(a) only the people reminded: Mehmet is reminded of Bora''s request; the admin, asked before him and not reminded, keeps hers open');
select is(pg_temp.cards('gul'),
  array['requested ayse open by -', 'requested emre open by -'],
  '(a) a request nobody is reminded of yet keeps its cards open');
select is(
  (select count(*)::integer from public.person_notifications n
   where n.subject_type = 'time_off' and n.subject_id = (select f.value from fixture f where f.key = 'ali')
     and n.user_id = tests.user('tq:ali')),
  0, '(a) Ali, who asked, has no card about his own request waiting');

-- (b) An answer closes every decider's card, with the outcome and who did it --------------------------------
select pg_temp.answer('ayse', 'ali', 'approve');
select is(pg_temp.cards('ali'),
  array['decision_reminder ayse approved by ayse', 'decision_reminder emre approved by ayse',
        'requested ayse superseded by -', 'requested emre superseded by -'],
  '(b) Ayse approves: both reminders close as approved by Ayse; the superseded cards stay superseded');
select is(pg_temp.marks('ali', 'emre'),
  array['decision_reminder emre unseen unread', 'requested emre seen unread'],
  '(b) Ayse''s answer marks nothing of Emre''s');
select is(pg_temp.cards('gul'),
  array['requested ayse open by -', 'requested emre open by -'],
  '(b) and Gul''s request, not answered, keeps its cards open');

select pg_temp.answer('emre', 'can', 'decline');
select is(pg_temp.cards('can'),
  array['decision_reminder ayse declined by emre', 'decision_reminder emre declined by emre',
        'requested ayse superseded by -', 'requested emre superseded by -'],
  '(b) Emre declines Can''s: both reminders close as declined by Emre');

select public.withdraw_time_off_service(tests.user('tq:deniz'), tests.id('tq'), (select f.value from fixture f where f.key = 'deniz'),
  (pg_temp.req('deniz')).revision);
select is(pg_temp.cards('deniz'),
  array['decision_reminder ayse withdrawn by deniz', 'decision_reminder emre withdrawn by deniz',
        'requested ayse superseded by -', 'requested emre superseded by -'],
  '(b) Deniz withdraws hers: both reminders close as withdrawn by Deniz');

-- Fatma's starts with nobody answering it: the next pass expires it.
select pg_temp.place('fatma', interval '-1 hour', interval '3 days');
select app_private.time_off_requests_sweep();
select is((pg_temp.req('fatma')).status, 'expired', '(b) Fatma''s request expires at its start');
select is(pg_temp.cards('fatma'),
  array['decision_reminder ayse expired by -', 'decision_reminder emre expired by -',
        'requested ayse superseded by -', 'requested emre superseded by -'],
  '(b) and both reminders close as expired, by nobody');

select pg_temp.answer('mehmet', 'bora', 'approve');
select is(pg_temp.cards('bora'),
  array['decision_reminder mehmet approved by mehmet', 'requested zeynep approved by mehmet'],
  '(b) Mehmet approves Bora''s: his reminder and the admin''s card close as approved by Mehmet');

select is(
  (select count(*)::integer from public.person_notifications n
   where n.subject_type = 'time_off' and n.subject_id in (select f.value from fixture f where f.key <> 'gul')
     and n.type_key in ('time_off.requested', 'time_off.decision_reminder')),
  18, '(b) nothing is deleted: four cards for each of the four Kadikoy requests answered or over, two for Bora''s');

select * from finish();
rollback;
