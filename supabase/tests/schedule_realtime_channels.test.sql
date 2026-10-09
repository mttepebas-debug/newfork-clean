begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- The Schedule's live-update channels are private (FOUNDATION-B stage 3).
-- Realtime lets a browser join a private channel only if it could read a
-- message on that topic from realtime.messages, and send one only if it could
-- insert it; this test asks the same two questions the way Realtime does.

select tests.world('rt');
select tests.world('other');
select tests.person('rt', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('rt', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('rt', 'ali', 'employee', array['K'], array['cook']);
select tests.person('rt', 'veli', 'employee', array['K','B'], array['cook']);
select tests.person('rt', 'selin', 'employee', array['B'], array['cook']);

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

-- Schedule notices go to one channel per location (EKRAN-01 DB-2): a reader of
-- Kadikoy's schedule hears Kadikoy, nothing else. The core (rls_can) decides.
create function pg_temp.notices(loc text) returns text language sql as $$
  select 'schedule:invalidation:' || tests.id('rt') || ':' || tests.id(loc)
$$;
create function pg_temp.presence(loc text) returns text language sql as $$
  select 'schedule:presence:' || tests.id('rt') || ':' || tests.id(loc) || ':' || tests.week(0)
$$;

select ok(
  pg_temp.receives('rt:ayse', pg_temp.notices('rt:K')),
  'a manager receives her location''s schedule notices'
);
select ok(
  pg_temp.receives('rt:owner', pg_temp.notices('rt:B')),
  'the owner receives every location''s notices'
);
select ok(
  not pg_temp.receives('rt:mehmet', pg_temp.notices('rt:K')),
  'a Besiktas manager cannot listen to Kadikoy'
);
select ok(
  not pg_temp.receives('rt:ali', pg_temp.notices('rt:K'))
  and not pg_temp.receives('rt:veli', pg_temp.notices('rt:K'))
  and not pg_temp.receives('rt:selin', pg_temp.notices('rt:B')),
  'employees cannot join a schedule notice channel'
);
select ok(
  not pg_temp.receives('other:owner', pg_temp.notices('rt:K')),
  'another workspace''s owner does not'
);
select ok(
  not pg_temp.receives('rt:owner', 'schedule:invalidation:' || tests.id('rt'))
  and not pg_temp.receives('rt:ayse', 'schedule:invalidation:' || tests.id('rt')),
  'the old workspace-wide notice channel lets nobody in'
);
select ok(
  not pg_temp.receives('rt:owner', 'schedule:invalidation:' || tests.id('rt') || ':' || tests.id('other:K')),
  'a location of another workspace lets nobody in'
);
select ok(
  not pg_temp.sends('rt:ayse', pg_temp.notices('rt:K'), 'broadcast'),
  'nobody sends a schedule notice from the browser'
);
select ok(
  pg_temp.receives('rt:ayse', pg_temp.presence('rt:K'), 'presence'),
  'a manager sees who else is looking at her location'
);
select ok(
  pg_temp.sends('rt:ayse', pg_temp.presence('rt:K'), 'presence'),
  'and can say she is looking'
);
-- Realtime lets a browser join only if it could read a broadcast on the topic,
-- even on a channel used for presence alone.
select ok(
  pg_temp.receives('rt:ayse', pg_temp.presence('rt:K'), 'broadcast'),
  'so she can join the channel at all'
);
select ok(
  not pg_temp.receives('rt:mehmet', pg_temp.presence('rt:K'), 'broadcast'),
  'a manager of another location cannot join it'
);
select ok(
  not pg_temp.receives('rt:mehmet', pg_temp.presence('rt:K'), 'presence'),
  'a manager of another location does not see who is looking at Kadikoy'
);
select ok(
  not pg_temp.sends('rt:mehmet', pg_temp.presence('rt:K'), 'presence'),
  'nor show up there'
);
select ok(
  not pg_temp.receives('rt:ali', pg_temp.presence('rt:K'), 'broadcast')
  and not pg_temp.receives('rt:ali', pg_temp.presence('rt:K'), 'presence'),
  'a Kadikoy employee cannot see who is looking at the schedule'
);
select ok(
  not pg_temp.sends('rt:ali', pg_temp.presence('rt:K'), 'presence'),
  'nor pretend to be looking'
);
select ok(
  not pg_temp.receives('rt:ayse', 'schedule:invalidation:not-a-workspace'),
  'a malformed topic lets nobody in'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and coalesce(qual, '') || coalesce(with_check, '') !~ 'app_private\.rls_can\('),
  0,
  'every live channel policy asks the core'
);

select * from finish();
rollback;
