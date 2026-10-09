create table if not exists public.shift_labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default '#54736A' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create unique index if not exists shift_labels_workspace_active_name_idx
  on public.shift_labels (workspace_id, lower(name))
  where archived_at is null;

create index if not exists shift_labels_workspace_order_idx
  on public.shift_labels (workspace_id, archived_at, sort_order, name);

alter table public.shift_labels enable row level security;

drop policy if exists shift_labels_select_member on public.shift_labels;
create policy shift_labels_select_member
on public.shift_labels for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

drop policy if exists shift_labels_insert_admin on public.shift_labels;
create policy shift_labels_insert_admin
on public.shift_labels for insert to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

drop policy if exists shift_labels_update_admin on public.shift_labels;
create policy shift_labels_update_admin
on public.shift_labels for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

revoke all on public.shift_labels from anon;
grant select, insert, update on public.shift_labels to authenticated;

drop trigger if exists shift_labels_audit_trigger on public.shift_labels;
create trigger shift_labels_audit_trigger
after insert or update on public.shift_labels
for each row execute function public.audit_organization_setting_change();

create or replace function public.reorder_shift_labels(
  target_workspace_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  matched_count integer;
begin
  if not public.can_manage_workspace(target_workspace_id) then
    raise exception 'workspace management access required' using errcode = '42501';
  end if;
  if cardinality(ordered_ids) <> (
    select count(distinct item_id) from unnest(ordered_ids) item_id
  ) then
    raise exception 'shift label order contains duplicates' using errcode = '22023';
  end if;

  select count(*) into expected_count
  from public.shift_labels
  where workspace_id = target_workspace_id and archived_at is null;
  select count(*) into matched_count
  from public.shift_labels
  where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

  if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
    raise exception 'shift label order must include every active shift label' using errcode = '22023';
  end if;

  update public.shift_labels shift_label
  set sort_order = ordered.position - 1, updated_at = now()
  from unnest(ordered_ids) with ordinality ordered(id, position)
  where shift_label.id = ordered.id
    and shift_label.workspace_id = target_workspace_id;
end;
$$;

create or replace function public.reorder_shift_labels_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  perform public.reorder_shift_labels(target_workspace_id, ordered_ids);
end;
$$;

alter function public.get_schedule_read_model_service(uuid, uuid, date)
rename to get_schedule_read_model_service_shift_label_management_base;

create function public.get_schedule_read_model_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
begin
  base := public.get_schedule_read_model_service_shift_label_management_base(
    actor_user_id,
    target_workspace_id,
    target_date
  );

  return jsonb_set(
    base,
    '{shift_labels}',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', label.id,
        'name', label.name,
        'color', label.color,
        'sort_order', label.sort_order
      ) order by label.sort_order, label.name)
      from public.shift_labels label
      where label.workspace_id = target_workspace_id
        and label.archived_at is null
    ), '[]'::jsonb),
    true
  );
end;
$$;

revoke execute on function public.reorder_shift_labels(uuid, uuid[])
from authenticated;
revoke all on function public.reorder_shift_labels_service(uuid, uuid, uuid[])
from public, anon, authenticated;
revoke all on function public.get_schedule_read_model_service(uuid, uuid, date)
from public, anon, authenticated;

grant execute on function public.reorder_shift_labels_service(uuid, uuid, uuid[])
to service_role;
grant execute on function public.get_schedule_read_model_service(uuid, uuid, date)
to service_role;
