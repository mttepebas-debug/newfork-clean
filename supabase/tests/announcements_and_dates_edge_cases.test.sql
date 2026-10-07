begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The edges of announcements and important dates that the FB-6.7 part A
-- review found (2026-10-02): an author who has left, the minute's release,
-- a scheduled announcement losing its time or running out of it, archived
-- locations, the history of a moved date, two people editing at once, the
-- Schedule's closed days read by the API, republishing an important date, and
-- a record whose audience narrows (BL-534). Rules: KARARLAR "Duyurular ve
-- önemli tarihler" K2 addendum, K4, K6, K7; KK-86, KK-92.

-- 1. The world ------------------------------------------------------------------------
-- Kadikoy (K), Besiktas (B) and Moda (M, archived later). Olcay is the owner.

select tests.world('r');
select tests.person('r', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('r', 'hande', 'admin', array['K'], array['server']);
select tests.person('r', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('r', 'mina', 'manager', array['K'], array['cook']);
select tests.person('r', 'selin', 'manager', array['K'], array['cook']);
select tests.person('r', 'veli', 'manager', array['B'], array['cook']);
select tests.person('r', 'emre', 'employee', array['K'], array['cook']);
select tests.person('r', 'ali', 'employee', array['K', 'B'], array['server']);
select tests.person('r', 'deniz', 'employee', array['B'], array['server']);
select tests.as_browser(tests.user('r:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Moda', 'MDA', '3 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul')$sql$,
  tests.remember('r:M', gen_random_uuid()), tests.id('r')));
select tests.person('r', 'oya', 'manager', array['K', 'M'], array['cook']);

-- 2. Helpers --------------------------------------------------------------------------

-- 'ok', or the refusal's code and hint: '42501 authz.rank', '22023 '.
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
  select tests.user('r:' || person)
$$;

create function pg_temp.locs(keys text[]) returns uuid[] language sql as $$
  select coalesce(array(select tests.id('r:' || k) from unnest(keys) k), '{}')
$$;

create function pg_temp.save_ann(person text, keys text[], title text, id uuid default null,
  publish_at timestamptz default null, expires_at timestamptz default null) returns uuid language sql as $$
  select (public.save_announcement_audience_service(pg_temp.u(person), tests.id('r'), id,
    (select a.revision from public.announcements a where a.id = save_ann.id), title, 'Body of ' || title, 'general',
    array['employee'], pg_temp.locs(keys), publish_at, expires_at, null, '{}', '{}') ->> 'announcement_id')::uuid
$$;

create function pg_temp.rev(id uuid) returns integer language sql as $$
  select revision from public.announcements where announcements.id = rev.id
$$;

create function pg_temp.publish(person text, id uuid) returns jsonb language sql as $$
  select public.publish_announcement_service(pg_temp.u(person), tests.id('r'), id, pg_temp.rev(id))
$$;

create function pg_temp.status(id uuid) returns text language sql as $$
  select status::text from public.announcements where announcements.id = status.id
$$;

-- An important date's revision, read so this file still runs where the column
-- is missing.
create function pg_temp.date_rev(id uuid) returns integer language sql as $$
  select (to_jsonb(d) ->> 'revision')::integer from public.important_dates d where d.id = date_rev.id
$$;

create function pg_temp.save_date(person text, keys text[], title text, id uuid default null,
  starts date default current_date + 60, kind text default 'event', recurrence text default 'none') returns uuid language plpgsql as $$
begin
  return (public.save_important_date_service(pg_temp.u(person), tests.id('r'), id, title, kind, starts, starts,
    recurrence, '', true, pg_temp.locs(keys), pg_temp.date_rev(id)) ->> 'important_date_id')::uuid;
end;
$$;

create function pg_temp.set_date(person text, id uuid, action text) returns jsonb language sql as $$
  select public.set_important_date_state_service(pg_temp.u(person), tests.id('r'), id, action)
$$;

create function pg_temp.sees_ann(person text, id uuid) returns jsonb language sql as $$
  select a from jsonb_array_elements(public.get_announcements_service(pg_temp.u(person), tests.id('r')) -> 'announcements') a
  where (a ->> 'id')::uuid = id
$$;

-- The people a notification told: every outbox row for the subject made
-- after the last pg_temp.mark().
create temporary table marked (id uuid primary key);
create function pg_temp.mark() returns void language sql as $$
  insert into marked select o.id from public.notification_outbox o on conflict do nothing
$$;
create function pg_temp.told(subject uuid) returns text[] language sql as $$
  select coalesce(array_agg(distinct p.label order by p.label), '{}')
  from public.notification_outbox o
  cross join lateral jsonb_array_elements_text(o.payload -> 'recipient_user_ids') r(user_id)
  join (select i.label, i.id from tests.ids i where i.label ~ '^r:[a-z]+:user$') u on u.id = r.user_id::uuid
  cross join lateral (select split_part(u.label, ':', 2) label) p
  where o.subject_id = subject::text and not exists (select 1 from marked m where m.id = o.id)
$$;

-- The notification worker: every queued notice of world r lands in inboxes.
create function pg_temp.deliver() returns void language plpgsql as $$
declare queued uuid;
begin
  for queued in select o.id from public.notification_outbox o
                where o.workspace_id = tests.id('r') and o.status in ('pending', 'retry') loop
    update public.notification_outbox
    set status = 'leased', lease_owner = 'edge-cases', lease_expires_at = now() + interval '1 minute'
    where notification_outbox.id = queued;
    perform public.process_notification_outbox_service('edge-cases', queued);
  end loop;
end;
$$;

-- Does this person have the notice about this record in their inbox?
create function pg_temp.has_notice(person text, subject uuid) returns boolean language sql as $$
  select exists (
    select 1 from public.notification_inbox_items item
    join public.notification_recipients recipient on recipient.id = item.recipient_projection_id
    join public.notification_outbox outbox
      on outbox.event_id = recipient.event_id and outbox.workspace_id = recipient.workspace_id
    where outbox.subject_id = subject::text and recipient.recipient_user_id = pg_temp.u(person)
      and item.visibility_state = 'visible')
$$;

-- 3. The API reads the Schedule's closed days (BL-530) ---------------------------------

select tests.remember('r:date:closed', pg_temp.save_date('owner', array['K'], 'Inventory closed', kind => 'closed_day'));
set local role service_role;
select lives_ok($$select count(*) from public.schedule_closures$$,
  'BL-530: the API, as service_role, reads the Schedule''s closed days');
reset role;
select is((select count(*)::integer from public.schedule_closures c
           where c.workspace_id = tests.id('r') and c.location_id = tests.id('r:K') and c.closed_date = current_date + 60),
  1, 'BL-530: the Kadikoy closed day is one closure');

-- 4. An author who has left: admin and owner only (K2 addendum) ---------------------------

select tests.remember('r:date:hande', pg_temp.save_date('hande', array['K'], 'Hande''s date'));
select tests.remember('r:ann:hande', pg_temp.save_ann('hande', array['K'], 'Hande at K'));
select pg_temp.publish('hande', tests.id('r:ann:hande'));
select public.remove_employee_access_service(pg_temp.u('owner'), tests.id('r'), tests.id('r:hande'));
select is(pg_temp.try(format($$select pg_temp.save_date('ayse', array['K'], 'Changed by Ayse', id => %L)$$, tests.id('r:date:hande'))),
  '42501 authz.rank', 'K2: admin Hande has left; the Kadikoy manager cannot change her date');
select is(pg_temp.try(format($$select pg_temp.save_ann('ayse', array['K'], 'Changed by Ayse', id => %L)$$, tests.id('r:ann:hande'))),
  '42501 authz.rank', 'K2: nor her published Kadikoy announcement');
select is(pg_temp.try(format($$select pg_temp.save_date('owner', array['K'], 'Changed by the owner', id => %L)$$, tests.id('r:date:hande'))),
  'ok', 'K2: the owner changes it');
select is(pg_temp.try(format($$select pg_temp.save_ann('zeynep', array['K'], 'Changed by Zeynep', id => %L)$$, tests.id('r:ann:hande'))),
  'ok', 'K2: an admin changes it');

-- Selin, a Kadikoy manager, has left: her rank is the last role she had, so
-- her records stay a manager's (Mert, 2026-10-02: "En nihayetinde o da
-- müdürdü."). Kadikoy's other managers act on them (K3); Besiktas's do not.
select tests.remember('r:ann:selin', pg_temp.save_ann('selin', array['K'], 'Selin at K'));
select pg_temp.publish('selin', tests.id('r:ann:selin'));
select tests.remember('r:date:selin', pg_temp.save_date('selin', array['K'], 'Selin''s date'));
select public.remove_employee_access_service(pg_temp.u('owner'), tests.id('r'), tests.id('r:selin'));
select is(pg_temp.try(format($$select pg_temp.save_ann('ayse', array['K'], 'Selin at K, by Ayse', id => %L)$$, tests.id('r:ann:selin'))),
  'ok', 'K2: manager Selin has left; Ayse, Kadikoy''s manager too, still changes her announcement');
select is(pg_temp.try(format($$select public.set_announcement_state_service(pg_temp.u('ayse'), tests.id('r'), %1$L, pg_temp.rev(%1$L), 'unpublish')$$,
  tests.id('r:ann:selin'))), 'ok', 'K2: and unpublishes it');
select is(pg_temp.try(format($$select pg_temp.save_date('ayse', array['K'], 'Selin''s date, by Ayse', id => %L)$$, tests.id('r:date:selin'))),
  'ok', 'K2: and changes her important date');
select is(pg_temp.try(format($$select pg_temp.set_date('ayse', %L, 'archive')$$, tests.id('r:date:selin'))),
  'ok', 'K2: and archives it');
select is(pg_temp.try(format($$select pg_temp.save_ann('veli', array['K'], 'Selin at K, by Veli', id => %L)$$, tests.id('r:ann:selin'))),
  '42501 authz.out_of_scope', 'K3: Veli, Besiktas''s manager only, does not');

-- Mina's account is gone, and the date no longer says who wrote it: missing
-- author information never lets a manager in (CLAUDE.md §9, fail closed).
select tests.remember('r:date:mina', pg_temp.save_date('mina', array['K'], 'Mina''s date'));
select is(pg_temp.try(format($$select pg_temp.save_date('ayse', array['K'], 'Peer change', id => %L)$$, tests.id('r:date:mina'))),
  'ok', 'K3: while Mina is here, Ayse changes her peer''s date');
-- ponytail: deleting her account sets created_by to null (on delete set null); the rule under test is the date's.
update public.important_dates set created_by = null where id = tests.id('r:date:mina');
select is(pg_temp.try(format($$select pg_temp.save_date('ayse', array['K'], 'Peer change again', id => %L)$$, tests.id('r:date:mina'))),
  '42501 authz.rank', 'K2: a date whose author is unknown is not a manager''s to change');
select is(pg_temp.try(format($$select pg_temp.save_date('zeynep', array['K'], 'Admin change', id => %L)$$, tests.id('r:date:mina'))),
  'ok', 'K2: an admin changes it');

-- 5. The minute's release: one broken row holds up nobody (O2) ------------------------------

select tests.world('n');
select tests.remember('n:ann', (public.save_announcement_audience_service(tests.user('n:owner'), tests.id('n'), null, null,
  'Broken', 'Body', 'general', array['employee'], array[tests.id('n:K')], now() + interval '1 hour', null, null, '{}', '{}')
  ->> 'announcement_id')::uuid);
select public.publish_announcement_service(tests.user('n:owner'), tests.id('n'), tests.id('n:ann'), pg_temp.rev(tests.id('n:ann')));
select tests.remember('r:ann:due', pg_temp.save_ann('owner', array['K'], 'Due', publish_at => now() + interval '1 hour'));
select pg_temp.publish('owner', tests.id('r:ann:due'));
-- ponytail: time passes by moving their hour back.
update public.announcements set publish_at = now() - interval '1 minute' where id in (tests.id('n:ann'), tests.id('r:ann:due'));
create function pg_temp.break_release() returns trigger language plpgsql as $$
begin
  if new.id = tests.id('n:ann') and new.status = 'published' then
    raise exception 'this row cannot be published';
  end if;
  return new;
end;
$$;
create trigger edge_cases_break_release before update on public.announcements
  for each row execute function pg_temp.break_release();
select is(pg_temp.try('select app_private.announcement_release()'), 'ok',
  'O2: one row that cannot be published does not stop the minute''s release');
select is(pg_temp.status(tests.id('r:ann:due')), 'published', 'O2: another workspace''s announcement goes out');
select ok((select (to_jsonb(a) ->> 'release_failed_at') is not null from public.announcements a where a.id = tests.id('n:ann')),
  'O2: the broken one is set aside');
select is(pg_temp.try(format('select public.get_announcements_service(%L, %L)', tests.user('n:owner'), tests.id('n'))), 'ok',
  'O2: and its workspace''s announcements still open');
drop trigger edge_cases_break_release on public.announcements;

-- Somebody who is not a member is reached by nothing: a plain no, never an
-- unknown that a caller might read either way (fail closed).
select is(app_private.communication_reaches(app_private.actor(tests.user('n:owner'), tests.id('r')), tests.id('r'),
  '{}', true, null, null, null), false, 'an outsider is not reached by a workspace-wide record: false, not null');

-- 6. A scheduled announcement without its time is a draft (KK-92 a) ----------------------------

select tests.remember('r:ann:untimed', pg_temp.save_ann('owner', array['K'], 'Untimed', publish_at => now() + interval '1 hour'));
select is(pg_temp.publish('owner', tests.id('r:ann:untimed')) ->> 'status', 'scheduled', 'a future announcement is scheduled');
select pg_temp.mark();
select pg_temp.save_ann('owner', array['K'], 'Untimed', id => tests.id('r:ann:untimed'), publish_at => null);
select is(pg_temp.status(tests.id('r:ann:untimed')), 'draft', 'KK-92 a: its time taken away, it waits as a draft');
select is(pg_temp.told(tests.id('r:ann:untimed')), '{}'::text[], 'KK-92 a: and nobody is told');

-- 7. A scheduled announcement whose time ran out does not go out (KK-92 e) ----------------------

select tests.remember('r:ann:late', pg_temp.save_ann('owner', array['K'], 'Late',
  publish_at => now() + interval '1 hour', expires_at => now() + interval '2 hours'));
select pg_temp.publish('owner', tests.id('r:ann:late'));
-- ponytail: the system was down until after it expired.
update public.announcements set publish_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
where id = tests.id('r:ann:late');
select pg_temp.mark();
select public.get_announcements_service(pg_temp.u('owner'), tests.id('r'));
select is(pg_temp.status(tests.id('r:ann:late')), 'unpublished', 'KK-92 e: it waits unpublished');
select is(pg_temp.told(tests.id('r:ann:late')), '{}'::text[], 'KK-92 e: nobody is told');
select is(pg_temp.try(format($$select pg_temp.publish('owner', %L)$$, tests.id('r:ann:late'))), '22023 ',
  'KK-92 e: nor can it be published by hand');

-- 8. Archived locations (KK-86) ----------------------------------------------------------

select tests.remember('r:ann:km', pg_temp.save_ann('owner', array['K', 'M'], 'Kadikoy and Moda'));
select tests.remember('r:ann:m', pg_temp.save_ann('owner', array['M'], 'Moda only'));
select tests.remember('r:ann:k', pg_temp.save_ann('owner', array['K'], 'Kadikoy only'));
select tests.remember('r:date:m', pg_temp.save_date('owner', array['M'], 'Moda date'));
select tests.remember('r:date:moda-first', pg_temp.save_date('owner', array['M'], 'Moda first'));
update public.locations set archived_at = now() where id = tests.id('r:M');
-- Oya managed Moda too. Moved to Kadikoy after Moda closed, the date's Moda
-- version stays hidden from her: an archived location counts nowhere (KK-86).
select pg_temp.save_date('owner', array['K'], 'Moda first', id => tests.id('r:date:moda-first'));
select is((select c -> 'after' from jsonb_array_elements(public.read_important_date_history_service(pg_temp.u('oya'), tests.id('r'),
    tests.id('r:date:moda-first')) -> 'changes') c where c ->> 'action' = 'created'), '{"hidden": true}'::jsonb,
  'KK-86: a version only at archived Moda is hidden even from Oya, who was Moda''s manager');
select is((select c -> 'after' from jsonb_array_elements(public.read_important_date_history_service(pg_temp.u('ayse'), tests.id('r'),
    tests.id('r:date:moda-first')) -> 'changes') c where c ->> 'action' = 'created'), '{"hidden": true}'::jsonb,
  'KK-86: and from Ayse, Kadikoy''s manager');
-- The mask is the managers' scope; the owner and the admins see every
-- location, so nothing is hidden from them (KARARLAR Settings S4, P09, P11).
select is((select c -> 'after' ->> 'title' from jsonb_array_elements(public.read_important_date_history_service(pg_temp.u('owner'), tests.id('r'),
    tests.id('r:date:moda-first')) -> 'changes') c where c ->> 'action' = 'created'), 'Moda first',
  'the owner sees the version that stayed at archived Moda');
select is((select c ->> 'actor_name' from jsonb_array_elements(public.read_important_date_history_service(pg_temp.u('zeynep'), tests.id('r'),
    tests.id('r:date:moda-first')) -> 'changes') c where c ->> 'action' = 'created'), 'Olcay Owner',
  'an admin sees it too, with who wrote it');
select is((select array_agg(id::uuid order by id) from jsonb_array_elements_text(pg_temp.sees_ann('owner', tests.id('r:ann:km')) -> 'location_ids') id),
  (select array_agg(id order by id) from unnest(pg_temp.locs(array['K', 'M'])) id),
  'KK-86: the announcement still lists archived Moda, so an edit keeps it');
select is(pg_temp.sees_ann('owner', tests.id('r:ann:km')) -> 'live_location_ids', to_jsonb(pg_temp.locs(array['K'])),
  'KK-86: it reaches Kadikoy only');
select is(pg_temp.try(format($$select pg_temp.save_ann('owner', '{}', 'Moda only', id => %L)$$, tests.id('r:ann:m'))), '22023 ',
  'KK-86: an announcement at archived Moda does not become the whole workspace by losing it');
select is(pg_temp.try(format($$select pg_temp.save_date('owner', '{}', 'Moda date', id => %L)$$, tests.id('r:date:m'))), '22023 ',
  'KK-86: nor does an important date');
select is(pg_temp.try(format($$select pg_temp.save_ann('owner', '{}', 'Everybody', id => %L)$$, tests.id('r:ann:k'))), 'ok',
  'K1: the owner may still make a Kadikoy announcement the whole workspace''s');

-- 9. A moved date's history hides where the reader cannot see (KK-92 b) -------------------------

select tests.remember('r:date:moved', pg_temp.save_date('owner', array['B'], 'Moved date'));
select pg_temp.save_date('owner', array['K'], 'Moved date', id => tests.id('r:date:moved'));
create temporary table moved_history as
select c from jsonb_array_elements(public.read_important_date_history_service(pg_temp.u('ayse'), tests.id('r'),
  tests.id('r:date:moved')) -> 'changes') c;
select is((select c -> 'after' from moved_history where c ->> 'action' = 'created'), '{"hidden": true}'::jsonb,
  'KK-92 b: Ayse does not see the version that was only at Besiktas');
select is((select c -> 'before' from moved_history where c ->> 'action' = 'updated'), '{"hidden": true}'::jsonb,
  'KK-92 b: not as the change''s old value either');
select is((select c -> 'after' ->> 'title' from moved_history where c ->> 'action' = 'updated'), 'Moved date',
  'KK-92 b: she sees the Kadikoy version');
select is((select jsonb_build_array(c -> 'actor_user_id', c -> 'actor_name', c -> 'changed_at') from moved_history where c ->> 'action' = 'created'),
  '[null, null, null]'::jsonb, 'K6: nor who wrote the hidden version, or when');
select ok((select c ->> 'actor_user_id' is not null and c ->> 'actor_name' is not null and c ->> 'changed_at' is not null
           from moved_history where c ->> 'action' = 'updated'),
  'K6: the change that brought it to Kadikoy, which she sees, keeps who and when');
select is((select count(*)::integer from jsonb_array_elements(public.read_important_date_history_service(pg_temp.u('owner'), tests.id('r'),
  tests.id('r:date:moved')) -> 'changes') c where c -> 'after' ? 'hidden' or c -> 'before' ? 'hidden'), 0,
  'KK-92 b: the owner sees every version');

-- 10. Two people editing at once: the later save is refused (KK-92 c) ----------------------------

select tests.remember('r:ann:rev', pg_temp.save_ann('owner', array['K'], 'Revisioned'));
select is(pg_temp.try(format($$select public.save_announcement_audience_service(%L, %L, %L, null, 'Changed', 'Body', 'general',
    array['employee'], %L::uuid[], null, null, null, '{}', '{}')$$, pg_temp.u('owner'), tests.id('r'), tests.id('r:ann:rev'), pg_temp.locs(array['K']))),
  'PT409 ', 'KK-92 c: an announcement change that names no revision is refused');
select is(pg_temp.try(format($$select public.save_announcement_audience_service(%L, %L, %L, %s, 'Changed', 'Body', 'general',
    array['employee'], %L::uuid[], null, null, null, '{}', '{}')$$, pg_temp.u('owner'), tests.id('r'), tests.id('r:ann:rev'),
    pg_temp.rev(tests.id('r:ann:rev')) - 1, pg_temp.locs(array['K']))),
  'PT409 ', 'KK-92 c: so is one made on an old revision');
select tests.remember('r:date:rev', pg_temp.save_date('owner', array['K'], 'Revisioned date'));
select pg_temp.save_date('owner', array['K'], 'Revisioned date, saved once', id => tests.id('r:date:rev'));
select is(pg_temp.try(format($$select public.save_important_date_service(%L, %L, %L, 'Saved twice', 'event', '2026-12-25', '2026-12-25',
    'none', '', true, %L::uuid[], %s)$$, pg_temp.u('owner'), tests.id('r'), tests.id('r:date:rev'), pg_temp.locs(array['K']),
    coalesce(pg_temp.date_rev(tests.id('r:date:rev')) - 1, 1))),
  'PT409 ', 'KK-92 c: an important date saved on an old revision is refused, not lost');
select is(pg_temp.try(format($$select public.save_important_date_service(%L, %L, %L, 'Saved twice', 'event', '2026-12-25', '2026-12-25',
    'none', '', true, %L::uuid[], null)$$, pg_temp.u('owner'), tests.id('r'), tests.id('r:date:rev'), pg_temp.locs(array['K']))),
  'PT409 ', 'KK-92 c: so is one that names no revision');
select is(pg_temp.try(format($$select public.set_announcement_state_service(%L, %L, %L, %s, 'archive')$$,
    pg_temp.u('owner'), tests.id('r'), tests.id('r:ann:rev'), pg_temp.rev(tests.id('r:ann:rev')) - 1)),
  'PT409 ', 'KK-92 c: archiving an announcement on an old revision is refused too');

-- BL-958: no lasting conflict is refused with 40001. PostgREST takes 40001 for
-- a passing conflict and runs the same request again, forever, holding one of
-- its connections; ten such saves stop the API for every workspace. A lasting
-- conflict answers PT409, keeping its hint. The list is every function moved
-- off 40001 (ACIL-40001): a later migration that brings 40001 back to one of
-- them turns this red. Schedule's editing services are EKRAN-01's.
select is(array(
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
      ('app_private', 'apply_owner_onboarding_update'), ('app_private', 'important_date_close_shifts'),
      ('app_private', 'time_off_finalize'), ('app_private', 'time_off_release_shifts'),
      ('public', 'create_employee_command_service'), ('public', 'decide_time_off_service'),
      ('public', 'employee_request_action_service'), ('public', 'leave_employee_onboarding_service'),
      ('public', 'publish_announcement_service'), ('public', 'request_time_off_cancellation_service'),
      ('public', 'review_employee_onboarding_before_availability_service'), ('public', 'revoke_time_off_service'),
      ('public', 'save_announcement_audience_service'), ('public', 'save_employee_onboarding_profile_service'),
      ('public', 'save_employee_service'), ('public', 'save_important_date_service'),
      ('public', 'save_notification_policy_service'), ('public', 'save_notification_user_preferences_service'),
      ('public', 'set_announcement_state_service'), ('public', 'set_important_date_state_service'),
      ('public', 'shorten_time_off_service'), ('public', 'submit_employee_onboarding_service'),
      ('public', 'submit_time_off_service'), ('public', 'weekly_preference_settings_save_service'))
    -- Every way to raise 40001; PL/pgSQL keywords are case-insensitive.
    and p.prosrc ~* $re$(errcode\s*=\s*'(40001|serialization_failure)'|raise\s+(exception\s+)?sqlstate\s+'40001'|raise\s+serialization_failure)$re$
  order by 1), '{}'::text[], 'BL-958: no lasting conflict in these 24 functions is refused with 40001');

-- 11. Republishing an important date (K7) ---------------------------------------------------

select tests.remember('r:date:open', pg_temp.save_date('owner', array['K'], 'Menu day'));
select pg_temp.deliver();
select public.act_on_notification_inbox_item_v2_service(pg_temp.u('emre'), tests.id('r'), (
  select item.id from public.notification_inbox_items item
  join public.notification_recipients recipient on recipient.id = item.recipient_projection_id
  join public.notification_outbox outbox on outbox.event_id = recipient.event_id
  where outbox.subject_id = tests.id('r:date:open')::text and recipient.recipient_user_id = pg_temp.u('emre')), 'read');
select pg_temp.set_date('owner', tests.id('r:date:open'), 'unpublish');
select pg_temp.mark();
select pg_temp.set_date('owner', tests.id('r:date:open'), 'republish');
select ok(not 'emre' = any (pg_temp.told(tests.id('r:date:open'))) and 'ali' = any (pg_temp.told(tests.id('r:date:open'))),
  'K7: republishing the same date tells those who have not opened it, not Emre who has');
select pg_temp.set_date('owner', tests.id('r:date:open'), 'unpublish');
select pg_temp.save_date('owner', array['K'], 'Menu day, new menu', id => tests.id('r:date:open'));
select pg_temp.mark();
select pg_temp.set_date('owner', tests.id('r:date:open'), 'republish');
select ok('emre' = any (pg_temp.told(tests.id('r:date:open'))),
  'K7: changed while unpublished, it tells everybody again when it comes back, Emre too');

-- 12. A narrower audience takes back its notices (BL-534) ------------------------------------

select tests.remember('r:ann:narrow', pg_temp.save_ann('owner', array['K', 'B'], 'Both places'));
select pg_temp.publish('owner', tests.id('r:ann:narrow'));
select pg_temp.deliver();
select ok(pg_temp.has_notice('deniz', tests.id('r:ann:narrow')) and pg_temp.has_notice('emre', tests.id('r:ann:narrow')),
  'BL-534: a Kadikoy and Besiktas announcement is in Deniz''s and Emre''s inboxes');
select pg_temp.mark();
select pg_temp.save_ann('owner', array['K'], 'Both places', id => tests.id('r:ann:narrow'));
select ok(not pg_temp.has_notice('deniz', tests.id('r:ann:narrow')),
  'BL-534: Besiktas taken off, Deniz (Besiktas only) no longer has it');
select ok(pg_temp.has_notice('emre', tests.id('r:ann:narrow')) and pg_temp.has_notice('ali', tests.id('r:ann:narrow')),
  'BL-534: Emre and Ali (Kadikoy too) keep theirs');
select is(pg_temp.told(tests.id('r:ann:narrow')), '{}'::text[], 'BL-534: nobody is told anything new');
select pg_temp.mark();
select pg_temp.save_ann('owner', array['K', 'B'], 'Both places', id => tests.id('r:ann:narrow'));
select is(pg_temp.told(tests.id('r:ann:narrow')), array['deniz', 'veli'],
  'BL-534: Besiktas back, its people are told again');

-- Before the worker has delivered it: narrowed, it never reaches Deniz.
select tests.remember('r:date:narrow', pg_temp.save_date('owner', array['K', 'B'], 'Both places date'));
select pg_temp.save_date('owner', array['K'], 'Both places date', id => tests.id('r:date:narrow'));
select pg_temp.deliver();
select ok(not pg_temp.has_notice('deniz', tests.id('r:date:narrow')),
  'BL-534: an important date narrowed before delivery never reaches Deniz');
select ok(pg_temp.has_notice('emre', tests.id('r:date:narrow')), 'BL-534: it reaches Emre');

-- 13. A closed day closes the weeks still being planned, never a locked one (P09, K11) -------------

select is(pg_temp.try($$select pg_temp.save_date('owner', array['K'], 'Last Tuesday closed',
  starts => public.schedule_current_week_start_service(tests.id('r')) - 6, kind => 'closed_day')$$),
  'P0001 important_date.past', 'K11: a closed day cannot be put on last week''s Tuesday');
select tests.remember('r:date:this-week', pg_temp.save_date('owner', array['K'], 'This Tuesday closed',
  starts => public.schedule_current_week_start_service(tests.id('r')) + 1, kind => 'closed_day'));
-- Its anniversary falls on this week's Thursday, never on the Tuesday above (on a
-- Tuesday, three years before today would land on it and close it twice).
select tests.remember('r:date:yearly-closed', pg_temp.save_date('owner', array['K'], 'Yearly closed',
  starts => (public.schedule_current_week_start_service(tests.id('r')) + 3 - interval '3 years')::date,
  kind => 'closed_day', recurrence => 'annual'));
select is((select count(*)::integer from public.schedule_closures c where c.workspace_id = tests.id('r')
           and c.closed_date = public.schedule_current_week_start_service(tests.id('r')) - 6), 0,
  'P09: a closed day put on last week''s Tuesday leaves that locked week as it was');
select is((select count(*)::integer from public.schedule_closures c where c.workspace_id = tests.id('r')
           and c.closed_date = public.schedule_current_week_start_service(tests.id('r')) + 1), 1,
  'P09: one put on this week''s Tuesday closes it');
select is((select count(*)::integer from public.schedule_closures c where c.workspace_id = tests.id('r')
           and c.closed_date < public.schedule_current_week_start_service(tests.id('r'))), 0,
  'P09: a yearly closed day closes nothing before this week either');

-- 14. A date already over tells nobody ("bildirim gürültüsü") -------------------------------------

-- Whether a day earlier this week can still be written depends on the weekday
-- (K11), so the rule a save, a change and a republish all ask is asked
-- directly, of dates put in place the way an older save left them.
create function pg_temp.notified(title text, starts date, keys text[]) returns uuid[] language sql as $$
  insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note, affects_scheduling,
    location_ids, location_id, created_by, updated_by)
  values (tests.id('r'), title, 'event', starts, starts, 'none', '', true, pg_temp.locs(keys),
    case when cardinality(keys) = 1 then tests.id('r:' || keys[1]) end, pg_temp.u('owner'), pg_temp.u('owner'));
  select app_private.important_date_notified(d) from public.important_dates d where d.workspace_id = tests.id('r') and d.title = notified.title
$$;
select is(pg_temp.notified('Yesterday''s tasting', (now() at time zone 'Europe/Istanbul')::date - 1, array['K']), '{}'::uuid[],
  'a date that ended yesterday at Kadikoy tells nobody');
select tests.remember('r:date:yearly', pg_temp.save_date('owner', array['K'], 'Yearly party',
  starts => (current_date - interval '3 years' - interval '1 day')::date, recurrence => 'annual'));
select ok('emre' = any (pg_temp.told(tests.id('r:date:yearly'))),
  'a yearly date whose first day is long past comes again, so it tells its people');
-- Kadikoy is a day behind Besiktas here: a date ending on Kadikoy's today is over at Besiktas.
-- ponytail: the time zones change by hand; the rule under test is the date's.
update public.locations set timezone = 'Pacific/Pago_Pago' where id = tests.id('r:K');
update public.locations set timezone = 'Pacific/Kiritimati' where id = tests.id('r:B');
create temporary table split_told as
  select pg_temp.notified('Today at Kadikoy only', (now() at time zone 'Pacific/Pago_Pago')::date, array['K', 'B']) who;
select ok(pg_temp.u('emre') = any ((select who from split_told)::uuid[]) and pg_temp.u('ali') = any ((select who from split_told)::uuid[]),
  'a date still on at Kadikoy tells Kadikoy''s people');
select ok(not pg_temp.u('deniz') = any ((select who from split_told)::uuid[]) and not pg_temp.u('veli') = any ((select who from split_told)::uuid[]),
  'not Besiktas''s, where it is already over');
update public.locations set timezone = 'Europe/Istanbul' where id in (tests.id('r:K'), tests.id('r:B'));

-- 15. A yearly date's notice opens its next time, not its first year ---------------------------------

select tests.remember('r:date:tomorrow', pg_temp.save_date('owner', array['K'], 'Anniversary tomorrow',
  starts => (current_date - interval '3 years' + interval '1 day')::date, recurrence => 'annual'));
select is((select o.payload ->> 'action_url' from public.notification_outbox o where o.subject_id = tests.id('r:date:tomorrow')::text),
  '/app/schedule?date=' || (current_date + 1)::text, 'a yearly date''s notice opens the week of its coming day');
select is((select o.payload ->> 'body' from public.notification_outbox o where o.subject_id = tests.id('r:date:tomorrow')::text),
  to_char(current_date + 1, 'Mon FMDD, YYYY'), 'and its text names that day, not its first year''s');
select is((select o.payload ->> 'action_url' from public.notification_outbox o where o.subject_id = tests.id('r:date:yearly')::text),
  '/app/schedule?date=' || (current_date - 1 + interval '1 year')::date::text, 'one whose day passed this year opens next year''s');

select * from finish();
rollback;
