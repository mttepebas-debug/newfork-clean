begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- The Schedule's live-update channels are private (FOUNDATION-B stage 3).
-- Realtime lets a browser join a private channel only if it could read a
-- message on that topic from realtime.messages, and send one only if it could
-- insert it; this test asks the same two questions the way Realtime does.

select tests.world('rt');
select tests.world('other');
select tests.person('rt', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('rt', 'mehmet', 'manager', array['B'], array['cook']);

create function pg_temp.receives(person text, topic text, extension text default 'broadcast')
returns boolean
language plpgsql
as $$
declare
  message_id uuid := gen_random_uuid();
  seen integer;
begin
  insert into realtime.messages (id, topic, extension, event, payload, private)
  values (message_id, topic, extension, 'probe', '{}'::jsonb, true);
  perform set_config('realtime.topic', topic, true);
  seen := tests.as_browser(tests.user(person), format('select 1 from realtime.messages where id = %L', message_id));
  perform set_config('realtime.topic', '', true);
  return seen > 0;
end;
$$;

create function pg_temp.sends(person text, topic text, extension text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('realtime.topic', topic, true);
  begin
    perform tests.as_browser(tests.user(person), format(
      'insert into realtime.messages (topic, extension, event, payload, private) values (%L, %L, %L, %L, true)',
      topic, extension, 'probe', '{}'));
    perform set_config('realtime.topic', '', true);
    return true;
  exception when insufficient_privilege then
    perform set_config('realtime.topic', '', true);
    return false;
  end;
end;
$$;

select ok(
  pg_temp.receives('rt:ayse', 'schedule:invalidation:' || tests.id('rt')),
  'a manager receives her workspace''s schedule notices'
);
select ok(
  not pg_temp.receives('other:owner', 'schedule:invalidation:' || tests.id('rt')),
  'another workspace''s owner does not'
);
select ok(
  not pg_temp.sends('rt:ayse', 'schedule:invalidation:' || tests.id('rt'), 'broadcast'),
  'nobody sends a schedule notice from the browser'
);
select ok(
  pg_temp.receives('rt:ayse', 'schedule:presence:' || tests.id('rt') || ':' || tests.id('rt:K') || ':' || tests.week(0), 'presence'),
  'a manager sees who else is looking at her location'
);
select ok(
  pg_temp.sends('rt:ayse', 'schedule:presence:' || tests.id('rt') || ':' || tests.id('rt:K') || ':' || tests.week(0), 'presence'),
  'and can say she is looking'
);
select ok(
  not pg_temp.receives('rt:mehmet', 'schedule:presence:' || tests.id('rt') || ':' || tests.id('rt:K') || ':' || tests.week(0), 'presence'),
  'a manager of another location does not see who is looking at Kadikoy'
);
select ok(
  not pg_temp.sends('rt:mehmet', 'schedule:presence:' || tests.id('rt') || ':' || tests.id('rt:K') || ':' || tests.week(0), 'presence'),
  'nor show up there'
);
select ok(
  not pg_temp.receives('rt:ayse', 'schedule:invalidation:not-a-workspace'),
  'a malformed topic lets nobody in'
);

select * from finish();
rollback;
