-- ROL-CIFT 3.1, part 1 of 4 of one_decision_chain: split at function boundaries to go live in pieces;
-- parts 2-4 run after it.
-- ROL-CIFT 3.1 (KARARLAR S-164, S-169 and its addition; design §4.5, §8.1): every request a manager
-- decides last (a cover, a swap, a release application, time off) follows one chain: the location's
-- manager other than the person who asked, else an admin, else the owner. Rank is not counted on the
-- employee side: Kadikoy's manager decides the cover of an admin who works at Kadikoy, and a peer
-- manager decides a dual-role manager's. The chain only says who is told; an admin and the owner
-- decide at every step. Nobody decides their own, with one exception: the owner, when nobody else can
-- answer the request, decides it in Requests (the owner changes any shift already, so nothing grows).
--
-- Part 1: the core's rows stop counting rank for deciding and reading these requests (time_off.revoke,
-- a management action, keeps it); app_private.decision_tier names the step; the one decision helper
-- (exchange_decision_reason) and time off's core call (time_off_reason) carry the owner exception;
-- the time-off notice past the managers goes to the admins, and to the owner only without one.

update app_private.authz_actions set rank_below = false, owner_target_ok = false where key = 'exchange.approve';
update app_private.authz_actions set rank_below = false
where key in ('time_off.decide', 'time_off.decide_alone', 'requests.read');

-- Who answers a request at loc: 'location_manager', 'admin', 'owner', or 'self_only' when nobody but
-- an owner who is a side of it can (the owner exception). The sides are requester and other (employee
-- records); action is what deciding asks of the core there (time_off.decide_alone without a location).
create function app_private.decision_tier(w uuid, requester uuid, loc uuid, other uuid default null,
  action text default 'exchange.approve')
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with side as (
    select e.user_id from public.employee_profiles e
    where e.workspace_id = decision_tier.w and e.id in (decision_tier.requester, decision_tier.other) and e.user_id is not null
  ), decider as (
    -- Who holds a management access and may decide there; the class as the core holds it.
    select (app_private.actor(m.user_id, decision_tier.w)).class
    from public.workspace_memberships m
    where m.workspace_id = decision_tier.w and m.status = 'active' and m.role_id is not null
      and not exists (select 1 from side s where s.user_id = m.user_id)
      and app_private.authz_reason(m.user_id, decision_tier.w, decision_tier.action,
        case when decision_tier.loc is null then null else array[decision_tier.loc] end) is null
  )
  select case
    when exists (select 1 from decider d where d.class = 'manager') then 'location_manager'
    when exists (select 1 from decider d where d.class = 'admin') then 'admin'
    when exists (select 1 from decider d where d.class = 'owner') then 'owner'
    -- The owner holds every permission, so only an owner who is a side of it leaves nobody.
    else 'self_only' end;
$$;
revoke all on function app_private.decision_tier(uuid, uuid, uuid, uuid, text) from public;

-- Whether actor may decide (approve, decline, close) a shift change at loc between giver and receiver
-- (employee records; receiver null when closing). Null is yes; a no is the core's reason, 'rank' for
-- a side of it. Approve, decline, close, the Requests buttons and the private note all ask this.
create or replace function app_private.exchange_decision_reason(actor uuid, w uuid, giver uuid, receiver uuid, loc uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.employee_profiles e
                     where e.workspace_id = exchange_decision_reason.w
                       and e.id in (exchange_decision_reason.giver, exchange_decision_reason.receiver)
                       and e.user_id = exchange_decision_reason.actor)
      then app_private.authz_reason(actor, w, 'exchange.approve', array[loc])
    when (app_private.actor(actor, w)).class = 'owner' and app_private.decision_tier(w, giver, loc, receiver) = 'self_only'
      then app_private.authz_reason(actor, w, 'exchange.approve', array[loc])
    else 'rank' end;
$$;

-- The owner whom nobody else can answer decides their own time off alone and reads it in Requests:
-- no admin, and no manager at any of the owner's locations (S-169).
create or replace function app_private.time_off_reason(actor uuid, w uuid, action text, person uuid default null,
  place uuid default null, documents_aside boolean default false)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  state app_private.actor_state := app_private.actor(actor, w);
  rule_row app_private.authz_actions;
  why text;
begin
  select * into rule_row from app_private.authz_actions a where a.key = action;
  if not found then
    raise exception 'Unknown action %', action using errcode = '22023';
  end if;
  -- documents_aside: whether somebody could act once a missing document is in (a passing restriction).
  if state.class = 'owner' or documents_aside then
    state.document_blocked := false;
  end if;
  why := app_private.authz_check(state, rule_row, case when place is null then null else array[place] end, person, null);
  if why = 'rank' and action in ('time_off.decide_alone', 'requests.read') and state.class = 'owner'
     and exists (select 1 from public.employee_profiles e where e.id = person and e.workspace_id = w and e.user_id = actor)
     and app_private.decision_tier(w, person, null, null, 'time_off.decide_alone') = 'self_only'
     and not exists (select 1 from public.employee_location_assignments a
                     join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
                     where a.workspace_id = w and a.employee_id = person and a.ended_at is null
                       and app_private.location_is_live(l)
                       and app_private.decision_tier(w, person, a.location_id, null, 'time_off.decide') <> 'self_only') then
    return null;
  end if;
  return why;
end;
$$;

-- Where a location has no manager to vote, the request goes up one step: to the admins, and to the
-- owner only when there is no admin (S-169). The owner and the admins never count as a location's voters.
create or replace function app_private.notify_deciders(target_workspace uuid, target_action text, target_places uuid[],
  target_person uuid, target_wide_action text)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  wide uuid[] := app_private.notify_holders(target_workspace, target_wide_action, null, target_person);
  up uuid[] := array(select u from unnest(wide) u where (app_private.actor(u, target_workspace)).class = 'admin');
  found uuid[] := '{}';
  here uuid[];
  place uuid;
  short boolean := coalesce(cardinality(target_places), 0) = 0;
begin
  if cardinality(up) = 0 then
    up := wide;
  end if;
  foreach place in array coalesce(target_places, '{}'::uuid[]) loop
    here := array(select u from unnest(app_private.notify_holders(target_workspace, target_action, array[place], target_person)) u
                  where u <> all (wide));
    if cardinality(here) = 0 then
      short := true;
    end if;
    found := found || here;
  end loop;
  if short then
    found := found || up;
  end if;
  return array(select distinct u from unnest(found) u order by u);
end;
$$;
