insert into public.permissions (
  key, label, category, description, custom_grantable, sort_order
)
values
  ('documents.read', 'View document types', 'Documents', 'View employee onboarding document requirements.', true, 70),
  ('documents.manage', 'Manage document types', 'Documents', 'Create, edit, order, archive, and restore document requirements.', true, 80);

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join public.permissions permission
where role.system_key in ('owner', 'admin')
  and permission.key in ('documents.read', 'documents.manage')
on conflict do nothing;

create function public.enforce_role_permission_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_role_id uuid := coalesce(new.role_id, old.role_id);
begin
  if exists (
    select 1 from public.workspace_role_permissions grant_row
    where grant_row.role_id = checked_role_id
      and grant_row.permission_key = 'schedule.manage'
  ) and not exists (
    select 1 from public.workspace_role_permissions grant_row
    where grant_row.role_id = checked_role_id
      and grant_row.permission_key = 'schedule.read'
  ) then
    raise exception 'schedule.manage requires schedule.read' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.workspace_role_permissions grant_row
    where grant_row.role_id = checked_role_id
      and grant_row.permission_key = 'documents.manage'
  ) and not exists (
    select 1 from public.workspace_role_permissions grant_row
    where grant_row.role_id = checked_role_id
      and grant_row.permission_key = 'documents.read'
  ) then
    raise exception 'documents.manage requires documents.read' using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger enforce_role_permission_dependencies_trigger
after insert or update or delete on public.workspace_role_permissions
deferrable initially deferred
for each row execute function public.enforce_role_permission_dependencies();

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  required_at_onboarding boolean not null default false,
  requires_review boolean not null default true,
  accepted_formats text[] not null default array['pdf', 'jpeg', 'png', 'webp']::text[],
  tracks_expiry boolean not null default false,
  expiry_warning_days integer not null default 30 check (expiry_warning_days between 1 and 365),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    cardinality(accepted_formats) > 0
    and accepted_formats <@ array['pdf', 'jpeg', 'png', 'webp']::text[]
  )
);

create unique index document_types_active_title_unique
  on public.document_types (workspace_id, lower(btrim(title)))
  where archived_at is null;

create index document_types_workspace_order_idx
  on public.document_types (workspace_id, archived_at, sort_order, title);

alter table public.document_types enable row level security;

create policy document_types_select_authorized
on public.document_types for select to authenticated
using ((select public.workspace_has_permission(workspace_id, 'documents.read')));

revoke all on public.document_types from anon, authenticated;
grant select on public.document_types to authenticated;

create function public.save_document_type(
  target_workspace_id uuid,
  target_document_type_id uuid,
  document_title text,
  document_description text,
  is_required_at_onboarding boolean,
  is_review_required boolean,
  document_formats text[],
  should_track_expiry boolean,
  warning_days integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid;
  normalized_formats text[];
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'documents.manage') then
    raise exception 'document management access required' using errcode = '42501';
  end if;
  if char_length(btrim(document_title)) not between 1 and 80 then
    raise exception 'document title must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(document_description, '')) > 240 then
    raise exception 'document description must be 240 characters or fewer' using errcode = '22023';
  end if;
  if warning_days not between 1 and 365 then
    raise exception 'expiry warning days must be between 1 and 365' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct lower(format) order by lower(format)), '{}'::text[])
  into normalized_formats
  from unnest(coalesce(document_formats, '{}'::text[])) format;

  if cardinality(normalized_formats) = 0
    or not normalized_formats <@ array['pdf', 'jpeg', 'png', 'webp']::text[] then
    raise exception 'document formats contain unsupported values' using errcode = '22023';
  end if;

  if target_document_type_id is null then
    insert into public.document_types (
      workspace_id,
      title,
      description,
      required_at_onboarding,
      requires_review,
      accepted_formats,
      tracks_expiry,
      expiry_warning_days,
      sort_order,
      created_by
    ) values (
      target_workspace_id,
      btrim(document_title),
      btrim(coalesce(document_description, '')),
      is_required_at_onboarding,
      is_review_required,
      normalized_formats,
      should_track_expiry,
      warning_days,
      coalesce((
        select max(sort_order) + 1 from public.document_types
        where workspace_id = target_workspace_id and archived_at is null
      ), 0),
      actor_id
    ) returning id into saved_id;
  else
    update public.document_types
    set title = btrim(document_title),
        description = btrim(coalesce(document_description, '')),
        required_at_onboarding = is_required_at_onboarding,
        requires_review = is_review_required,
        accepted_formats = normalized_formats,
        tracks_expiry = should_track_expiry,
        expiry_warning_days = warning_days,
        updated_at = now()
    where id = target_document_type_id
      and workspace_id = target_workspace_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'document type not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    case when target_document_type_id is null then 'document_type.created' else 'document_type.updated' end,
    'document_type',
    saved_id::text,
    jsonb_build_object('title', btrim(document_title))
  );

  return saved_id;
end;
$$;

create function public.set_document_type_archived(
  target_workspace_id uuid,
  target_document_type_id uuid,
  should_archive boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_title text;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'documents.manage') then
    raise exception 'document management access required' using errcode = '42501';
  end if;

  update public.document_types
  set archived_at = case when should_archive then now() else null end,
      updated_at = now()
  where id = target_document_type_id
    and workspace_id = target_workspace_id
  returning title into target_title;

  if target_title is null then
    raise exception 'document type not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    case when should_archive then 'document_type.archived' else 'document_type.restored' end,
    'document_type',
    target_document_type_id::text,
    jsonb_build_object('title', target_title)
  );
end;
$$;

create function public.reorder_document_types(
  target_workspace_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expected_count integer;
  matched_count integer;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'documents.manage') then
    raise exception 'document management access required' using errcode = '42501';
  end if;
  if cardinality(ordered_ids) <> (
    select count(distinct item_id) from unnest(ordered_ids) item_id
  ) then
    raise exception 'document type order contains duplicates' using errcode = '22023';
  end if;

  select count(*) into expected_count
  from public.document_types
  where workspace_id = target_workspace_id and archived_at is null;
  select count(*) into matched_count
  from public.document_types
  where workspace_id = target_workspace_id
    and archived_at is null
    and id = any(ordered_ids);

  if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
    raise exception 'document type order must include every active type' using errcode = '22023';
  end if;

  update public.document_types document_type
  set sort_order = ordered.position - 1,
      updated_at = now()
  from unnest(ordered_ids) with ordinality ordered(id, position)
  where document_type.id = ordered.id
    and document_type.workspace_id = target_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    'document_type.reordered',
    'document_type_catalog',
    target_workspace_id::text,
    jsonb_build_object('ordered_ids', ordered_ids)
  );
end;
$$;

revoke all on function public.save_document_type(uuid, uuid, text, text, boolean, boolean, text[], boolean, integer) from public, anon;
revoke all on function public.set_document_type_archived(uuid, uuid, boolean) from public, anon;
revoke all on function public.reorder_document_types(uuid, uuid[]) from public, anon;
grant execute on function public.save_document_type(uuid, uuid, text, text, boolean, boolean, text[], boolean, integer) to authenticated;
grant execute on function public.set_document_type_archived(uuid, uuid, boolean) to authenticated;
grant execute on function public.reorder_document_types(uuid, uuid[]) to authenticated;
