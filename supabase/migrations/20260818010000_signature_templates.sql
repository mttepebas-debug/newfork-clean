insert into public.permissions (
  key, label, category, description, custom_grantable, sort_order
)
values
  ('signature_templates.read', 'View acknowledgement templates', 'Acknowledgements', 'View acknowledgement templates and retention policies.', true, 90),
  ('signature_templates.manage', 'Manage acknowledgement templates', 'Acknowledgements', 'Create, approve, publish, and archive acknowledgement settings.', true, 100);

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join public.permissions permission
where role.system_key in ('owner', 'admin')
  and permission.key in ('signature_templates.read', 'signature_templates.manage')
on conflict do nothing;

create or replace function public.enforce_role_permission_dependencies()
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

  if exists (
    select 1 from public.workspace_role_permissions grant_row
    where grant_row.role_id = checked_role_id
      and grant_row.permission_key = 'signature_templates.manage'
  ) and not exists (
    select 1 from public.workspace_role_permissions grant_row
    where grant_row.role_id = checked_role_id
      and grant_row.permission_key = 'signature_templates.read'
  ) then
    raise exception 'signature_templates.manage requires signature_templates.read' using errcode = '23514';
  end if;

  return null;
end;
$$;

create type public.signature_retention_trigger as enum ('signed_at', 'employment_end');
create type public.signature_retention_status as enum ('draft', 'approved');
create type public.signature_execution_class as enum ('acknowledgement', 'electronic_signature', 'external_process');
create type public.signature_version_status as enum ('draft', 'published');

create table public.signature_retention_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  retention_trigger public.signature_retention_trigger not null,
  duration_days integer not null check (duration_days between 1 and 36500),
  jurisdiction_scope text not null check (char_length(btrim(jurisdiction_scope)) between 1 and 120),
  authority_reference text not null check (char_length(btrim(authority_reference)) between 1 and 500),
  status public.signature_retention_status not null default 'draft',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (
    (status = 'draft' and approved_by is null and approved_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null)
  )
);

create unique index signature_retention_policies_active_name_unique
  on public.signature_retention_policies (workspace_id, lower(btrim(name)))
  where archived_at is null;

create table public.signature_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create unique index signature_templates_active_name_unique
  on public.signature_templates (workspace_id, lower(btrim(name)))
  where archived_at is null;

create table public.signature_template_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null,
  version_number integer not null check (version_number > 0),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  summary text not null default '' check (char_length(summary) <= 240),
  execution_class public.signature_execution_class not null default 'acknowledgement',
  content_text text not null check (char_length(content_text) between 1 and 50000),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  intent_statement text not null check (char_length(btrim(intent_statement)) between 1 and 500),
  locale text not null default 'en-US' check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  effective_date date not null,
  required_at_onboarding boolean not null default true,
  blocks_activation boolean not null default true,
  retention_policy_id uuid not null,
  status public.signature_version_status not null default 'draft',
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (template_id, workspace_id)
    references public.signature_templates(id, workspace_id) on delete cascade,
  foreign key (retention_policy_id, workspace_id)
    references public.signature_retention_policies(id, workspace_id) on delete restrict,
  unique (template_id, version_number),
  check (
    (status = 'draft' and published_by is null and published_at is null)
    or (status = 'published' and published_by is not null and published_at is not null)
  ),
  check (not blocks_activation or required_at_onboarding)
);

create unique index signature_template_versions_one_draft
  on public.signature_template_versions (template_id)
  where status = 'draft';

create index signature_template_versions_catalog_idx
  on public.signature_template_versions (workspace_id, template_id, status, version_number desc);

create function public.protect_published_signature_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'published acknowledgement versions are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.protect_approved_signature_retention_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved'
    and (
      tg_op = 'DELETE'
      or new.name is distinct from old.name
      or new.retention_trigger is distinct from old.retention_trigger
      or new.duration_days is distinct from old.duration_days
      or new.jurisdiction_scope is distinct from old.jurisdiction_scope
      or new.authority_reference is distinct from old.authority_reference
      or new.status is distinct from old.status
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
    ) then
    raise exception 'approved retention policies are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_published_signature_versions
before update or delete on public.signature_template_versions
for each row execute function public.protect_published_signature_version();

create trigger protect_approved_signature_retention_policies
before update or delete on public.signature_retention_policies
for each row execute function public.protect_approved_signature_retention_policy();

alter table public.signature_retention_policies enable row level security;
alter table public.signature_templates enable row level security;
alter table public.signature_template_versions enable row level security;

create policy signature_retention_policies_select_authorized
on public.signature_retention_policies for select to authenticated
using ((select public.workspace_has_permission(workspace_id, 'signature_templates.read')));

create policy signature_templates_select_authorized
on public.signature_templates for select to authenticated
using ((select public.workspace_has_permission(workspace_id, 'signature_templates.read')));

create policy signature_template_versions_select_authorized
on public.signature_template_versions for select to authenticated
using ((select public.workspace_has_permission(workspace_id, 'signature_templates.read')));

revoke all on public.signature_retention_policies from anon, authenticated;
revoke all on public.signature_templates from anon, authenticated;
revoke all on public.signature_template_versions from anon, authenticated;
grant select on public.signature_retention_policies to authenticated;
grant select on public.signature_templates to authenticated;
grant select on public.signature_template_versions to authenticated;

create function public.save_signature_retention_policy(
  target_workspace_id uuid,
  target_policy_id uuid,
  policy_name text,
  policy_trigger text,
  policy_duration_days integer,
  policy_jurisdiction_scope text,
  policy_authority_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;
  if char_length(btrim(policy_name)) not between 1 and 80
    or policy_trigger not in ('signed_at', 'employment_end')
    or policy_duration_days not between 1 and 36500
    or char_length(btrim(policy_jurisdiction_scope)) not between 1 and 120
    or char_length(btrim(policy_authority_reference)) not between 1 and 500 then
    raise exception 'invalid retention policy fields' using errcode = '22023';
  end if;

  if target_policy_id is null then
    insert into public.signature_retention_policies (
      workspace_id, name, retention_trigger, duration_days,
      jurisdiction_scope, authority_reference, created_by
    ) values (
      target_workspace_id, btrim(policy_name), policy_trigger::public.signature_retention_trigger,
      policy_duration_days, btrim(policy_jurisdiction_scope),
      btrim(policy_authority_reference), actor_id
    ) returning id into saved_id;
  else
    update public.signature_retention_policies
    set name = btrim(policy_name),
        retention_trigger = policy_trigger::public.signature_retention_trigger,
        duration_days = policy_duration_days,
        jurisdiction_scope = btrim(policy_jurisdiction_scope),
        authority_reference = btrim(policy_authority_reference),
        updated_at = now()
    where id = target_policy_id
      and workspace_id = target_workspace_id
      and status = 'draft'
    returning id into saved_id;

    if saved_id is null then
      raise exception 'editable retention policy not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id,
    case when target_policy_id is null then 'signature_retention_policy.created' else 'signature_retention_policy.updated' end,
    'signature_retention_policy', saved_id::text,
    jsonb_build_object('name', btrim(policy_name), 'trigger', policy_trigger, 'duration_days', policy_duration_days)
  );
  return saved_id;
end;
$$;

create function public.approve_signature_retention_policy(
  target_workspace_id uuid,
  target_policy_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_name text;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;

  update public.signature_retention_policies
  set status = 'approved', approved_by = actor_id, approved_at = now(), updated_at = now()
  where id = target_policy_id and workspace_id = target_workspace_id
    and status = 'draft' and archived_at is null
  returning name into target_name;
  if target_name is null then
    raise exception 'approvable retention policy not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id, 'signature_retention_policy.approved',
    'signature_retention_policy', target_policy_id::text,
    jsonb_build_object('name', target_name)
  );
end;
$$;

create function public.set_signature_retention_policy_archived(
  target_workspace_id uuid,
  target_policy_id uuid,
  should_archive boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_name text;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;
  update public.signature_retention_policies
  set archived_at = case when should_archive then now() else null end,
      updated_at = now()
  where id = target_policy_id and workspace_id = target_workspace_id
  returning name into target_name;
  if target_name is null then
    raise exception 'retention policy not found' using errcode = 'P0002';
  end if;
  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id,
    case when should_archive then 'signature_retention_policy.archived' else 'signature_retention_policy.restored' end,
    'signature_retention_policy', target_policy_id::text,
    jsonb_build_object('name', target_name)
  );
end;
$$;

create function public.save_signature_template_draft(
  target_workspace_id uuid,
  target_template_id uuid,
  template_name text,
  template_summary text,
  template_content text,
  template_intent_statement text,
  template_locale text,
  template_effective_date date,
  is_required_at_onboarding boolean,
  should_block_activation boolean,
  target_retention_policy_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_template_id uuid;
  saved_version_id uuid;
  normalized_content text := replace(replace(template_content, E'\r\n', E'\n'), E'\r', E'\n');
  next_version integer;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;
  if char_length(btrim(template_name)) not between 1 and 80
    or char_length(coalesce(template_summary, '')) > 240
    or char_length(normalized_content) not between 1 and 50000
    or char_length(btrim(template_intent_statement)) not between 1 and 500
    or template_locale !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
    or template_effective_date is null then
    raise exception 'invalid acknowledgement template fields' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.signature_retention_policies
    where id = target_retention_policy_id and workspace_id = target_workspace_id
      and archived_at is null
  ) then
    raise exception 'active retention policy required' using errcode = '22023';
  end if;
  if should_block_activation and not is_required_at_onboarding then
    raise exception 'activation blocking requires onboarding assignment' using errcode = '22023';
  end if;

  if target_template_id is null then
    insert into public.signature_templates (workspace_id, name, created_by)
    values (target_workspace_id, btrim(template_name), actor_id)
    returning id into saved_template_id;
    next_version := 1;
  else
    update public.signature_templates
    set name = btrim(template_name), updated_at = now()
    where id = target_template_id and workspace_id = target_workspace_id
      and archived_at is null
    returning id into saved_template_id;
    if saved_template_id is null then
      raise exception 'active acknowledgement template not found' using errcode = 'P0002';
    end if;
    select id into saved_version_id from public.signature_template_versions
      where template_id = saved_template_id and status = 'draft';
    select coalesce(max(version_number), 0) + 1 into next_version
      from public.signature_template_versions where template_id = saved_template_id;
  end if;

  if saved_version_id is null then
    insert into public.signature_template_versions (
      workspace_id, template_id, version_number, title, summary, execution_class,
      content_text, content_digest, intent_statement, locale, effective_date,
      required_at_onboarding, blocks_activation, retention_policy_id, created_by
    ) values (
      target_workspace_id, saved_template_id, next_version, btrim(template_name),
      btrim(coalesce(template_summary, '')), 'acknowledgement', normalized_content,
      encode(extensions.digest(convert_to(normalized_content, 'UTF8'), 'sha256'), 'hex'),
      btrim(template_intent_statement), template_locale, template_effective_date,
      is_required_at_onboarding, should_block_activation, target_retention_policy_id, actor_id
    ) returning id into saved_version_id;
  else
    update public.signature_template_versions
    set title = btrim(template_name), summary = btrim(coalesce(template_summary, '')),
        content_text = normalized_content,
        content_digest = encode(extensions.digest(convert_to(normalized_content, 'UTF8'), 'sha256'), 'hex'),
        intent_statement = btrim(template_intent_statement), locale = template_locale,
        effective_date = template_effective_date,
        required_at_onboarding = is_required_at_onboarding,
        blocks_activation = should_block_activation,
        retention_policy_id = target_retention_policy_id, updated_at = now()
    where id = saved_version_id;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id,
    case when target_template_id is null then 'signature_template.created' else 'signature_template.draft_saved' end,
    'signature_template', saved_template_id::text,
    jsonb_build_object('name', btrim(template_name), 'version_id', saved_version_id)
  );
  return saved_template_id;
end;
$$;

create function public.publish_signature_template(
  target_workspace_id uuid,
  target_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_record public.signature_template_versions%rowtype;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;
  select version.* into draft_record
  from public.signature_template_versions version
  join public.signature_templates template on template.id = version.template_id
  where version.workspace_id = target_workspace_id
    and version.template_id = target_template_id
    and version.status = 'draft'
    and template.archived_at is null
  for update of version;
  if draft_record.id is null then
    raise exception 'publishable acknowledgement draft not found' using errcode = 'P0002';
  end if;
  if draft_record.execution_class <> 'acknowledgement' then
    raise exception 'only acknowledgement templates can be published' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.signature_retention_policies policy
    where policy.id = draft_record.retention_policy_id
      and policy.workspace_id = target_workspace_id
      and policy.status = 'approved'
      and policy.archived_at is null
  ) then
    raise exception 'approved active retention policy required for publication' using errcode = '22023';
  end if;

  update public.signature_template_versions
  set status = 'published', published_by = actor_id, published_at = now(), updated_at = now()
  where id = draft_record.id;
  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id, 'signature_template.published',
    'signature_template', target_template_id::text,
    jsonb_build_object('version_id', draft_record.id, 'version_number', draft_record.version_number,
      'content_digest', draft_record.content_digest)
  );
end;
$$;

create function public.set_signature_template_archived(
  target_workspace_id uuid,
  target_template_id uuid,
  should_archive boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_name text;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;
  update public.signature_templates
  set archived_at = case when should_archive then now() else null end,
      updated_at = now()
  where id = target_template_id and workspace_id = target_workspace_id
  returning name into target_name;
  if target_name is null then
    raise exception 'acknowledgement template not found' using errcode = 'P0002';
  end if;
  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id,
    case when should_archive then 'signature_template.archived' else 'signature_template.restored' end,
    'signature_template', target_template_id::text,
    jsonb_build_object('name', target_name)
  );
end;
$$;

revoke all on function public.save_signature_retention_policy(uuid, uuid, text, text, integer, text, text) from public, anon;
revoke all on function public.approve_signature_retention_policy(uuid, uuid) from public, anon;
revoke all on function public.set_signature_retention_policy_archived(uuid, uuid, boolean) from public, anon;
revoke all on function public.save_signature_template_draft(uuid, uuid, text, text, text, text, text, date, boolean, boolean, uuid) from public, anon;
revoke all on function public.publish_signature_template(uuid, uuid) from public, anon;
revoke all on function public.set_signature_template_archived(uuid, uuid, boolean) from public, anon;
grant execute on function public.save_signature_retention_policy(uuid, uuid, text, text, integer, text, text) to authenticated;
grant execute on function public.approve_signature_retention_policy(uuid, uuid) to authenticated;
grant execute on function public.set_signature_retention_policy_archived(uuid, uuid, boolean) to authenticated;
grant execute on function public.save_signature_template_draft(uuid, uuid, text, text, text, text, text, date, boolean, boolean, uuid) to authenticated;
grant execute on function public.publish_signature_template(uuid, uuid) to authenticated;
grant execute on function public.set_signature_template_archived(uuid, uuid, boolean) to authenticated;
