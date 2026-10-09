begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- BL-114, FOUNDATION-B goal 8: every live update travels on a private channel.
-- Hosted allows private channels only (Realtime "Allow public access" off,
-- 2026-09-24). Realtime lets a browser join a private channel only if it could
-- read a broadcast on the topic from realtime.messages, and send one only if
-- it could insert it; this test asks both questions the way Realtime does
-- (the Schedule's own channels are in schedule_realtime_channels).

select tests.world('lu');
select tests.world('other');
select tests.person('lu', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('lu', 'ali', 'employee', array['K'], array['cook']);
select tests.person('lu', 'emre', 'employee', array['K'], array['cook']);

create function pg_temp.receives(person text, topic text)
returns boolean
language plpgsql
as $$
declare
  message_id uuid := gen_random_uuid();
  seen integer;
begin
  insert into realtime.messages (id, topic, extension, event, payload, private)
  values (message_id, topic, 'broadcast', 'probe', '{}'::jsonb, true);
  perform set_config('realtime.topic', topic, true);
  seen := tests.as_browser(tests.user(person), format('select 1 from realtime.messages where id = %L', message_id));
  perform set_config('realtime.topic', '', true);
  return seen > 0;
end;
$$;

create function pg_temp.sends(person text, topic text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('realtime.topic', topic, true);
  begin
    perform tests.as_browser(tests.user(person), format(
      'insert into realtime.messages (topic, extension, event, payload, private) values (%L, %L, %L, %L, true)',
      topic, 'broadcast', 'probe', '{}'));
    perform set_config('realtime.topic', '', true);
    return true;
  exception when insufficient_privilege then
    perform set_config('realtime.topic', '', true);
    return false;
  end;
end;
$$;

-- Shift Hub: everyone in the workspace who can use it hears that something changed.
select ok(pg_temp.receives('lu:ali', 'shift-exchanges:' || tests.id('lu')), 'an employee hears Shift Hub changes in her workspace');
select ok(pg_temp.receives('lu:ayse', 'shift-exchanges:' || tests.id('lu')), 'so does a manager');
select ok(not pg_temp.receives('other:owner', 'shift-exchanges:' || tests.id('lu')), 'another workspace''s owner does not');
select ok(not pg_temp.sends('lu:ali', 'shift-exchanges:' || tests.id('lu')), 'nobody sends a Shift Hub ping from the browser');

-- Account notifications: one's own topic only.
select ok(pg_temp.receives('lu:ali', 'account-notifications:' || tests.user('lu:ali')), 'a person joins her own account notification channel');
select ok(not pg_temp.receives('lu:ali', 'account-notifications:' || tests.user('lu:ayse')), 'not someone else''s');
select ok(not pg_temp.sends('lu:ali', 'account-notifications:' || tests.user('lu:ali')), 'and sends nothing on it');

-- The core behind the second rule: an account action is about one's own account.
select is(app_private.authz_reason(tests.user('lu:ali'), null, 'account.self', null, null, tests.user('lu:ali')), null::text,
  'the account action allows one''s own account');
select is(app_private.authz_reason(tests.user('lu:ali'), null, 'account.self', null, null, tests.user('lu:ayse')), 'out_of_scope',
  'and refuses someone else''s');

-- What the database sends on Shift Hub's channel is private.
select tests.publish_week('lu', 1, '[{"label": "mon", "loc": "K", "person": "ali", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"}]');
select tests.cover_case('lu', 'mon', 'ali', 'emre');
select ok(exists (select 1 from realtime.messages where topic = 'shift-exchanges:' || tests.id('lu')),
  'asking for cover sends a Shift Hub ping');
select ok(not exists (select 1 from realtime.messages where topic = 'shift-exchanges:' || tests.id('lu') and not private),
  'and every ping is private');

select * from finish();
rollback;
