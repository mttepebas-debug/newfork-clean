begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- TAKAS-BILDIRIM (Mert, 2026-10-20, items 30 and 32; KARARLAR S-126 changed: shift changes no longer wait
-- for the rest of the shift change work; the shift change plan, PD\notes\vardiya-degisim\PLAN.md §3):
-- every step of a release, a cover and a swap writes its notices into the core, once per person.
--   (a) a release reaches the teammates who find it in Available Shifts, never its owner;
--   (b) the first teammate who asks tells who decides it, once: the location's manager; an admin only
--       where no manager can (the owner only without an admin), as time off does (KARARLAR S-169);
--   (c) a decision tells who asked and who gives the shift; a manager's reason reaches only who asked
--       (BL-910); the decider hears nothing and their card closes;
--   (d) a teammate not chosen, a release taken back, a request asked by name and its answer, a swap and its
--       answer, and a request that closed before its shift each tell the people it changes;
--   (e) a request that still waits is reminded every 12 hours to who has not decided, and once more
--       4 hours before it closes; nothing twice;
--   (f) another workspace hears nothing; every notice is in its recipient's choices;
--   (g) one acceptance that ends tells only that teammate and leaves the request open; a manager's reason
--       for closing reaches who asked, not the owner; an answer closed when someone leaves tells the owner;
--       a private note for managers is in no notice.

select tests.world('sx');
select tests.world('sy');
-- Kadikoy (K) has a manager; Besiktas (B) has none.
select tests.person('sx', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('sx', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('sx', 'maria', 'employee', array['K'], array['cook']);
select tests.person('sx', 'jake', 'employee', array['K'], array['cook']);
select tests.person('sx', 'leo', 'employee', array['K'], array['cook']);
select tests.person('sx', 'emre', 'employee', array['K'], array['cook']);
select tests.person('sx', 'ali', 'employee', array['K'], array['cook']);
select tests.person('sx', 'deniz', 'employee', array['B'], array['cook']);
select tests.person('sx', 'berk', 'employee', array['B'], array['cook']);
select tests.person('sy', 'xena', 'manager', array['K'], array['cook']);
select tests.person('sy', 'yan', 'employee', array['K'], array['cook']);
select tests.person('sy', 'yusuf', 'employee', array['K'], array['cook']);
select tests.publish_week('sx', 1, '[
  {"label": "maria-mon", "person": "maria", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "22:00"},
  {"label": "maria-tue", "person": "maria", "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "maria-wed", "person": "maria", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"},
  {"label": "emre-thu", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "jake-fri", "person": "jake", "loc": "K", "job": "cook", "day": 4, "start": "10:00", "end": "15:00"},
  {"label": "leo-sat", "person": "leo", "loc": "K", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"},
  {"label": "maria-sun", "person": "maria", "loc": "K", "job": "cook", "day": 6, "start": "09:00", "end": "15:00"},
  {"label": "deniz-mon", "person": "deniz", "loc": "B", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "maria-thu", "person": "maria", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"},
  {"label": "maria-sat", "person": "maria", "loc": "K", "job": "cook", "day": 5, "start": "16:00", "end": "22:00"},
  {"label": "emre-fri", "person": "emre", "loc": "K", "job": "cook", "day": 4, "start": "16:00", "end": "22:00"}
]');
select tests.publish_week('sy', 1, '[
  {"label": "yan-mon", "person": "yan", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "22:00"}
]');

create temp table who as
select label, tests.user(label) uid
from unnest(array['sx:owner', 'sx:ayse', 'sx:zeynep', 'sx:maria', 'sx:jake', 'sx:leo', 'sx:emre', 'sx:ali',
  'sx:deniz', 'sx:berk', 'sy:owner', 'sy:xena', 'sy:yan', 'sy:yusuf']) label;
grant select on who to public;

create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user(person), tests.id(split_part(person, ':', 1)), command, gen_random_uuid())
$$;
create function pg_temp.rev(cid uuid) returns integer language sql stable as $$
  select revision from public.shift_exchange_cases where id = cid
$$;
-- A release of one's own shift: the case is remembered as '<w>:case:<shift>'.
create function pg_temp.release(person text, label text) returns uuid language sql as $$
  select tests.remember(split_part(person, ':', 1) || ':case:' || label, (pg_temp.command(person, jsonb_build_object(
    'action', 'create', 'kind', 'cover', 'shift_id', tests.id(split_part(person, ':', 1) || ':shift:' || label))) ->> 'case_id')::uuid)
$$;
-- Asking one teammate by name to cover.
create function pg_temp.ask(person text, label text, teammate text) returns uuid language sql as $$
  select tests.remember('sx:case:' || label, (pg_temp.command(person, jsonb_build_object(
    'action', 'create', 'kind', 'cover', 'shift_id', tests.id('sx:shift:' || label), 'employee_id', tests.id(teammate))) ->> 'case_id')::uuid)
$$;
create function pg_temp.app(cid uuid, person text) returns uuid language sql stable as $$
  select a.id from public.shift_exchange_applications a where a.case_id = cid and a.employee_id = tests.id(person)
  order by a.created_at desc limit 1
$$;
create function pg_temp.apply(person text, cid uuid) returns jsonb language sql as $$
  select pg_temp.command(person, jsonb_build_object('action', 'apply', 'case_id', cid,
    'shift_id', (select offered_source_id from public.shift_exchange_cases where id = cid)))
$$;
create function pg_temp.answer(person text, cid uuid, verb text) returns jsonb language sql as $$
  select pg_temp.command(person, jsonb_build_object('action', verb, 'case_id', cid, 'application_id', pg_temp.app(cid, person),
    'expected_revision', pg_temp.rev(cid)))
$$;
create function pg_temp.reject(manager text, cid uuid, person text, reason text) returns jsonb language sql as $$
  select pg_temp.command(manager, jsonb_build_object('action', 'reject', 'case_id', cid, 'application_id', pg_temp.app(cid, person),
    'expected_revision', pg_temp.rev(cid), 'reason', reason))
$$;
create function pg_temp.approve(manager text, cid uuid, person text) returns jsonb language sql as $$
  select pg_temp.command(manager, jsonb_build_object('action', 'approve', 'case_id', cid, 'application_id', pg_temp.app(cid, person),
    'expected_revision', pg_temp.rev(cid),
    'fingerprint', public.shift_exchange_preview(tests.user(manager), tests.id('sx'), cid, pg_temp.app(cid, person)) ->> 'fingerprint'))
$$;
create function pg_temp.close(person text, cid uuid) returns jsonb language sql as $$
  select pg_temp.command(person, jsonb_build_object('action', 'close', 'case_id', cid, 'expected_revision', pg_temp.rev(cid)))
$$;
-- Who got a notice of this type about this case, one label per notice.
create function pg_temp.told(type_key text, cid uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = 'shift_changes.' || told.type_key and n.subject_type = 'shift_exchange_case' and n.subject_id = cid
$$;
create function pg_temp.said(type_key text, cid uuid, person text) returns text language sql stable as $$
  select n.title || ' | ' || coalesce(n.body, '') from public.person_notifications n
  where n.type_key = 'shift_changes.' || said.type_key and n.subject_id = cid and n.user_id = tests.user(person)
$$;
create function pg_temp.card(type_key text, cid uuid, person text) returns text language sql stable as $$
  select coalesce(n.resolution, 'open') from public.person_notifications n
  where n.type_key = 'shift_changes.' || card.type_key and n.subject_id = cid and n.user_id = tests.user(person)
$$;
-- Shift Hub -> Available Shifts as the person reads it (no employee slot reads nothing).
create function pg_temp.offered(person text, cid uuid) returns boolean language plpgsql as $$
begin
  return exists (select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user(person), tests.id('sx'), false,
    tests.week(1), tests.week(1) + 6) -> 'opportunities') o where o ->> 'case_id' = cid::text);
exception when others then
  return false;
end $$;
create temp table checked (id uuid);
create function pg_temp.all_listed(said text) returns text language plpgsql as $$
declare missing text[] := tests.unlisted_notices(tests.id('sx'), array(select id from checked));
begin
  insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('sx');
  return said || ': ' || coalesce(nullif(array_to_string(missing, ', '), ''), 'all listed');
end $$;
grant execute on all functions in schema pg_temp to public;

-- (a) A release ------------------------------------------------------------------------------------------

select pg_temp.release('sx:maria', 'maria-mon');
select tests.settle();
select ok('sx:jake' = any (pg_temp.told('open_shift_available', tests.id('sx:case:maria-mon')))
  and 'sx:leo' = any (pg_temp.told('open_shift_available', tests.id('sx:case:maria-mon'))),
  '(a) Jake and Leo hear of Maria''s released Monday');
select is(pg_temp.told('open_shift_available', tests.id('sx:case:maria-mon')),
  array(select w.label from who w where w.label like 'sx:%' and pg_temp.offered(w.label, tests.id('sx:case:maria-mon'))
        order by w.label collate "C"),
  '(a) exactly the people who find it in Available Shifts hear of it');
select ok(not 'sx:maria' = any (pg_temp.told('open_shift_available', tests.id('sx:case:maria-mon'))),
  '(a) Maria, who released it, hears nothing');
select matches(pg_temp.said('open_shift_available', tests.id('sx:case:maria-mon'), 'sx:jake'),
  '^Extra shift available \| Maria Person can''t make Mon, .* · 4:00 PM–10:00 PM · Cook, Kadikoy\. Want it\?$',
  '(a) it says whose shift it is, when and where');
select is(pg_temp.told('approval_needed', tests.id('sx:case:maria-mon')), '{}'::text[],
  '(a) nobody asked yet: no manager is asked');

-- (b) The first teammate who asks tells the manager, once ------------------------------------------------

select pg_temp.apply('sx:jake', tests.id('sx:case:maria-mon'));
select pg_temp.apply('sx:leo', tests.id('sx:case:maria-mon'));
select pg_temp.apply('sx:emre', tests.id('sx:case:maria-mon'));
select tests.settle();
select is(pg_temp.told('approval_needed', tests.id('sx:case:maria-mon')), array['sx:ayse'],
  '(b) Kadikoy''s manager is asked to decide, once for three teammates; the admin is not');
select matches(pg_temp.said('approval_needed', tests.id('sx:case:maria-mon'), 'sx:ayse'),
  '^Shift change needs your approval \| Jake Person wants Maria Person''s Mon, ',
  '(b) the card names who asks for whose shift');
select is(pg_temp.all_listed('(a, b)'), '(a, b): all listed', '(a, b) every notice is in its recipient''s choices');

-- (c) Decisions -------------------------------------------------------------------------------------------

select pg_temp.reject('sx:ayse', tests.id('sx:case:maria-mon'), 'sx:jake', 'You were late twice this month');
select is(pg_temp.told('decided', tests.id('sx:case:maria-mon')), array['sx:jake'],
  '(c) a declined pickup tells Jake; Maria still has her shift and hears nothing');
select matches(pg_temp.said('decided', tests.id('sx:case:maria-mon'), 'sx:jake'),
  '^Your pickup request was declined \| You were late twice this month$', '(c) Jake reads the reason');
select is(pg_temp.card('approval_needed', tests.id('sx:case:maria-mon'), 'sx:ayse'), 'open',
  '(c) Ayse''s card stays open while Leo and Emre wait');

select pg_temp.approve('sx:ayse', tests.id('sx:case:maria-mon'), 'sx:leo');
select is(pg_temp.told('decided', tests.id('sx:case:maria-mon')), array['sx:jake', 'sx:leo', 'sx:maria'],
  '(c) the approval tells Leo and Maria; Ayse, who decided, hears nothing');
select matches(pg_temp.said('decided', tests.id('sx:case:maria-mon'), 'sx:leo'), '^Your pickup is approved \| Mon, ',
  '(c) Leo''s pickup is approved');
select matches(pg_temp.said('decided', tests.id('sx:case:maria-mon'), 'sx:maria'),
  '^You are no longer responsible for this shift \| Leo Person works Mon, ', '(c) Maria is let go of it');
select is(pg_temp.told('open_shift_taken', tests.id('sx:case:maria-mon')), array['sx:emre'],
  '(d) Emre, still waiting, hears another teammate got it');
select is(pg_temp.card('approval_needed', tests.id('sx:case:maria-mon'), 'sx:ayse'), 'approved',
  '(c) Ayse''s card closes as approved');
select isnt(pg_temp.card('open_shift_available', tests.id('sx:case:maria-mon'), 'sx:jake'), 'open',
  '(c) the open shift card closes for the pool');

-- (d) A release taken back ----------------------------------------------------------------------------------

select pg_temp.release('sx:maria', 'maria-tue');
select pg_temp.apply('sx:jake', tests.id('sx:case:maria-tue'));
select pg_temp.close('sx:maria', tests.id('sx:case:maria-tue'));
select is(pg_temp.told('open_shift_kept', tests.id('sx:case:maria-tue')), array['sx:jake'],
  '(d) Maria takes it back: Jake, who asked, hears she kept it');
select matches(pg_temp.said('open_shift_kept', tests.id('sx:case:maria-tue'), 'sx:jake'), '^Maria Person kept this shift \| Tue, ',
  '(d) in those words');
select is(pg_temp.card('approval_needed', tests.id('sx:case:maria-tue'), 'sx:ayse'), 'cancelled',
  '(d) Ayse''s card closes as cancelled');

-- (d) Asked by name, declined ------------------------------------------------------------------------------

select pg_temp.ask('sx:maria', 'maria-wed', 'sx:jake');
select is(pg_temp.told('cover_asked', tests.id('sx:case:maria-wed')), array['sx:jake'], '(d) Jake is asked by name');
select matches(pg_temp.said('cover_asked', tests.id('sx:case:maria-wed'), 'sx:jake'), '^Maria Person asked you to cover \| Wed, ',
  '(d) in those words');
select pg_temp.answer('sx:jake', tests.id('sx:case:maria-wed'), 'decline');
select is(pg_temp.told('cover_unfilled', tests.id('sx:case:maria-wed')), array['sx:maria'], '(d) Jake declines: Maria hears it');
select matches(pg_temp.said('cover_unfilled', tests.id('sx:case:maria-wed'), 'sx:maria'),
  '^No one could cover your Wed, .* shift \| Jake Person can''t cover it\. You are still responsible for this shift\.$',
  '(d) and that she still works it');
select is(pg_temp.card('cover_asked', tests.id('sx:case:maria-wed'), 'sx:jake'), 'declined', '(d) Jake''s card closes');
select is(pg_temp.told('approval_needed', tests.id('sx:case:maria-wed')), '{}'::text[], '(d) no manager was asked');

-- (c) The reason stays with who asked (BL-910: Ali, Ayse, Emre) ------------------------------------------

select pg_temp.ask('sx:emre', 'emre-thu', 'sx:ali');
select pg_temp.answer('sx:ali', tests.id('sx:case:emre-thu'), 'accept');
select is(pg_temp.told('approval_needed', tests.id('sx:case:emre-thu')), array['sx:ayse'], '(b) Ali accepts: Ayse is asked');
select pg_temp.reject('sx:ayse', tests.id('sx:case:emre-thu'), 'sx:ali', 'You are already close to overtime');
select is(pg_temp.told('decided', tests.id('sx:case:emre-thu')), array['sx:ali', 'sx:emre'], '(c) Ali and Emre hear the decision');
select matches(pg_temp.said('decided', tests.id('sx:case:emre-thu'), 'sx:ali'), 'You are already close to overtime',
  '(c) Ali reads the reason');
select doesnt_match(pg_temp.said('decided', tests.id('sx:case:emre-thu'), 'sx:emre'), 'overtime',
  '(c) Emre''s notice does not carry the reason');
select matches(pg_temp.said('decided', tests.id('sx:case:emre-thu'), 'sx:emre'),
  '^Your manager declined the cover \| Ali Person won''t cover Thu, .*\. You are still responsible for this shift\.$',
  '(c) Emre reads that it was declined and that he still works it');
select is(pg_temp.card('approval_needed', tests.id('sx:case:emre-thu'), 'sx:ayse'), 'declined', '(c) Ayse''s card closes');

-- (d) A swap -------------------------------------------------------------------------------------------------

select tests.remember('sx:case:swap', (pg_temp.command('sx:maria', jsonb_build_object('action', 'create', 'kind', 'swap',
  'shift_id', tests.id('sx:shift:maria-sun'), 'requested_shift_id', tests.id('sx:shift:jake-fri'))) ->> 'case_id')::uuid);
select is(pg_temp.told('swap_offered', tests.id('sx:case:swap')), array['sx:jake'], '(d) Jake is offered a swap');
select matches(pg_temp.said('swap_offered', tests.id('sx:case:swap'), 'sx:jake'),
  '^Confirm your swap with Maria Person \| You give Fri, .* · You get Sun, ', '(d) what he gives and gets');
select pg_temp.answer('sx:jake', tests.id('sx:case:swap'), 'accept');
select is(pg_temp.told('swap_answered', tests.id('sx:case:swap')), array['sx:maria'], '(d) Jake confirms: Maria hears it');
select matches(pg_temp.said('swap_answered', tests.id('sx:case:swap'), 'sx:maria'), '^Jake Person confirmed your swap \| ',
  '(d) in those words');
select is(pg_temp.card('swap_offered', tests.id('sx:case:swap'), 'sx:jake'), 'accepted', '(d) Jake''s card closes as accepted');
select is(pg_temp.told('approval_needed', tests.id('sx:case:swap')), array['sx:ayse'], '(b) Ayse is asked to decide the swap');
select pg_temp.approve('sx:ayse', tests.id('sx:case:swap'), 'sx:jake');
select is(pg_temp.told('decided', tests.id('sx:case:swap')), array['sx:jake', 'sx:maria'], '(c) both hear the swap is approved');
select matches(pg_temp.said('decided', tests.id('sx:case:swap'), 'sx:maria'), '^Your swap is approved \| You now work Fri, ',
  '(c) Maria now works Friday');
select matches(pg_temp.said('decided', tests.id('sx:case:swap'), 'sx:jake'), '^Your swap is approved \| You now work Sun, ',
  '(c) Jake now works Sunday');

-- (d) Closed before its shift -------------------------------------------------------------------------------

select pg_temp.release('sx:leo', 'leo-sat');
select pg_temp.apply('sx:jake', tests.id('sx:case:leo-sat'));
-- ponytail: the deadline passed (4 hours before the shift).
update public.shift_exchange_cases set expires_at = clock_timestamp() - interval '1 minute' where id = tests.id('sx:case:leo-sat');
select pg_temp.close('sx:leo', tests.id('sx:case:leo-sat'));
select is(pg_temp.told('closed', tests.id('sx:case:leo-sat')), array['sx:jake', 'sx:leo'],
  '(d) a request past its deadline tells its owner and who asked');
select matches(pg_temp.said('closed', tests.id('sx:case:leo-sat'), 'sx:leo'),
  '^Your shift change request closed \| It closed 4 hours before the shift\. You are still responsible for this shift\.$',
  '(d) Leo still works it');
select is(pg_temp.card('approval_needed', tests.id('sx:case:leo-sat'), 'sx:ayse'), 'expired', '(d) Ayse''s card closes');

-- (b, e) No manager at Besiktas; reminders -------------------------------------------------------------------

select pg_temp.release('sx:deniz', 'deniz-mon');
select pg_temp.apply('sx:berk', tests.id('sx:case:deniz-mon'));
select is(pg_temp.told('approval_needed', tests.id('sx:case:deniz-mon')), array['sx:zeynep'],
  '(b) no manager at Besiktas: the admin is asked, not the owner');
-- The pass reads every workspace: counted by this request's notices.
create function pg_temp.reminders() returns integer language sql as $$
  select count(*)::integer from public.person_notifications n
  where n.subject_id = tests.id('sx:case:deniz-mon') and n.type_key = 'shift_changes.approval_reminder'
$$;
grant execute on function pg_temp.reminders() to public;
select app_private.shift_exchange_remind();
select is(pg_temp.reminders(), 0, '(e) nothing is due an hour in');
-- ponytail: the request has waited 13 hours.
update public.shift_exchange_events set created_at = now() - interval '13 hours' where case_id = tests.id('sx:case:deniz-mon');
select app_private.shift_exchange_remind();
select is(pg_temp.reminders(), 1, '(e) after 12 hours one reminder');
select is(pg_temp.told('approval_reminder', tests.id('sx:case:deniz-mon')), array['sx:zeynep'], '(e) to the admin who has not decided');
select matches(pg_temp.said('approval_reminder', tests.id('sx:case:deniz-mon'), 'sx:zeynep'),
  '^Shift change still waits for your approval \| Berk Person wants Deniz Person''s Mon, ', '(e) in those words');
select app_private.shift_exchange_remind();
select is(pg_temp.reminders(), 1, '(e) and not twice');
update public.shift_exchange_events set created_at = now() - interval '25 hours' where case_id = tests.id('sx:case:deniz-mon');
select app_private.shift_exchange_remind();
select is(pg_temp.reminders(), 2, '(e) 12 hours later another');
-- ponytail: the request closes in 3 hours.
update public.shift_exchange_cases set expires_at = now() + interval '3 hours' where id = tests.id('sx:case:deniz-mon');
select app_private.shift_exchange_remind();
select is(pg_temp.reminders(), 3, '(e) 4 hours before it closes, a last one');
select is((select count(*)::integer from public.person_notifications n where n.subject_id = tests.id('sx:case:deniz-mon')
  and n.type_key = 'shift_changes.approval_reminder' and n.title ~ '^Decide by [A-Z][a-z]{2} [0-9:]+ [AP]M or it closes$'), 1,
  '(e) the last call names the deadline');
select app_private.shift_exchange_remind();
select is(pg_temp.reminders(), 3, '(e) once');
select pg_temp.approve('sx:zeynep', tests.id('sx:case:deniz-mon'), 'sx:berk');
select is((select count(*)::integer from public.person_notifications n where n.subject_id = tests.id('sx:case:deniz-mon')
  and n.type_key like 'shift_changes.approval_%' and n.resolved_at is null), 0, '(e) the decision closes the reminders too');

-- (g) Edges -------------------------------------------------------------------------------------------------

-- One acceptance ends (refresh_weekly_exchange_terms: the new hours overlap Jake's other shift); the
-- request stays open for Leo.
select pg_temp.release('sx:maria', 'maria-thu');
select pg_temp.apply('sx:jake', tests.id('sx:case:maria-thu'));
select pg_temp.apply('sx:leo', tests.id('sx:case:maria-thu'));
update public.shift_exchange_applications set status = 'invalidated'
where id = pg_temp.app(tests.id('sx:case:maria-thu'), 'sx:jake');
select public.shift_exchange_emit(null, tests.id('sx'), tests.id('sx:case:maria-thu'),
  pg_temp.app(tests.id('sx:case:maria-thu'), 'sx:jake'), 'invalidated', 'That acceptance ended; no assignment changed.');
select is((select status from public.shift_exchange_cases where id = tests.id('sx:case:maria-thu')), 'open', '(g) the request stays open');
select is(pg_temp.told('closed', tests.id('sx:case:maria-thu')), array['sx:jake'], '(g) only Jake hears his acceptance ended');
select matches(pg_temp.said('closed', tests.id('sx:case:maria-thu'), 'sx:jake'),
  '^Your request for Maria Person''s shift ended \| The shift changed and now overlaps another of your shifts\. Your schedule has not changed\.$',
  '(g) and why');
select is(pg_temp.card('approval_needed', tests.id('sx:case:maria-thu'), 'sx:ayse'), 'open', '(g) Ayse''s card stays open for Leo');

-- Ayse closes it with a reason and a note for managers.
select pg_temp.command('sx:ayse', jsonb_build_object('action', 'close', 'case_id', tests.id('sx:case:maria-thu'),
  'expected_revision', pg_temp.rev(tests.id('sx:case:maria-thu')), 'reason', 'Kitchen is closed that night',
  'private_note', 'GIZLI one'));
select is(pg_temp.told('closed', tests.id('sx:case:maria-thu')), array['sx:jake', 'sx:leo', 'sx:maria'],
  '(g) the real close still reaches Maria, and Leo');
select matches(pg_temp.said('closed', tests.id('sx:case:maria-thu'), 'sx:leo'), '\| Kitchen is closed that night$',
  '(g) Leo, who asked, reads the reason');
select doesnt_match(pg_temp.said('closed', tests.id('sx:case:maria-thu'), 'sx:maria'), 'Kitchen',
  '(g) Maria, the owner, does not');
select is(pg_temp.card('approval_needed', tests.id('sx:case:maria-thu'), 'sx:ayse'), 'cancelled', '(g) Ayse''s card closes');

-- Emre, asked by name, accepts; his access is removed (close_employee_side closes his answer).
select pg_temp.ask('sx:maria', 'maria-sat', 'sx:emre');
select pg_temp.answer('sx:emre', tests.id('sx:case:maria-sat'), 'accept');
update public.shift_exchange_applications set status = 'closed_case_cancelled'
where id = pg_temp.app(tests.id('sx:case:maria-sat'), 'sx:emre');
update public.shift_exchange_cases set status = 'cancelled' where id = tests.id('sx:case:maria-sat');
select public.shift_exchange_emit(tests.user('sx:owner'), tests.id('sx'), tests.id('sx:case:maria-sat'),
  pg_temp.app(tests.id('sx:case:maria-sat'), 'sx:emre'), 'application_closed', 'Their answer was closed. No assignment changed.');
select is(pg_temp.told('cover_unfilled', tests.id('sx:case:maria-sat')), array['sx:maria'], '(g) Maria hears Emre can no longer cover');
select matches(pg_temp.said('cover_unfilled', tests.id('sx:case:maria-sat'), 'sx:maria'),
  '^No one could cover your Sat, .* shift \| Emre Person can no longer cover it\. You are still responsible for this shift\.$', '(g) in those words');
select isnt(pg_temp.card('approval_needed', tests.id('sx:case:maria-sat'), 'sx:ayse'), 'open', '(g) Ayse''s card closes');

-- An approval with a note for managers.
select pg_temp.release('sx:emre', 'emre-fri');
select pg_temp.apply('sx:jake', tests.id('sx:case:emre-fri'));
select pg_temp.command('sx:ayse', jsonb_build_object('action', 'approve', 'case_id', tests.id('sx:case:emre-fri'),
  'application_id', pg_temp.app(tests.id('sx:case:emre-fri'), 'sx:jake'), 'expected_revision', pg_temp.rev(tests.id('sx:case:emre-fri')),
  'private_note', 'GIZLI two',
  'fingerprint', public.shift_exchange_preview(tests.user('sx:ayse'), tests.id('sx'), tests.id('sx:case:emre-fri'),
    pg_temp.app(tests.id('sx:case:emre-fri'), 'sx:jake')) ->> 'fingerprint'));
select is(pg_temp.told('decided', tests.id('sx:case:emre-fri')), array['sx:emre', 'sx:jake'], '(g) the approval with a note is told');
select is((select count(*)::integer from public.person_notifications n where n.workspace_id = tests.id('sx')
  and (n.title || coalesce(n.body, '') || n.data::text) like '%GIZLI%'), 0, '(g) no notice carries a note for managers');

-- (f) Another workspace ------------------------------------------------------------------------------------

select pg_temp.release('sy:yan', 'yan-mon');
select ok('sy:yusuf' = any (pg_temp.told('open_shift_available', tests.id('sy:case:yan-mon'))),
  '(f) in the other workspace Yusuf hears of Yan''s release');
select is((select count(*)::integer from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key like 'shift_changes.%' and ((w.label like 'sy:%' and n.workspace_id <> tests.id('sy'))
    or (w.label like 'sx:%' and n.workspace_id <> tests.id('sx')))), 0,
  '(f) nobody hears of a shift change in a workspace they are not in');
select is((select count(*)::integer from public.person_notifications n
  where n.type_key like 'shift_changes.%' and n.workspace_id = tests.id('sy') and n.user_id in (select uid from who where label like 'sx:%')), 0,
  '(f) and nobody in one workspace hears of the other''s');
select is(pg_temp.all_listed('(c-f)'), '(c-f): all listed', '(f) every notice is in its recipient''s choices');

select * from finish();
rollback;
