create type public.important_date_type as enum ('holiday', 'event', 'blackout', 'closed_day');
create type public.important_date_recurrence as enum ('none', 'annual');

create table public.important_dates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  type public.important_date_type not null default 'event',
  starts_on date not null,
  ends_on date not null,
  recurrence public.important_date_recurrence not null default 'none',
  note text not null default '' check (char_length(note) <= 500),
  affects_scheduling boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict,
  check (ends_on >= starts_on),
  check (type <> 'closed_day' or affects_scheduling)
);

create index important_dates_workspace_date_idx
  on public.important_dates (workspace_id, archived_at, starts_on, ends_on);
create index important_dates_location_idx
  on public.important_dates (workspace_id, location_id)
  where archived_at is null;

alter table public.important_dates enable row level security;

create policy important_dates_select_member
on public.important_dates for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy important_dates_insert_admin
on public.important_dates for insert to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

create policy important_dates_update_admin
on public.important_dates for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

revoke all on public.important_dates from anon;
grant select, insert, update on public.important_dates to authenticated;

create function public.audit_important_date_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  archived boolean := (case when tg_op = 'DELETE' then old.archived_at else new.archived_at end) is not null;
begin
  if actor_id is null then return case when tg_op = 'DELETE' then old else new end; end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end,
    actor_id,
    case
      when tg_op = 'INSERT' then 'important_date.created'
      when archived then 'important_date.archived'
      else 'important_date.updated'
    end,
    'important_date',
    (case when tg_op = 'DELETE' then old.id else new.id end)::text
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger important_dates_audit_trigger
after insert or update on public.important_dates
for each row execute function public.audit_important_date_change();
