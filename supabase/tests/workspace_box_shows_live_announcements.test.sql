begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- K28: the Announcements box on Workspace shows only what is live. An
-- archived one, one past its end ("Expired") and one that could not go out
-- ("Couldn't publish") leave the box and stay in the Announcements list.
-- Rules: KARARLAR K28 (BL-564), K12, KK-98.

select tests.world('k');
select tests.person('k', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('k', 'emre', 'employee', array['K'], array['cook']);

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('k:' || person)
$$;

create function pg_temp.post(title text) returns uuid language sql as $$
  select (public.save_announcement_audience_service(pg_temp.u('ayse'), tests.id('k'), null, null,
    title, title || ' body', 'general', array['employee'], array[tests.id('k:K')], null, null, null,
    '{}', '{}') ->> 'announcement_id')::uuid
$$;

create function pg_temp.publish(id uuid) returns jsonb language sql as $$
  select public.publish_announcement_service(pg_temp.u('ayse'), tests.id('k'), id,
    (select a.revision from public.announcements a where a.id = publish.id))
$$;

create function pg_temp.in_box(person text, id uuid) returns boolean language sql as $$
  select exists (
    select 1 from jsonb_array_elements(
      public.get_workspace_dashboard_service(pg_temp.u(person), tests.id('k')) -> 'announcements') a
    where (a ->> 'id')::uuid = id)
$$;

create function pg_temp.in_list(person text, id uuid) returns boolean language sql as $$
  select exists (
    select 1 from jsonb_array_elements(
      public.get_announcements_service(pg_temp.u(person), tests.id('k')) -> 'announcements') a
    where (a ->> 'id')::uuid = id)
$$;

-- Live: published, no end.
select tests.remember('k:ann:live', pg_temp.post('Staff meal'));
select pg_temp.publish(tests.id('k:ann:live'));

-- Archived after it went out.
select tests.remember('k:ann:archived', pg_temp.post('Inventory day'));
select pg_temp.publish(tests.id('k:ann:archived'));
select public.set_announcement_state_service(pg_temp.u('ayse'), tests.id('k'), tests.id('k:ann:archived'),
  (select a.revision from public.announcements a where a.id = tests.id('k:ann:archived')), 'archive');

-- Expired: ran past its end (ponytail: the transaction's now() is fixed, so the
-- dates are moved back by hand, as past_dates_and_ended_announcements does).
select tests.remember('k:ann:expired', pg_temp.post('New menu tasting'));
select pg_temp.publish(tests.id('k:ann:expired'));
update public.announcements set publish_at = now() - interval '1 hour', published_at = now() - interval '1 hour',
  expires_at = now() - interval '1 minute' where id = tests.id('k:ann:expired');

-- Couldn't publish: scheduled, due, and its release failed (KK-98).
select tests.remember('k:ann:failed', pg_temp.post('Patio opens'));
update public.announcements set status = 'scheduled', publish_at = now() - interval '1 minute',
  release_failed_at = now(), release_error = 'P0001 test' where id = tests.id('k:ann:failed');

select is(public.get_announcements_service(pg_temp.u('ayse'), tests.id('k')) -> 'announcements' @>
  jsonb_build_array(jsonb_build_object('id', tests.id('k:ann:expired'), 'display_status', 'expired'),
                    jsonb_build_object('id', tests.id('k:ann:failed'), 'display_status', 'publish_failed')),
  true, 'the fixture holds an expired and a couldn''t-publish announcement');

select ok(pg_temp.in_box('ayse', tests.id('k:ann:live')), 'K28: a live announcement is in Ayse''s Workspace box');
select ok(pg_temp.in_box('owner', tests.id('k:ann:live')), 'K28: and in the owner''s');
select ok(not pg_temp.in_box('ayse', tests.id('k:ann:archived')), 'K28: an archived one leaves the box');
select ok(not pg_temp.in_box('ayse', tests.id('k:ann:expired')), 'K28: an expired one leaves the box');
select ok(not pg_temp.in_box('ayse', tests.id('k:ann:failed')), 'K28: one that couldn''t publish leaves the box');
select ok(not pg_temp.in_box('owner', tests.id('k:ann:archived'))
          and not pg_temp.in_box('owner', tests.id('k:ann:expired'))
          and not pg_temp.in_box('owner', tests.id('k:ann:failed')),
  'K28: the owner''s box leaves out the same three');

select ok(pg_temp.in_list('ayse', tests.id('k:ann:archived'))
          and pg_temp.in_list('ayse', tests.id('k:ann:expired'))
          and pg_temp.in_list('ayse', tests.id('k:ann:failed')),
  'K28: all three stay in the Announcements list');

select * from finish();
rollback;
