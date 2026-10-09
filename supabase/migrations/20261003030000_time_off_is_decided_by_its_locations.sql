-- FB-6.3.2: time off is decided by the locations of the person who asks.
--
-- Additions only (OPS-03: live first, then main). Nothing reads these yet; the
-- voting engine (20261003031000) and the deadlines (20261003032000) do. Until
-- then the old single-location services keep working unchanged.
--
-- Rules (user decisions 2026-09-30, KARARLAR "İzin"): a request belongs to the
-- person, so it has no location; the managers of every location the person
-- works at vote; the list is fixed when the request is sent; a request not
-- decided by its deadline is turned down by the system.

-- The locations whose managers decide a request, fixed when it is sent. A
-- location later archived, left by the person or without a manager who may
-- decide drops out when the request is weighed; one added later never joins.
create table public.time_off_required_locations (
  request_id uuid not null,
  workspace_id uuid not null,
  location_id uuid not null,
  primary key (request_id, location_id),
  foreign key (request_id, workspace_id)
    references public.schedule_time_off_requests (id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id)
    references public.locations (id, workspace_id) on delete restrict
);
create index time_off_required_locations_location_idx
  on public.time_off_required_locations (workspace_id, location_id);
alter table public.time_off_required_locations enable row level security;
revoke all on public.time_off_required_locations from public, anon, authenticated, service_role;

-- One vote per person per request, changed in place while the request is
-- open. impact holds, per location the vote covers, the fingerprint of the
-- published shifts the approval would open there when it was given: when that
-- changes, the vote no longer counts and the manager is asked to look again.
create table public.time_off_votes (
  request_id uuid not null,
  workspace_id uuid not null,
  voter_user_id uuid not null references auth.users (id),
  verdict text not null check (verdict in ('approve', 'deny')),
  note text not null default '' check (char_length(note) <= 1000),
  impact jsonb not null default '{}'::jsonb check (jsonb_typeof(impact) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_id, voter_user_id),
  foreign key (request_id, workspace_id)
    references public.schedule_time_off_requests (id, workspace_id) on delete cascade
);
alter table public.time_off_votes enable row level security;
revoke all on public.time_off_votes from public, anon, authenticated, service_role;

-- decide_by: the moment the system turns the request down if it is still
-- open (the start minus the workspace's lead time, or the start itself for a
-- request sent inside it). reminded_at / fallback_notified_at: the one
-- reminder and the one "only an admin or the owner can decide this now"
-- notice, each sent at most once. A request has no location any more; the
-- column goes with the old services (FB-6.3.7).
alter table public.schedule_time_off_requests
  add column decide_by timestamptz,
  add column reminded_at timestamptz,
  add column fallback_notified_at timestamptz,
  alter column location_id drop not null;
create index schedule_time_off_requests_open_deadline_idx
  on public.schedule_time_off_requests (decide_by)
  where status = 'pending' and decide_by is not null;

-- The system turns a request down when its deadline passes ('expired'); such
-- an event has no person behind it.
alter table public.schedule_time_off_events
  alter column actor_user_id drop not null,
  drop constraint schedule_time_off_events_action_check,
  add constraint schedule_time_off_events_action_check check (action = any (array[
    'submitted', 'viewed', 'approved', 'denied', 'partially_approved', 'returned_to_pending', 'revoked', 'expired'
  ]));

-- "Time off decision lead time" on Settings > Scheduling, in hours.
alter table public.workspace_scheduling_settings
  add column time_off_lead_hours integer not null default 24
    check (time_off_lead_hours between 0 and 720);
