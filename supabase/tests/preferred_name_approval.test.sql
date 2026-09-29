begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- A preferred name was storable in name only: the column existed and a check
-- constraint held it at the empty string. A workspace now chooses between
-- answering these itself and letting them through, and this is both answers.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('1c000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferred-owner@example.test', '', '{}', '{}', now(), now()),
  ('1c000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferred-staff@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name)
values
  ('1c000000-0000-4000-8000-000000000001', 'Robin Vance'),
  ('1c000000-0000-4000-8000-000000000002', 'Alexander Okonkwo');

create temporary table preferred_target on commit drop as
select public.create_owner_workspace_service(
  '1c000000-0000-4000-8000-000000000001',
  'Preferred Name Co'
) as workspace_id;

insert into public.employee_profiles (id, workspace_id, user_id, employee_code, first_name, last_name, created_by)
values (
  '1d000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  '1c000000-0000-4000-8000-000000000002',
  'E-8001', 'Alexander', 'Okonkwo',
  '1c000000-0000-4000-8000-000000000001'
);

insert into public.workspace_memberships (workspace_id, user_id, role, role_id, status, employee_id)
select
  (select workspace_id from preferred_target),
  '1c000000-0000-4000-8000-000000000002',
  'employee'::public.workspace_role,
  (select id from public.workspace_roles
   where workspace_id = (select workspace_id from preferred_target)
     and system_key = 'employee'),
  'active'::public.membership_status,
  '1d000000-0000-4000-8000-000000000001';

-- A workspace that has never said anything lets them through.
select is(
  public.get_employee_name_settings_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  ),
  'auto',
  'a workspace that has not chosen lets a preferred name through'
);

select is(
  public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000002',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Alex'
  ),
  'published',
  'and on that setting the name is theirs straight away'
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'which the record shows, where the check constraint used to forbid it'
);

-- Telling the workspace is the point of the auto setting: the name changes
-- without asking, but not without saying.
select is(
  (select count(*)::integer from public.notification_outbox
   where workspace_id = (select workspace_id from preferred_target)
     and type_key = 'people.preferred_name.published'),
  1,
  'and the workspace is told even though nobody had to answer'
);

-- Now the workspace decides to answer them itself.
select public.set_employee_name_settings_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  'manager'
);

select is(
  public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000002',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Xander'
  ),
  'waiting',
  'on the other setting the same request waits instead'
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'and nothing about the record changes while it waits'
);

select is(
  (select requested_name from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  'Xander',
  'the workspace can see what it has been asked'
);

-- Refused: the name disappears and the person is not told, because being told
-- would make a refusal a conversation the workspace did not choose to have.
select public.decide_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  (select request_id from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  false
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'a refusal leaves the name that was already there'
);

select is(
  (select count(*)::integer from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  0,
  'and nothing is left waiting'
);

-- Approved: it takes effect.
select public.request_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000002',
  (select workspace_id from preferred_target),
  '1d000000-0000-4000-8000-000000000001',
  'Sasha'
);
select public.decide_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  (select request_id from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  true
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Sasha',
  'an approval is what puts the asked-for name on the record'
);

-- Whose name it is does not depend on who is senior.
select throws_ok(
  $$select public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Whatever'
  )$$,
  '42501',
  'this record belongs to somebody else',
  'and nobody asks for somebody else''s preferred name, owner included'
);

-- BL-099, BL-119: the notice has to reach somebody. It goes to the people the
-- core lets decide this person's preferred name (employee.decide_preferred_name:
-- in scope, ranked above them, not themselves), and it lands in their
-- notifications, not only in the queue.
select tests.world('pn');
select tests.person('pn', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('pn', 'can', 'manager', array['B'], array['cook']);
select tests.person('pn', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('pn', 'ali', 'employee', array['K'], array['cook']);
select tests.person('pn', 'bob', 'employee', array['K'], array['cook']);
select tests.person('pn', 'deniz', 'employee', array['B'], array['cook']);
select public.set_employee_name_settings_service(tests.user('pn:owner'), tests.id('pn'), 'manager');

create function pg_temp.notice(target_employee uuid, target_type text) returns setof public.notification_outbox language sql as $$
  select * from public.notification_outbox o
  where o.workspace_id = tests.id('pn') and o.type_key = target_type and o.subject_id = target_employee::text
$$;
create function pg_temp.recipients(target_employee uuid, target_type text) returns uuid[] language sql as $$
  select array(select jsonb_array_elements_text(o.payload -> 'recipient_user_ids')::uuid order by 1)
  from pg_temp.notice(target_employee, target_type) o
$$;
create function pg_temp.users(labels text[]) returns uuid[] language sql as $$
  select array(select tests.user('pn:' || l) from unnest(labels) l order by 1)
$$;
create function pg_temp.deliver(target_employee uuid, target_type text) returns void language sql as $$
  update public.notification_outbox set status = 'leased', lease_owner = 'g6-test', lease_expires_at = now() + interval '1 minute'
  where id in (select o.id from pg_temp.notice(target_employee, target_type) o);
  select public.process_notification_outbox_service('g6-test', o.id) from pg_temp.notice(target_employee, target_type) o;
$$;
create function pg_temp.delivered_to(target_employee uuid, target_type text) returns uuid[] language sql as $$
  select array(select n.recipient_user_id from public.notifications n
    join pg_temp.notice(target_employee, target_type) o on n.source_type = 'notification_event' and n.source_id = o.event_id
    where n.workspace_id = tests.id('pn') order by 1)
$$;

-- Deniz works at Besiktas: Can, Besiktas's manager, is asked. (Can is out of
-- scope for Ali below; this is the same Can being asked where he is in scope.)
select public.request_employee_preferred_name_service(tests.user('pn:deniz'), tests.id('pn'), tests.id('pn:deniz'), 'Den');
select ok(tests.user('pn:can') = any (pg_temp.recipients(tests.id('pn:deniz'), 'people.preferred_name.review_required')),
  'Besiktas''s manager is asked about a Besiktas person''s preferred name');

-- Ali works at Kadikoy.
select public.request_employee_preferred_name_service(tests.user('pn:ali'), tests.id('pn'), tests.id('pn:ali'), 'Al');
select is((select count(*)::integer from pg_temp.notice(tests.id('pn:ali'), 'people.preferred_name.review_required')), 1,
  'Ali''s request is one notice');
select is(pg_temp.recipients(tests.id('pn:ali'), 'people.preferred_name.review_required'),
  pg_temp.users(array['owner', 'ayse', 'zeynep']),
  'it asks the owner, the admin and Kadikoy''s manager: not Besiktas''s manager, not a coworker, not Ali');
select is(
  (select jsonb_build_object('title', o.payload ->> 'title', 'body', o.payload ->> 'body',
     'preview', o.payload ->> 'safe_preview', 'url', o.payload ->> 'action_url')
   from pg_temp.notice(tests.id('pn:ali'), 'people.preferred_name.review_required') o),
  jsonb_build_object('title', 'Preferred name to review', 'body', 'Ali Person asked to go by "Al".',
    'preview', 'A preferred name is waiting for review.', 'url', '/app/employees?employeeId=' || tests.id('pn:ali')),
  'the notice names the person and the name, and opens their record');
select pg_temp.deliver(tests.id('pn:ali'), 'people.preferred_name.review_required');
select is(pg_temp.delivered_to(tests.id('pn:ali'), 'people.preferred_name.review_required'),
  pg_temp.users(array['owner', 'ayse', 'zeynep']),
  'and it reaches the three of them in their notifications');

-- Zeynep, the admin, was asked about Ali; about her own name she is not.
select public.request_employee_preferred_name_service(tests.user('pn:zeynep'), tests.id('pn'), tests.id('pn:zeynep'), 'Zee');
select is(pg_temp.recipients(tests.id('pn:zeynep'), 'people.preferred_name.review_required'),
  pg_temp.users(array['owner']),
  'an admin''s own request asks the owner only: not herself, not a manager ranked below her');

-- BL-342: an approval tells the person, on their own account only; a refusal
-- stays silent.
create function pg_temp.pending(target_employee uuid) returns uuid language sql as $$
  select r.id from public.employee_preferred_name_requests r where r.employee_id = target_employee and r.status = 'pending'
$$;
select public.decide_employee_preferred_name_service(tests.user('pn:ayse'), tests.id('pn'), pg_temp.pending(tests.id('pn:ali')), true);
select is(pg_temp.recipients(tests.id('pn:ali'), 'people.preferred_name.approved'), pg_temp.users(array['ali']),
  'Ayse approves Ali''s name: the notice goes to Ali only');
select is(
  (select jsonb_build_object('title', o.payload ->> 'title', 'body', o.payload ->> 'body',
     'preview', o.payload ->> 'safe_preview', 'url', o.payload ->> 'action_url')
   from pg_temp.notice(tests.id('pn:ali'), 'people.preferred_name.approved') o),
  jsonb_build_object('title', 'Preferred name approved', 'body', 'You now go by "Al".',
    'preview', 'Your preferred name was approved.', 'url', '/app'),
  'saying which name is now theirs');
select pg_temp.deliver(tests.id('pn:ali'), 'people.preferred_name.approved');
select is(pg_temp.delivered_to(tests.id('pn:ali'), 'people.preferred_name.approved'), pg_temp.users(array['ali']),
  'and Ali finds it in his notifications');
select public.decide_employee_preferred_name_service(tests.user('pn:owner'), tests.id('pn'), pg_temp.pending(tests.id('pn:deniz')), false);
select is((select count(*)::integer from pg_temp.notice(tests.id('pn:deniz'), 'people.preferred_name.approved')), 0,
  'a refused name tells Deniz nothing');
-- Nobody is told about their own decision: the owner answers their own request.
-- Nobody ranks above the owner, so the owner's own request does not wait
-- (KK-17), and nobody is told it was approved.
select is(public.request_employee_preferred_name_service(tests.user('pn:owner'), tests.id('pn'), tests.id('pn:owner'), 'Olly'),
  'published', 'the owner''s own name does not wait for an answer');
select is((select count(*)::integer from pg_temp.notice(tests.id('pn:owner'), 'people.preferred_name.approved')), 0,
  'and the owner is not told it was approved');

-- On auto nobody answers, but the same people are told.
select public.set_employee_name_settings_service(tests.user('pn:owner'), tests.id('pn'), 'auto');
select public.request_employee_preferred_name_service(tests.user('pn:bob'), tests.id('pn'), tests.id('pn:bob'), 'Rob');
select pg_temp.deliver(tests.id('pn:bob'), 'people.preferred_name.published');
select is(pg_temp.delivered_to(tests.id('pn:bob'), 'people.preferred_name.published'),
  pg_temp.users(array['owner', 'ayse', 'zeynep']),
  'a name that took effect on its own reaches the same three');
select is(
  (select n.body from public.notifications n
   join pg_temp.notice(tests.id('pn:bob'), 'people.preferred_name.published') o on n.source_id = o.event_id
   where n.recipient_user_id = tests.user('pn:ayse')),
  'Bob Person now goes by "Rob".',
  'saying who now goes by what');

-- The owner's own name: nobody decides it, so nobody is told.
select public.request_employee_preferred_name_service(tests.user('pn:owner'), tests.id('pn'), tests.id('pn:owner'), 'Ol');
select is((select count(*)::integer from pg_temp.notice(tests.id('pn:owner'), 'people.preferred_name.published')), 0,
  'the owner''s own preferred name sends nothing');

select ok(
  (select not exists (select 1 from jsonb_array_elements((r -> 'active_catalog_without_producer') || (r -> 'active_catalog_without_template')) x
    where x ->> 'type_key' like 'people.preferred_name.%')
   from (select public.reconcile_notification_platform_service() r) q),
  'both preferred-name notices have their producer and template registered');

select * from finish();
rollback;
