begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- BL-768, KK-174: ending someone's employment opens the published shifts they
-- have not started yet. The managers of each location where a shift opened
-- hear which ones, once: "Ali's 2 shifts are unassigned". The person who left,
-- admins, other locations' managers and whoever ended the employment hear
-- nothing; a termination that opens no shift tells nobody. Nothing else
-- stands in for this notice: the follow-up rows nobody read are gone.

select tests.world('tm');
select tests.person('tm', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('tm', 'can', 'manager', array['B'], array['cook']);
select tests.person('tm', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('tm', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('tm', 'emre', 'employee', array['K'], array['cook']);
-- Ali works Monday and Tuesday at Kadikoy and Wednesday at Besiktas.
select tests.publish_week('tm', 1, '[
  {"label": "ali-k1", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "10:00", "end": "16:00"},
  {"label": "ali-k2", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "17:00", "end": "22:00"},
  {"label": "ali-b", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"}
]');

create function pg_temp.notices() returns setof public.notification_outbox language sql as $$
  select * from public.notification_outbox o
  where o.workspace_id = tests.id('tm') and o.type_key = 'schedule.termination.shifts_unassigned'
$$;
create function pg_temp.notice_for(person text) returns public.notification_outbox language sql as $$
  select * from pg_temp.notices() o where o.payload -> 'recipient_user_ids' ? tests.user('tm:' || person)::text
$$;

-- 1. Olcay (the owner) ends Ali's employment.
select lives_ok(
  format($$select public.terminate_employee_service(%L, %L, %L, localtimestamp, 'Europe/Istanbul', 'Employment ended', %L)$$,
    tests.user('tm:owner'), tests.id('tm'), tests.id('tm:ali'), tests.remember('tm:ali:termination:key', gen_random_uuid())),
  'the owner ends Ali''s employment');
select is((select employee_id from public.schedule_published_shifts where id = tests.id('tm:shift:ali-k1')), null::uuid,
  'Ali''s Monday Kadikoy shift is open');

select is((select count(*)::integer from pg_temp.notices()), 2,
  'one notice for the Kadikoy managers, one for the Besiktas managers');
select is(
  (select array(select jsonb_array_elements_text(o.payload -> 'recipient_user_ids')::uuid order by 1) from pg_temp.notice_for('ayse') o),
  array[tests.user('tm:ayse')],
  'the Kadikoy notice goes to Ayse only');
select is(
  (select array(select jsonb_array_elements_text(o.payload -> 'recipient_user_ids')::uuid order by 1) from pg_temp.notice_for('can') o),
  array[tests.user('tm:can')],
  'the Besiktas notice goes to Can only');
select is(
  (select count(*)::integer from pg_temp.notices() o
   where o.payload -> 'recipient_user_ids' ?| array[tests.user('tm:zeynep')::text, tests.user('tm:owner')::text, tests.user('tm:ali')::text]),
  0, 'the admin, the owner who ended it and Ali himself hear nothing');

select is(
  (select jsonb_build_object('title', o.payload ->> 'title', 'body', o.payload ->> 'body', 'preview', o.payload ->> 'safe_preview',
     'action_url', o.payload ->> 'action_url')
   from pg_temp.notice_for('ayse') o),
  jsonb_build_object('title', 'Ali''s 2 shifts are unassigned',
    'body', to_char(tests.week(1), 'Dy, Mon FMDD') || ', 10:00 AM–4:00 PM (Kadikoy); '
      || to_char(tests.week(1) + 1, 'Dy, Mon FMDD') || ', 5:00 PM–10:00 PM (Kadikoy)',
    'preview', 'A termination left shifts open.',
    'action_url', '/app/schedule?date=' || tests.week(1)::text),
  'Ayse''s notice names Ali, the two Kadikoy shifts by day, hours and location, and opens that week''s Schedule');
select is((select o.payload ->> 'title' from pg_temp.notice_for('can') o), 'Ali''s shift is unassigned',
  'Can''s notice counts the one Besiktas shift');

-- The notice reaches Ayse's notification list.
update public.notification_outbox set status = 'leased', lease_owner = 'bl768-test', lease_expires_at = now() + interval '1 minute'
where id = (select o.id from pg_temp.notice_for('ayse') o);
select public.process_notification_outbox_service('bl768-test', o.id) from pg_temp.notice_for('ayse') o;
select is(
  (select count(*)::integer from public.notifications n where n.workspace_id = tests.id('tm')
    and n.recipient_user_id = tests.user('tm:ayse') and n.title = 'Ali''s 2 shifts are unassigned'),
  1, 'Ayse finds it in her notifications');

-- 2. Sending the same termination again tells nobody twice.
select lives_ok(
  format($$select public.terminate_employee_service(%L, %L, %L, localtimestamp, 'Europe/Istanbul', 'Employment ended', %L)$$,
    tests.user('tm:owner'), tests.id('tm'), tests.id('tm:ali'), tests.id('tm:ali:termination:key')),
  'the same termination sent again replays');
select is((select count(*)::integer from pg_temp.notices()), 2, 'and sends no second notice');

-- 3. Ending the employment of somebody with no shift ahead tells nobody.
select lives_ok(
  format($$select public.terminate_employee_service(%L, %L, %L, localtimestamp, 'Europe/Istanbul', 'Employment ended', gen_random_uuid())$$,
    tests.user('tm:owner'), tests.id('tm'), tests.id('tm:emre')),
  'the owner ends Emre''s employment');
select is((select count(*)::integer from pg_temp.notices()), 2, 'Emre had no shift ahead: nobody is told');

-- 4. The notice is the follow-up; the rows nobody read are gone, and the
-- notification check finds its producer and template.
select ok(
  to_regclass('public.employee_offboarding_followups') is null
  and (select not exists (select 1 from jsonb_array_elements((r -> 'active_catalog_without_producer') || (r -> 'active_catalog_without_template')) x
    where x ->> 'type_key' = 'schedule.termination.shifts_unassigned')
   from (select public.reconcile_notification_platform_service() r) q),
  'the unread follow-up table is gone and the notice has its producer and template');

select * from finish();
rollback;
