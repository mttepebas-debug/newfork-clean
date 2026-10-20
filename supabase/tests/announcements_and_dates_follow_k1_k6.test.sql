begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Announcements follow Mert's rules (KARARLAR "Duyurular ve önemli tarihler",
-- K1-K6, K24, K27; EKRAN-08 one record: an important date is a post with "Add
-- to Important Dates"), and an account deletion cancels its invitations.

-- 1. The world ------------------------------------------------------------------------
-- Kadikoy (K), Besiktas (B) and Moda (M, archived below). Olcay is the owner.

select tests.world('m');
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'kaan', 'admin', array['K'], array['server']);
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'hande', 'manager', array['K'], array['cook']);
select tests.person('m', 'veli', 'manager', array['B'], array['cook']);
select tests.person('m', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'ali', 'employee', array['K', 'B'], array['server']);
select tests.person('m', 'deniz', 'employee', array['B'], array['server']);
select tests.person('m', 'pia', 'employee', array['K'], array['cook'], 'pending');
select tests.as_browser(tests.user('m:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Moda', 'MDA', '3 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul')$sql$,
  tests.remember('m:M', gen_random_uuid()), tests.id('m')));

-- 2. Helpers --------------------------------------------------------------------------

-- 'ok', or the refusal's code and hint: '42501 authz.rank'.
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
  select tests.user('m:' || person)
$$;

create function pg_temp.rev(id uuid) returns integer language sql as $$
  select revision from public.announcements where announcements.id = rev.id
$$;

-- A post at these locations (each Open), a month ahead; extra adds or overrides fields.
create function pg_temp.payload(keys text[], title text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('title', title, 'body', 'Body of ' || title, 'starts_on', current_date + 30,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('location_id', tests.id('m:' || k), 'day', 'open')) from unnest(keys) k),
      '[]'::jsonb)) || extra
$$;

create function pg_temp.save(person text, id uuid, p jsonb, intent text) returns jsonb language sql as $$
  select public.save_announcement_service(pg_temp.u(person), tests.id('m'), id, pg_temp.rev(id), p, intent)
$$;

-- A draft: what K1 asks before anything goes out.
create function pg_temp.draft(person text, keys text[], title text, extra jsonb default '{}') returns uuid language sql as $$
  select (pg_temp.save(person, null, pg_temp.payload(keys, title, extra), 'draft') ->> 'announcement_id')::uuid
$$;

create function pg_temp.publish(person text, keys text[], title text, extra jsonb default '{}') returns uuid
language plpgsql as $$
declare made uuid := pg_temp.draft(person, keys, title, extra);
begin
  perform pg_temp.save(person, made, pg_temp.payload(keys, title, extra), 'publish');
  return made;
end;
$$;

create function pg_temp.set_state(person text, id uuid, action text) returns jsonb language sql as $$
  select public.set_announcement_state_service(pg_temp.u(person), tests.id('m'), id, pg_temp.rev(id), action)
$$;

-- Who a post reaches (announcements.delivered_to), by name.
create function pg_temp.reached(subject uuid) returns text[] language sql as $$
  select coalesce(array_agg(distinct p.label order by p.label), '{}')
  from public.announcements a
  cross join lateral unnest(a.delivered_to) r(user_id)
  join (select i.label, i.id from tests.ids i where i.label ~ '^m:[a-z]+:user$') u on u.id = r.user_id
  cross join lateral (select split_part(u.label, ':', 2) label) p
  where a.id = subject
$$;
-- How many people the post's steps since the last pg_temp.mark() are for, as its History keeps it ("told").
create temporary table marked (id uuid primary key);
create function pg_temp.mark() returns void language sql as $$
  insert into marked select c.id from public.announcement_changes c on conflict do nothing
$$;
create function pg_temp.told(subject uuid) returns integer language sql as $$
  select coalesce(sum((c.detail ->> 'told')::integer), 0)::integer from public.announcement_changes c
  where c.announcement_id = subject and not exists (select 1 from marked m where m.id = c.id)
$$;
create function pg_temp.reach_count(subject uuid) returns integer language sql as $$
  select cardinality(a.delivered_to) from public.announcements a where a.id = subject
$$;

create function pg_temp.sees(person text, id uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.get_announcements_service(pg_temp.u(person), tests.id('m')) -> 'announcements') a
                 where (a ->> 'id')::uuid = id)
$$;

create function pg_temp.sees_date(person text, id uuid) returns jsonb language sql as $$
  select d from jsonb_array_elements(public.get_important_dates_service(pg_temp.u(person), tests.id('m')) -> 'dates') d
  where (d ->> 'id')::uuid = id
$$;

create function pg_temp.acks(id uuid) returns integer language sql as $$
  select count(*)::integer from public.announcement_acknowledgements where announcement_id = id
$$;

-- Every entry point asks the core first (FB-6.7, done-when 1).
select is(array(
  select p.proname::text from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in (
    'get_announcements_service', 'get_announcement_service', 'get_important_dates_service', 'preview_announcement_service',
    'save_announcement_service', 'set_announcement_state_service', 'acknowledge_announcement_service')
    and p.prosrc !~* '\mbegin\M\s*perform\s+app_private\.authorize\('
  order by 1), '{}'::text[], 'every announcement entry point starts with app_private.authorize()');
select is((select count(*)::integer from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'get_announcements_service', 'get_announcement_service', 'get_important_dates_service', 'preview_announcement_service',
    'save_announcement_service', 'set_announcement_state_service', 'acknowledge_announcement_service')), 7,
  'and all seven are there');

-- 3. K1: several locations is an admin's or the owner's ---------------------------------

select is(pg_temp.try($$select pg_temp.draft('ayse', array['K'], 'Ayse at K')$$), 'ok',
  'K1: a manager writes a post for the location they manage');
select is(pg_temp.try($$select pg_temp.draft('can', array['K', 'B'], 'Can at K and B')$$), '42501 authz.out_of_scope',
  'K1: a manager of both locations still cannot write one post for both');
select is(pg_temp.try($$select pg_temp.draft('zeynep', array['K', 'B'], 'Zeynep at K and B')$$), 'ok',
  'K1: an admin writes one for several locations');
select is(pg_temp.try($$select pg_temp.draft('ayse', '{}', 'Ayse, nowhere yet')$$), 'ok',
  'K1: a manager may start a draft before choosing where');
select is(pg_temp.try($$select pg_temp.publish('ayse', '{}', 'Ayse to nobody')$$), '22023 announcement.nobody',
  'K24: but it goes out to nobody until a location is checked or someone is added');
select is(pg_temp.try($$select pg_temp.draft('ayse', '{}', 'Ayse adds Deniz', jsonb_build_object('people', jsonb_build_array(pg_temp.u('deniz'))))$$),
  '42501 authz.out_of_scope', 'K24: a manager adds by hand only people from the location they manage');
select is(pg_temp.try($$select pg_temp.draft('can', array['K'], 'Can on Important Dates', '{"on_important_dates": true}')$$), 'ok',
  'K1: a manager puts a post at the location they manage on Important Dates');
select is(pg_temp.try($$select pg_temp.draft('can', array['K', 'B'], 'Can date', '{"on_important_dates": true}')$$),
  '42501 authz.out_of_scope', 'K1: but not one at two locations');
select is(pg_temp.try($$select pg_temp.draft('owner', array['K', 'B'], 'Owner date at K and B', '{"on_important_dates": true}')$$), 'ok',
  'K1: the owner puts one at two locations');
select is(pg_temp.try($$select pg_temp.draft('emre', array['K'], 'Emre')$$), '42501 authz.missing_permission',
  'an employee writes no post');

-- 4. K2: nobody changes a record whose author outranks them -------------------------------

select tests.remember('m:ann:owner-k', pg_temp.publish('owner', array['K'], 'Owner at K', '{"on_important_dates": true}'));
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Draft changed'), 'draft')$$,
  pg_temp.draft('owner', array['K'], 'Owner draft'))),
  '42501 authz.out_of_scope', 'K19: the owner''s draft is the owner''s own, the same no as an unknown one');
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Changed', '{"on_important_dates": true}'), 'save')$$,
  tests.id('m:ann:owner-k'))), '42501 authz.rank', 'K2: the Kadikoy manager cannot change the owner''s Kadikoy post');
select is(pg_temp.try(format($$select pg_temp.set_state('zeynep', %L, 'unpublish')$$, tests.id('m:ann:owner-k'))),
  '42501 authz.rank', 'K2: nor can an admin take it down');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload(array['K'], 'Owner at K, renamed', '{"on_important_dates": true}'), 'save')$$,
  tests.id('m:ann:owner-k'))), 'ok', 'K2: the owner changes their own');

-- Kaan writes a post as an admin and is made a manager: his post is a
-- manager's now (KK-87).
select tests.remember('m:ann:kaan', pg_temp.publish('kaan', array['K'], 'Kaan''s post'));
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Changed by Ayse'), 'save')$$,
  tests.id('m:ann:kaan'))), '42501 authz.rank', 'K2: an admin''s post is out of a manager''s reach');
-- ponytail: the role changes by hand; the rule under test is the post's, not the role change's.
update public.workspace_memberships m set role_id = (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key = 'manager')
where m.workspace_id = tests.id('m') and m.user_id = pg_temp.u('kaan');
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Changed by Ayse'), 'save')$$,
  tests.id('m:ann:kaan'))), 'ok', 'K2: once he is a manager, his post is a peer''s (KK-87)');

-- 5. K3: a manager acts on another manager's post where they manage -----------------------

select tests.remember('m:ann:hande', pg_temp.publish('hande', array['K'], 'Hande at K', '{"on_important_dates": true}'));
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Hande at K, by Ayse', '{"on_important_dates": true}'), 'save')$$,
  tests.id('m:ann:hande'))), 'ok', 'K3: Ayse changes Hande''s Kadikoy post');
select is(pg_temp.try(format($$select pg_temp.set_state('ayse', %L, 'unpublish')$$, tests.id('m:ann:hande'))), 'ok',
  'K3: Ayse unpublishes it');
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Hande at K, by Ayse', '{"on_important_dates": true}'), 'publish')$$,
  tests.id('m:ann:hande'))), 'ok', 'K3: Ayse publishes it again');
select ok(not pg_temp.sees('veli', tests.id('m:ann:hande')), 'K3: the Besiktas manager does not see it');
select is(pg_temp.try(format($$select pg_temp.set_state('veli', %L, 'unpublish')$$, tests.id('m:ann:hande'))),
  '42501 authz.out_of_scope', 'K3: nor take it down');
select pg_temp.set_state('ayse', tests.id('m:ann:hande'), 'unpublish');
select is(pg_temp.try(format($$select pg_temp.set_state('ayse', %L, 'archive')$$, tests.id('m:ann:hande'))), 'ok',
  'K3, K8: Ayse archives it once it is unpublished');
select is(pg_temp.try(format($$select pg_temp.set_state('ayse', %L, 'restore')$$, tests.id('m:ann:hande'))),
  '22023 announcement.invalid', 'an archived post does not come back (no Restore)');

-- 6. K4, K27: what keeps acknowledgements, and who is told again ----------------------------

select tests.remember('m:ann:k4', pg_temp.publish('owner', array['K'], 'Shift swap rules', '{"ask_ack": true}'));
select public.acknowledge_announcement_service(pg_temp.u('emre'), tests.id('m'), tests.id('m:ann:k4'));
select pg_temp.mark();
select pg_temp.save('owner', tests.id('m:ann:k4'), pg_temp.payload(array['K', 'B'], 'Shift swap rules', '{"ask_ack": true}'), 'save');
select is(pg_temp.acks(tests.id('m:ann:k4')), 1, 'K4: adding Besiktas keeps Emre''s acknowledgement');
select is(pg_temp.told(tests.id('m:ann:k4')), 2,
  'K4: adding Besiktas is for the two people it newly reaches, Deniz and Veli (Can and Ali work at Kadikoy too)');
select pg_temp.set_state('owner', tests.id('m:ann:k4'), 'unpublish');
select pg_temp.mark();
select pg_temp.save('owner', tests.id('m:ann:k4'), pg_temp.payload(array['K', 'B'], 'Shift swap rules', '{"ask_ack": true}'), 'publish');
select is(pg_temp.acks(tests.id('m:ann:k4')), 1, 'K27: published again with its acknowledgements kept, Emre''s stays');
select ok('emre' = any (pg_temp.reached(tests.id('m:ann:k4'))) and pg_temp.told(tests.id('m:ann:k4')) = pg_temp.reach_count(tests.id('m:ann:k4')) - 1,
  'K27: it is for those who have not acknowledged: everybody it reaches but Emre');
select pg_temp.mark();
select pg_temp.save('owner', tests.id('m:ann:k4'), pg_temp.payload(array['K', 'B'], 'Shift swap rules, new text', '{"ask_ack": true}'), 'save');
select is(pg_temp.acks(tests.id('m:ann:k4')), 1, 'K27: a new text keeps the acknowledgements unless the writer asks again');
select is(pg_temp.told(tests.id('m:ann:k4')), pg_temp.reach_count(tests.id('m:ann:k4')) - 1,
  'K27: and is only for those who have not acknowledged');
select pg_temp.mark();
select pg_temp.save('owner', tests.id('m:ann:k4'), pg_temp.payload(array['K', 'B'], 'Shift swap rules, again',
  '{"ask_ack": true, "reset_acknowledgements": true}'), 'save');
select is(pg_temp.acks(tests.id('m:ann:k4')), 0, 'K27: asked again, every acknowledgement is cleared');
select is(pg_temp.told(tests.id('m:ann:k4')), pg_temp.reach_count(tests.id('m:ann:k4')), 'K27: and is for everybody again, Emre too');
select pg_temp.mark();
select pg_temp.save('owner', tests.id('m:ann:k4'), pg_temp.payload(array['K'], 'Shift swap rules, again',
  '{"ask_ack": true}'), 'save');
select is(pg_temp.told(tests.id('m:ann:k4')), 0, 'K4: taking Besiktas off is for nobody');
select ok(not pg_temp.sees('deniz', tests.id('m:ann:k4')), 'BL-534: and Deniz no longer has it');

select tests.remember('m:date:k4', pg_temp.publish('owner', array['K'], 'Staff party',
  jsonb_build_object('on_important_dates', true, 'starts_on', current_date + 60)));
select pg_temp.mark();
select pg_temp.save('owner', tests.id('m:date:k4'), pg_temp.payload(array['K'], 'Staff party',
  jsonb_build_object('on_important_dates', true, 'starts_on', current_date + 62)), 'save');
select is(pg_temp.told(tests.id('m:date:k4')), pg_temp.reach_count(tests.id('m:date:k4')), 'K4: moving its day is for everybody again');

-- 7. K24: who a post reaches -------------------------------------------------------------------

select pg_temp.mark();
select tests.remember('m:ann:k5', pg_temp.publish('owner', array['K'], 'Kadikoy team'));
select is(pg_temp.reached(tests.id('m:ann:k5')), array['ali', 'ayse', 'can', 'emre', 'hande', 'kaan', 'zeynep'],
  'K24: whoever works at Kadikoy; not the Besiktas people, not Pia who has not joined, not the owner who wrote it (KK-89)');
select pg_temp.mark();
select tests.remember('m:ann:k5b', pg_temp.publish('ayse', array['K'], 'From Ayse'));
select ok('owner' = any (pg_temp.reached(tests.id('m:ann:k5b'))) and not 'ayse' = any (pg_temp.reached(tests.id('m:ann:k5b'))),
  'K24: the owner works at Kadikoy too and gets a manager''s post there; its author never does');
select ok(pg_temp.sees('hande', tests.id('m:ann:k5')), 'K24: a manager who works there sees it');
select pg_temp.mark();
select tests.remember('m:ann:k5c', pg_temp.publish('owner', array['B'], 'Besiktas and Emre',
  jsonb_build_object('people', jsonb_build_array(pg_temp.u('emre')))));
select is(pg_temp.reached(tests.id('m:ann:k5c')), array['ali', 'can', 'deniz', 'emre', 'veli'],
  'K24: the Besiktas people and Emre, added by hand');
select ok(pg_temp.sees('emre', tests.id('m:ann:k5c')) and not pg_temp.sees('ayse', tests.id('m:ann:k5c')),
  'K24: Emre sees it; Ayse, who manages Kadikoy only, does not');

-- 8. K6: who sees what on Important Dates --------------------------------------------------------

select tests.remember('m:date:b', pg_temp.publish('owner', array['B'], 'Besiktas only', '{"on_important_dates": true}'));
select ok(pg_temp.sees_date('ayse', tests.id('m:date:b')) is null, 'K6: Ayse does not see a date only at Besiktas');
select tests.remember('m:date:kb', pg_temp.publish('owner', array['K', 'B'], 'Kadikoy and Besiktas', '{"on_important_dates": true}'));
select is((select jsonb_agg(l ->> 'name' order by l ->> 'name') from jsonb_array_elements(pg_temp.sees_date('ayse', tests.id('m:date:kb')) -> 'locations') l),
  '["Besiktas", "Kadikoy"]'::jsonb, 'K6: Ayse sees a date at Kadikoy and Besiktas with both names');
select is(pg_temp.sees_date('ayse', tests.id('m:date:kb')) ->> 'can_edit', 'false', 'K6: and may not change it');
-- Bug 2: a post reaches people, so Moda has someone besides the owner.
select tests.person('m', 'meral', 'employee', array['M'], array['server']);
select tests.remember('m:date:km', pg_temp.publish('owner', array['K', 'M'], 'Kadikoy and Moda', '{"on_important_dates": true}'));
select tests.remember('m:date:m', pg_temp.publish('owner', array['M'], 'Moda only', '{"on_important_dates": true}'));
update public.locations set archived_at = now() where id = tests.id('m:M');
select ok(pg_temp.sees_date('ayse', tests.id('m:date:km')) is not null, 'KK-86: with Moda archived, a Kadikoy and Moda date is a Kadikoy date');
select ok(pg_temp.sees_date('ayse', tests.id('m:date:m')) is null, 'KK-86: a date only at archived Moda reaches no manager');
select is(pg_temp.try($$select pg_temp.draft('owner', array['M'], 'At archived Moda')$$), '42501 authz.out_of_scope',
  'KK-86: nobody puts a new post at an archived location; the same no as an unknown one');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload(array['K', 'M'], 'Kadikoy and Moda, renamed', '{"on_important_dates": true}'), 'save')$$,
  tests.id('m:date:km'))), 'ok', 'KK-86: a post keeps the archived location it already had when it is changed');
select is((select count(*)::integer from public.announcement_locations t where t.announcement_id = tests.id('m:date:km')
           and t.location_id = tests.id('m:M')), 1, 'KK-86: Moda''s row stays as it was');

-- 9. A scheduled post goes out at its time (done-when 7) --------------------------------

select tests.remember('m:ann:later', pg_temp.draft('owner', array['K'], 'Later'));
select is(pg_temp.save('owner', tests.id('m:ann:later'), pg_temp.payload(array['K'], 'Later',
  jsonb_build_object('publish_at', now() + interval '1 hour')), 'schedule') ->> 'status', 'scheduled', 'a post for later is scheduled');
select ok(not pg_temp.sees('emre', tests.id('m:ann:later')), 'nobody it reaches sees it before its time');
-- ponytail: time passes by moving its hour back.
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('m:ann:later');
select pg_temp.mark();
select ok(pg_temp.sees('emre', tests.id('m:ann:later')), 'at its time Emre sees it');
select is((select status::text from public.announcements where id = tests.id('m:ann:later')), 'published',
  'at its time it is published, no longer scheduled');
select ok('emre' = any (pg_temp.reached(tests.id('m:ann:later'))), 'and it reaches its people');

-- 10. A post's History (done-when 8, K26) ----------------------------------------------------

select tests.remember('m:ann:h', pg_temp.publish('ayse', array['K'], 'Tasting', '{"on_important_dates": true}'));
select pg_temp.save('zeynep', tests.id('m:ann:h'), pg_temp.payload(array['K'], 'Menu tasting', '{"on_important_dates": true}'), 'save');
select pg_temp.set_state('ayse', tests.id('m:ann:h'), 'unpublish');
select pg_temp.set_state('ayse', tests.id('m:ann:h'), 'archive');
select is(public.get_announcement_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:ann:h')) ->> 'author_user_id',
  pg_temp.u('ayse')::text, 'the History names who wrote the post');
select is((select array_agg(c ->> 'action' order by (c ->> 'changed_at')::timestamptz, c ->> 'action') from jsonb_array_elements(
    public.get_announcement_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:ann:h')) -> 'history') c),
  array['archived', 'created', 'published', 'saved', 'unpublished', 'updated'], 'every step is in the History');
select is((select c ->> 'actor_user_id' from jsonb_array_elements(
    public.get_announcement_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:ann:h')) -> 'history') c
    where c ->> 'action' = 'updated'), pg_temp.u('zeynep')::text, 'a change says who made it');
select is(pg_temp.try(format($$select public.get_announcement_service(pg_temp.u('veli'), tests.id('m'), %L)$$, tests.id('m:ann:h'))),
  '42501 authz.out_of_scope', 'the Besiktas manager does not open a Kadikoy post');

-- 11. BL-530: a closed day closes the location --------------------------------------------

select tests.remember('m:ann:closed', pg_temp.publish('owner', array['K'], 'Christmas', jsonb_build_object('starts_on', current_date + 60,
  'category', 'holiday', 'recurrence', 'date', 'on_important_dates', true,
  'locations', jsonb_build_array(jsonb_build_object('location_id', tests.id('m:K'), 'day', 'closed')))));
select ok(exists (select 1 from public.schedule_closures c where c.location_id = tests.id('m:K') and c.closed_date = current_date + 60),
  'BL-530: a Kadikoy closed day closes Kadikoy that day');
select ok(not exists (select 1 from public.schedule_closures c where c.location_id = tests.id('m:B') and c.closed_date = current_date + 60),
  'BL-530: Besiktas stays open');
select pg_temp.set_state('owner', tests.id('m:ann:closed'), 'unpublish');
select ok(not exists (select 1 from public.schedule_closures c where c.location_id = tests.id('m:K') and c.closed_date = current_date + 60),
  'BL-530: an unpublished closed day closes nothing ahead');

-- 12. Pia asks to delete her account: her invitation is cancelled --------------------------------

select public.request_account_deletion_v2_service(pg_temp.u('pia'), repeat('a', 64));
select is(
  (select array_agg(distinct i.status::text) from public.employee_invitations i
   where i.workspace_id = tests.id('m') and i.employee_id = tests.id('m:pia')),
  array['revoked'],
  'Pia''s Kadikoy invitation is cancelled');

-- 13. K1, K3: a post only for people with no location is its author's and the wide writers' -----
-- Rita is a Remote manager: no location. A post Veli (Besiktas) sends only to
-- her is about no place; Ayse (Kadikoy) may write somewhere, which lets her
-- start her own post before choosing where, never take over Veli's.

select tests.person('m', 'rita', 'manager', '{}'::text[], array['cook']);
select tests.remember('m:ann:to-rita', pg_temp.publish('veli', '{}', 'Rita private',
  jsonb_build_object('people', jsonb_build_array(pg_temp.u('rita')), 'on_schedule', true)));
select ok(not pg_temp.sees('ayse', tests.id('m:ann:to-rita')),
  'K3: a post only for a Remote manager is not on another location''s manager''s list');
select is(pg_temp.try($$select public.get_announcement_service(pg_temp.u('ayse'), tests.id('m'), tests.id('m:ann:to-rita'))$$),
  '42501 authz.out_of_scope', 'K3: nor does that manager open it');
select is(pg_temp.try($$select pg_temp.save('ayse', tests.id('m:ann:to-rita'), pg_temp.payload('{}', 'Rita private, edited',
    jsonb_build_object('people', jsonb_build_array(pg_temp.u('rita'), pg_temp.u('emre')))), 'save')$$),
  '42501 authz.out_of_scope', 'K3: nor change it');
select is(pg_temp.try($$select pg_temp.set_state('ayse', tests.id('m:ann:to-rita'), 'unpublish')$$),
  '42501 authz.out_of_scope', 'K3: nor unpublish it');
select is(public.get_announcement_service(pg_temp.u('veli'), tests.id('m'), tests.id('m:ann:to-rita')) ->> 'can_edit', 'true',
  'K1: its author still changes it');
select is(public.get_announcement_service(pg_temp.u('zeynep'), tests.id('m'), tests.id('m:ann:to-rita')) ->> 'can_edit', 'true',
  'K1: and so does an admin, who writes for the whole workspace');
select ok(pg_temp.sees('rita', tests.id('m:ann:to-rita')), 'K24: Rita reads it');

-- The Schedule: a post about no place is on a manager's week only when it is
-- out to them or theirs to change; a scheduled one only when theirs to change.
select tests.remember('m:ann:to-rita-later', pg_temp.draft('veli', '{}', 'Rita later',
  jsonb_build_object('people', jsonb_build_array(pg_temp.u('rita')), 'on_schedule', true)));
select pg_temp.save('veli', tests.id('m:ann:to-rita-later'), pg_temp.payload('{}', 'Rita later',
  jsonb_build_object('people', jsonb_build_array(pg_temp.u('rita')), 'on_schedule', true, 'publish_at', now() + interval '2 days')), 'schedule');
create function pg_temp.week_posts(person text) returns text[] language sql as $$
  select coalesce(array_agg(d ->> 'title' order by d ->> 'title'), '{}')
  from jsonb_array_elements(public.get_schedule_read_model_service(pg_temp.u(person), tests.id('m'), current_date + 30) -> 'important_dates') d
  where d ->> 'title' in ('Rita private', 'Rita later')
$$;
select is(pg_temp.week_posts('ayse'), '{}'::text[],
  'K3: another location''s manager''s Schedule leaves out a post only for a Remote manager, published or scheduled');
select is(pg_temp.week_posts('veli'), array['Rita later', 'Rita private'],
  'K1: its author''s Schedule shows both');
select is(pg_temp.week_posts('zeynep'), array['Rita later', 'Rita private'],
  'K1: so does an admin''s');

-- A manager's own post about no place stays hers: her peer at the same
-- location neither opens it nor finds it on the Schedule; once she is no
-- longer a manager it is not hers to change either.
select tests.remember('m:ann:ayse-to-rita', pg_temp.publish('ayse', '{}', 'Ayse to Rita',
  jsonb_build_object('people', jsonb_build_array(pg_temp.u('rita')), 'on_schedule', true)));
select is(pg_temp.try($$select public.get_announcement_service(pg_temp.u('hande'), tests.id('m'), tests.id('m:ann:ayse-to-rita'))$$),
  '42501 authz.out_of_scope', 'K3: a peer manager at the same location does not open a post about no place');
select is(pg_temp.try($$select pg_temp.set_state('hande', tests.id('m:ann:ayse-to-rita'), 'unpublish')$$),
  '42501 authz.out_of_scope', 'K3: nor unpublish it');
select ok(exists (
    select 1 from jsonb_array_elements(public.get_schedule_read_model_service(pg_temp.u('ayse'), tests.id('m'), current_date + 30) -> 'important_dates') d
    where d ->> 'title' = 'Ayse to Rita'),
  'K1: its author finds it on her Schedule');
select ok(not exists (
    select 1 from jsonb_array_elements(public.get_schedule_read_model_service(pg_temp.u('hande'), tests.id('m'), current_date + 30) -> 'important_dates') d
    where d ->> 'title' = 'Ayse to Rita'),
  'K3: nor finds it on the Schedule');
-- ponytail: the role changes by hand; the rule under test is the post's, not the role change's.
update public.workspace_memberships m set role_id = null, employee_role_id = (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key = 'employee')
where m.workspace_id = tests.id('m') and m.user_id = pg_temp.u('ayse');
select is(pg_temp.try($$select pg_temp.set_state('ayse', tests.id('m:ann:ayse-to-rita'), 'unpublish')$$),
  '42501 authz.out_of_scope', 'K1: once she is an employee, her own post about no place is not hers to unpublish');

select * from finish();
rollback;
