begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Announcements and important dates follow Mert's rules of 2026-10-02
-- (KARARLAR "Duyurular ve önemli tarihler", K1-K6; FB-6.7 done-when 5-8),
-- and the two backlog fixes that came with them: a "Closed day" important date
-- is the Schedule's closure (BL-530), and a cancelled invitation is told only
-- to whoever could have sent it (BL-532).

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

create function pg_temp.locs(keys text[]) returns uuid[] language sql as $$
  select coalesce(array(select tests.id('m:' || k) from unnest(keys) k), '{}')
$$;

create function pg_temp.save_ann(person text, keys text[], title text, roles text[] default array['employee'],
  id uuid default null, publish_at timestamptz default null) returns uuid language sql as $$
  select (public.save_announcement_audience_service(pg_temp.u(person), tests.id('m'), id,
    (select a.revision from public.announcements a where a.id = save_ann.id), title, 'Body of ' || title, 'general',
    roles, pg_temp.locs(keys), publish_at, null, null, '{}', '{}') ->> 'announcement_id')::uuid
$$;

create function pg_temp.rev(id uuid) returns integer language sql as $$
  select revision from public.announcements where announcements.id = rev.id
$$;

create function pg_temp.publish(person text, id uuid) returns jsonb language sql as $$
  select public.publish_announcement_service(pg_temp.u(person), tests.id('m'), id, pg_temp.rev(id))
$$;

create function pg_temp.save_date(person text, keys text[], title text, id uuid default null,
  starts date default '2026-12-25', kind text default 'event', recurrence text default 'none') returns uuid language sql as $$
  select (public.save_important_date_service(pg_temp.u(person), tests.id('m'), id, title, kind, starts, starts,
    recurrence, '', true, pg_temp.locs(keys), (select d.revision from public.important_dates d where d.id = save_date.id)) ->> 'important_date_id')::uuid
$$;

-- The people one notification told: every outbox row for the subject made
-- after the last pg_temp.mark().
create temporary table marked (id uuid primary key);
create function pg_temp.mark() returns void language sql as $$
  insert into marked select o.id from public.notification_outbox o on conflict do nothing
$$;
create function pg_temp.told(subject uuid) returns text[] language sql as $$
  select coalesce(array_agg(distinct p.label order by p.label), '{}')
  from public.notification_outbox o
  cross join lateral jsonb_array_elements_text(o.payload -> 'recipient_user_ids') r(user_id)
  join (select i.label, i.id from tests.ids i where i.label ~ '^m:[a-z]+:user$') u on u.id = r.user_id::uuid
  cross join lateral (select split_part(u.label, ':', 2) label) p
  where o.subject_id = subject::text and not exists (select 1 from marked m where m.id = o.id)
$$;

create function pg_temp.sees_ann(person text, id uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.get_announcements_service(pg_temp.u(person), tests.id('m')) -> 'announcements') a
                 where (a ->> 'id')::uuid = id)
$$;

create function pg_temp.sees_date(person text, id uuid) returns jsonb language sql as $$
  select d from jsonb_array_elements(public.read_settings_important_dates_service(pg_temp.u(person), tests.id('m')) -> 'dates') d
  where (d ->> 'id')::uuid = id
$$;

-- Every entry point asks the core first (FB-6.7, done-when 1).
select is(array(
  select p.proname::text from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in (
    'get_announcements_service', 'save_announcement_audience_service', 'publish_announcement_service',
    'set_announcement_state_service', 'acknowledge_announcement_service', 'save_important_date_service',
    'set_important_date_state_service', 'read_settings_important_dates_service', 'read_important_date_history_service')
    and p.prosrc !~* '\mbegin\M\s*perform\s+app_private\.authorize\('
  order by 1), '{}'::text[], 'every announcement and important date entry point starts with app_private.authorize()');

-- 3. K1: several locations, or the whole workspace, is an admin's or the owner's ------------

select is(pg_temp.try($$select pg_temp.save_ann('ayse', array['K'], 'Ayse at K')$$), 'ok',
  'K1: a manager writes an announcement for the location they manage');
select is(pg_temp.try($$select pg_temp.save_ann('can', array['K', 'B'], 'Can at K and B')$$), '42501 authz.out_of_scope',
  'K1: a manager of both locations still cannot write one announcement for both');
select is(pg_temp.try($$select pg_temp.save_ann('ayse', '{}', 'Ayse everywhere')$$), '42501 authz.out_of_scope',
  'K1: a manager cannot write one for the whole workspace');
select is(pg_temp.try($$select pg_temp.save_ann('zeynep', array['K', 'B'], 'Zeynep at K and B')$$), 'ok',
  'K1: an admin writes one for several locations');
select is(pg_temp.try($$select pg_temp.save_ann('owner', '{}', 'Owner everywhere')$$), 'ok',
  'K1: the owner writes one for the whole workspace');
select is(pg_temp.try($$select pg_temp.save_date('can', array['K', 'B'], 'Can date')$$), '42501 authz.out_of_scope',
  'K1: a manager cannot put an important date at two locations');
select is(pg_temp.try($$select pg_temp.save_date('owner', array['K', 'B'], 'Owner date at K and B')$$), 'ok',
  'K1: the owner puts an important date at two locations');
select is(pg_temp.try($$select pg_temp.save_date('ayse', array['K'], 'Ayse date')$$), 'ok',
  'K1: a manager puts an important date at the location they manage');
select is(pg_temp.try($$select pg_temp.save_ann('emre', array['K'], 'Emre')$$), '42501 authz.missing_permission',
  'an employee writes no announcement');

-- 4. K2: nobody edits a record whose author outranks them ---------------------------------

select tests.remember('m:ann:owner-k', pg_temp.save_ann('owner', array['K'], 'Owner at K'));
select pg_temp.publish('owner', tests.id('m:ann:owner-k'));
select is(pg_temp.try(format($$select pg_temp.save_ann('ayse', array['K'], 'Draft changed', id => %L)$$, pg_temp.save_ann('owner', array['K'], 'Owner draft'))),
  '42501 authz.out_of_scope', 'K2: the owner''s draft is out of sight, the same no as an unknown one');
select is(pg_temp.try(format($$select pg_temp.save_ann('ayse', array['K'], 'Changed', id => %L)$$, tests.id('m:ann:owner-k'))),
  '42501 authz.rank', 'K2: the Kadikoy manager cannot change the owner''s Kadikoy announcement');
select tests.remember('m:date:inventory', pg_temp.save_date('owner', array['K'], 'Inventory day'));
select is(pg_temp.try(format($$select pg_temp.save_date('ayse', array['K'], 'Changed', id => %L)$$, tests.id('m:date:inventory'))),
  '42501 authz.rank', 'K2: the Kadikoy manager cannot change the owner''s "Inventory day"');
select is(pg_temp.try(format($$select pg_temp.save_date('zeynep', array['K'], 'Inventory day moved', id => %L)$$, tests.id('m:date:inventory'))),
  '42501 authz.rank', 'K2: an admin cannot change the owner''s date either');
select is(pg_temp.try(format($$select pg_temp.save_date('owner', array['K'], 'Inventory day', id => %L, starts => '2026-12-26')$$, tests.id('m:date:inventory'))),
  'ok', 'K2: the owner changes their own date');

-- Kaan writes a date as an admin and is made a manager: his date is a
-- manager's now (KK-87).
select tests.remember('m:date:kaan', pg_temp.save_date('kaan', array['K'], 'Kaan''s date'));
select is(pg_temp.try(format($$select pg_temp.save_date('ayse', array['K'], 'Changed by Ayse', id => %L)$$, tests.id('m:date:kaan'))),
  '42501 authz.rank', 'K2: an admin''s date is out of a manager''s reach');
-- ponytail: the role changes by hand; the rule under test is the date's, not the role change's.
update public.workspace_memberships m set role_id = (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key = 'manager')
where m.workspace_id = tests.id('m') and m.user_id = pg_temp.u('kaan');
select is(pg_temp.try(format($$select pg_temp.save_date('ayse', array['K'], 'Changed by Ayse', id => %L)$$, tests.id('m:date:kaan'))),
  'ok', 'K2: once he is a manager, his date is a peer''s (KK-87)');

-- 5. K3: a manager acts on another manager's record where they manage -----------------------

select tests.remember('m:ann:hande', pg_temp.save_ann('hande', array['K'], 'Hande at K'));
select is(pg_temp.try(format($$select pg_temp.save_ann('ayse', array['K'], 'Hande at K, by Ayse', id => %L)$$, tests.id('m:ann:hande'))),
  'ok', 'K3: Ayse edits Hande''s Kadikoy announcement');
select is(pg_temp.try(format($$select pg_temp.publish('ayse', %L)$$, tests.id('m:ann:hande'))), 'ok', 'K3: Ayse publishes it');
select is(pg_temp.try(format($$select public.set_announcement_state_service(pg_temp.u('ayse'), tests.id('m'), %1$L, pg_temp.rev(%1$L), 'unpublish')$$,
  tests.id('m:ann:hande'))), 'ok', 'K3: Ayse unpublishes it');
select is(pg_temp.try(format($$select pg_temp.publish('ayse', %L)$$, tests.id('m:ann:hande'))), 'ok', 'K3: Ayse republishes it');
select is(pg_temp.try(format($$select public.set_announcement_state_service(pg_temp.u('ayse'), tests.id('m'), %1$L, pg_temp.rev(%1$L), 'archive')$$,
  tests.id('m:ann:hande'))), 'ok', 'K3: Ayse archives it');
select is(pg_temp.try(format($$select public.set_announcement_state_service(pg_temp.u('ayse'), tests.id('m'), %1$L, pg_temp.rev(%1$L), 'restore')$$,
  tests.id('m:ann:hande'))), 'ok', 'K3: Ayse restores it');
select is((select status::text from public.announcements where id = tests.id('m:ann:hande')), 'unpublished',
  'a restored announcement comes back unpublished (Mert, 2026-10-02)');
select ok(not pg_temp.sees_ann('veli', tests.id('m:ann:hande')), 'K3: the Besiktas manager does not see it');
select is(pg_temp.try(format($$select pg_temp.save_ann('veli', array['K'], 'Veli edits', id => %L)$$, tests.id('m:ann:hande'))),
  '42501 authz.out_of_scope', 'K3: nor change it');
select tests.remember('m:date:hande', pg_temp.save_date('hande', array['K'], 'Hande''s date'));
select is(pg_temp.try(format($$select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('m'), %L, 'unpublish')$$, tests.id('m:date:hande'))),
  'ok', 'K3: Ayse unpublishes Hande''s important date');
select is(pg_temp.try(format($$select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('m'), %L, 'republish')$$, tests.id('m:date:hande'))),
  'ok', 'K3: and republishes it');
select is(pg_temp.try(format($$select public.set_important_date_state_service(pg_temp.u('veli'), tests.id('m'), %L, 'archive')$$, tests.id('m:date:hande'))),
  '42501 authz.out_of_scope', 'K3: the Besiktas manager cannot archive it');

-- 6. K4: what resets acknowledgements, and who is told again ----------------------------------

select tests.remember('m:ann:k4', pg_temp.save_ann('owner', array['K'], 'Shift swap rules'));
select pg_temp.publish('owner', tests.id('m:ann:k4'));
select public.acknowledge_announcement_service(pg_temp.u('emre'), tests.id('m'), tests.id('m:ann:k4'));
select pg_temp.mark();
select pg_temp.save_ann('owner', array['K', 'B'], 'Shift swap rules', id => tests.id('m:ann:k4'));
select is((select count(*)::integer from public.announcement_acknowledgements where announcement_id = tests.id('m:ann:k4')), 1,
  'K4: adding Besiktas keeps Emre''s acknowledgement');
select is(pg_temp.told(tests.id('m:ann:k4')), array['deniz', 'veli'],
  'K4: adding Besiktas tells only the people it newly reaches (Can and Ali work at Kadikoy too and were told)');
select pg_temp.mark();
select public.set_announcement_state_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:ann:k4'), pg_temp.rev(tests.id('m:ann:k4')), 'unpublish');
select pg_temp.publish('owner', tests.id('m:ann:k4'));
select is((select count(*)::integer from public.announcement_acknowledgements where announcement_id = tests.id('m:ann:k4')), 1,
  'K4: unpublishing and republishing the same content keeps Emre''s acknowledgement');
select ok(not 'emre' = any (pg_temp.told(tests.id('m:ann:k4'))) and 'ali' = any (pg_temp.told(tests.id('m:ann:k4'))),
  'K4: republishing tells those who have not acknowledged, not Emre');
select pg_temp.mark();
select pg_temp.save_ann('owner', array['K', 'B'], 'Shift swap rules, new date', id => tests.id('m:ann:k4'));
select is((select count(*)::integer from public.announcement_acknowledgements where announcement_id = tests.id('m:ann:k4')), 0,
  'K4: a content change resets every acknowledgement');
select ok('emre' = any (pg_temp.told(tests.id('m:ann:k4'))), 'K4: and tells everybody again, Emre too');

select tests.remember('m:date:k4', pg_temp.save_date('owner', array['K'], 'Staff party'));
select pg_temp.mark();
select pg_temp.save_date('owner', array['K', 'B'], 'Staff party', id => tests.id('m:date:k4'));
select is(pg_temp.told(tests.id('m:date:k4')), array['deniz', 'veli'],
  'K4: adding a location to an important date tells only the new people');
select pg_temp.mark();
select pg_temp.save_date('owner', array['K', 'B'], 'Staff party', id => tests.id('m:date:k4'), starts => '2026-12-27');
select ok('emre' = any (pg_temp.told(tests.id('m:date:k4'))), 'K4: moving the date tells everybody again');

-- 7. K5: who an announcement reaches ----------------------------------------------------------

select pg_temp.mark();
select tests.remember('m:ann:k5', pg_temp.save_ann('owner', array['K'], 'Kadikoy cooks', array['employee']));
select pg_temp.publish('owner', tests.id('m:ann:k5'));
select is(pg_temp.told(tests.id('m:ann:k5')), array['ali', 'ayse', 'can', 'emre', 'hande', 'kaan', 'zeynep'],
  'K5: the Kadikoy employees, every Kadikoy manager and the admins; not the Besiktas manager, not the owner who wrote it (KK-89)');
select pg_temp.mark();
select tests.remember('m:ann:k5b', pg_temp.save_ann('ayse', array['K'], 'From Ayse'));
select pg_temp.publish('ayse', tests.id('m:ann:k5b'));
select ok('owner' = any (pg_temp.told(tests.id('m:ann:k5b'))) and not 'ayse' = any (pg_temp.told(tests.id('m:ann:k5b'))),
  'K5: a manager''s announcement reaches the owner, never its author');
select ok(pg_temp.sees_ann('hande', tests.id('m:ann:k5')), 'K5: a manager it was not aimed at sees it at their location');
select pg_temp.mark();
select tests.remember('m:date:k5', pg_temp.save_date('owner', array['B'], 'Besiktas only'));
select is(pg_temp.told(tests.id('m:date:k5')), array['ali', 'can', 'deniz', 'veli', 'zeynep'],
  'K5: an important date reaches the people at its location, its managers and the admins (Kaan is a Kadikoy manager now)');

-- 8. K6: who sees what ------------------------------------------------------------------------

select ok(pg_temp.sees_date('ayse', tests.id('m:date:k5')) is null, 'K6: Ayse does not see a date only at Besiktas');
select tests.remember('m:date:kb', pg_temp.save_date('owner', array['K', 'B'], 'Kadikoy and Besiktas'));
select is(pg_temp.sees_date('ayse', tests.id('m:date:kb')) -> 'location_names', '["Besiktas", "Kadikoy"]'::jsonb,
  'K6: Ayse sees a date at Kadikoy and Besiktas with both names');
select is(pg_temp.sees_date('ayse', tests.id('m:date:kb')) ->> 'can_edit', 'false', 'K6: and may not change it');
select is(pg_temp.try($$select pg_temp.save_date('ayse', array['B'], 'At Besiktas')$$), '42501 authz.out_of_scope',
  'K6: Ayse cannot put a date at Besiktas');
select tests.remember('m:date:km', pg_temp.save_date('owner', array['K', 'M'], 'Kadikoy and Moda'));
select tests.remember('m:date:m', pg_temp.save_date('owner', array['M'], 'Moda only'));
update public.locations set archived_at = now() where id = tests.id('m:M');
select ok(pg_temp.sees_date('ayse', tests.id('m:date:km')) is not null, 'KK-86: with Moda archived, a Kadikoy and Moda date is a Kadikoy date');
select ok(pg_temp.sees_date('ayse', tests.id('m:date:m')) is null, 'KK-86: a date only at archived Moda reaches no manager');
select is(pg_temp.try($$select pg_temp.save_date('owner', array['M'], 'At archived Moda')$$), '42501 authz.out_of_scope',
  'KK-86: nobody puts a new date at an archived location');
select is(pg_temp.try(format($$select pg_temp.save_date('owner', array['K', 'M'], 'Kadikoy and Moda, renamed', id => %L)$$, tests.id('m:date:km'))),
  'ok', 'KK-86: a date keeps the archived location it already had when it is changed');

-- 9. A scheduled announcement goes out at its time (done-when 7) --------------------------------

select tests.remember('m:ann:later', pg_temp.save_ann('owner', array['K'], 'Later', publish_at => now() + interval '1 hour'));
select is(pg_temp.publish('owner', tests.id('m:ann:later')) ->> 'status', 'scheduled', 'a future announcement is scheduled');
select ok(not pg_temp.sees_ann('emre', tests.id('m:ann:later')), 'nobody it targets sees it before its time');
-- ponytail: time passes by moving its hour back.
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('m:ann:later');
select pg_temp.mark();
select ok(pg_temp.sees_ann('emre', tests.id('m:ann:later')), 'at its time Emre sees it');
select is((select status::text from public.announcements where id = tests.id('m:ann:later')), 'published',
  'at its time it is published, no longer scheduled');
select ok('emre' = any (pg_temp.told(tests.id('m:ann:later'))), 'and its people are told');

-- 10. An important date's history (done-when 8) ---------------------------------------------------

select pg_temp.save_date('zeynep', array['K'], 'Menu tasting', id => tests.remember('m:date:h', pg_temp.save_date('ayse', array['K'], 'Tasting')));
select public.set_important_date_state_service(pg_temp.u('ayse'), tests.id('m'), tests.id('m:date:h'), 'archive');
select is(public.read_important_date_history_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:date:h')) ->> 'author_user_id',
  pg_temp.u('ayse')::text, 'the history names who wrote the date');
select is((select array_agg(c ->> 'action' order by c ->> 'action') from jsonb_array_elements(
    public.read_important_date_history_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:date:h')) -> 'changes') c),
  array['archived', 'created', 'updated'], 'every change is in the history');
select is((select (c -> 'before' ->> 'title') || ' -> ' || (c -> 'after' ->> 'title') || ' by ' || (c ->> 'actor_user_id')
    from jsonb_array_elements(public.read_important_date_history_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:date:h')) -> 'changes') c
    where c ->> 'action' = 'updated'),
  'Tasting -> Menu tasting by ' || pg_temp.u('zeynep'), 'a change keeps the old and the new value and who made it');
select is(pg_temp.try(format($$select public.read_important_date_history_service(pg_temp.u('veli'), tests.id('m'), %L)$$, tests.id('m:date:h'))),
  '42501 authz.out_of_scope', 'the Besiktas manager does not read a Kadikoy date''s history');

-- 11. BL-530: a "Closed day" important date closes the location -----------------------------------

select tests.remember('m:date:closed', pg_temp.save_date('owner', array['K'], 'Christmas', starts => '2026-12-25', kind => 'closed_day', recurrence => 'annual'));
select ok(exists (select 1 from public.schedule_closures c where c.location_id = tests.id('m:K') and c.closed_date = '2026-12-25'),
  'BL-530: a Kadikoy closed day closes Kadikoy that day');
select ok(exists (select 1 from public.schedule_closures c where c.location_id = tests.id('m:K') and c.closed_date = '2027-12-25'),
  'BL-530: a yearly closed day closes it the next year too');
select ok(not exists (select 1 from public.schedule_closures c where c.location_id = tests.id('m:B') and c.closed_date = '2026-12-25'),
  'BL-530: Besiktas stays open');
select public.set_important_date_state_service(pg_temp.u('owner'), tests.id('m'), tests.id('m:date:closed'), 'unpublish');
select ok(not exists (select 1 from public.schedule_closures c where c.location_id = tests.id('m:K') and c.closed_date = '2026-12-25'),
  'BL-530: an unpublished closed day closes nothing');

-- 12. BL-532: a cancelled invitation reaches whoever could have sent it ----------------------------

select pg_temp.mark();
select public.request_account_deletion_v2_service(pg_temp.u('pia'), repeat('a', 64));
select is(
  (select coalesce(array_agg(distinct p.label order by p.label), '{}')
   from public.notification_outbox o
   cross join lateral jsonb_array_elements_text(o.payload -> 'recipient_user_ids') r(user_id)
   join tests.ids u on u.id = r.user_id::uuid and u.label ~ '^m:[a-z]+:user$'
   cross join lateral (select split_part(u.label, ':', 2) label) p
   where o.type_key = 'security.account_invitation_cancelled' and not exists (select 1 from marked m where m.id = o.id)),
  array['ayse', 'can', 'hande', 'kaan', 'owner', 'zeynep'],
  'BL-532: Pia''s Kadikoy invitation cancelled tells the Kadikoy managers, the admins and the owner; not the Besiktas manager');

select * from finish();
rollback;
