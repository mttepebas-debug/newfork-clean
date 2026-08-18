insert into public.permissions (
  key, label, category, description, custom_grantable, sort_order
)
values
  ('employee_onboarding.review', 'Review employee onboarding', 'Employees', 'Review onboarding progress, request corrections, and activate completed employees.', true, 150),
  ('employee_documents.review', 'Review employee documents', 'Employees', 'Access and review private employee onboarding documents.', true, 160);

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join public.permissions permission
where (
    role.system_key in ('owner', 'admin')
    and permission.key in ('employee_onboarding.review', 'employee_documents.review')
  ) or (
    role.system_key = 'manager'
    and permission.key = 'employee_onboarding.review'
  )
on conflict do nothing;

create or replace function public.grant_new_system_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.system_key in ('owner', 'admin') then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions on conflict do nothing;
  elsif new.system_key = 'manager' then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions
    where key in (
      'workspace.read', 'schedule.read', 'schedule.manage', 'employees.read',
      'employees.manage', 'employee_onboarding.review'
    ) on conflict do nothing;
  elsif new.system_key = 'employee' then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions
    where key in ('workspace.read', 'schedule.read') on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_role_permission_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_role_id uuid := coalesce(new.role_id, old.role_id);
begin
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'schedule.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'schedule.read') then
    raise exception 'schedule.manage requires schedule.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'documents.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'documents.read') then
    raise exception 'documents.manage requires documents.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'signature_templates.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'signature_templates.read') then
    raise exception 'signature_templates.manage requires signature_templates.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key in ('employees.manage', 'employees.archive'))
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employees.read') then
    raise exception 'employee management requires employees.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_onboarding.review')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employees.read') then
    raise exception 'employee onboarding review requires employees.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_access.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employees.read') then
    raise exception 'employee access management requires employees.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_access.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'roles.read') then
    raise exception 'employee access management requires roles.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_documents.review')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_onboarding.review') then
    raise exception 'employee document review requires onboarding review' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_documents.review')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'documents.read') then
    raise exception 'employee document review requires documents.read' using errcode = '23514';
  end if;
  return null;
end;
$$;

create type public.employee_onboarding_case_status as enum (
  'in_progress', 'submitted', 'changes_requested', 'approved', 'cancelled'
);
create type public.employee_onboarding_requirement_kind as enum (
  'profile', 'ssn', 'document', 'acknowledgement', 'availability'
);
create type public.employee_onboarding_requirement_status as enum (
  'not_started', 'in_progress', 'awaiting_review', 'completed', 'rejected',
  'manual_follow_up', 'superseded'
);
create type public.employee_document_review_status as enum (
  'not_uploaded', 'awaiting_review', 'accepted', 'rejected', 'superseded'
);

create table public.employee_private_profiles (
  employee_id uuid primary key,
  workspace_id uuid not null,
  legal_first_name text not null check (char_length(btrim(legal_first_name)) between 1 and 80),
  legal_last_name text not null check (char_length(btrim(legal_last_name)) between 1 and 80),
  preferred_name text not null default '' check (char_length(preferred_name) <= 80),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  street_address text not null check (char_length(btrim(street_address)) between 1 and 180),
  city text not null check (char_length(btrim(city)) between 1 and 100),
  region text not null check (char_length(btrim(region)) between 1 and 100),
  postal_code text not null check (char_length(btrim(postal_code)) between 1 and 20),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  date_of_birth date not null,
  emergency_contact_name text not null check (char_length(btrim(emergency_contact_name)) between 1 and 120),
  emergency_contact_phone text not null check (char_length(btrim(emergency_contact_phone)) between 7 and 30),
  share_phone_with_teammates boolean not null default false,
  share_email_with_teammates boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade
);

create table public.employee_onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  membership_id uuid not null references public.workspace_memberships(id) on delete cascade,
  status public.employee_onboarding_case_status not null default 'in_progress',
  revision integer not null default 1 check (revision > 0),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  unique (employee_id),
  unique (membership_id),
  unique (id, workspace_id),
  check ((status = 'approved') = (approved_at is not null and approved_by is not null))
);

create table public.employee_onboarding_requirements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  case_id uuid not null,
  employee_id uuid not null,
  kind public.employee_onboarding_requirement_kind not null,
  source_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  required boolean not null default true,
  blocks_activation boolean not null default true,
  requires_review boolean not null default false,
  sort_order integer not null check (sort_order >= 0),
  status public.employee_onboarding_requirement_status not null default 'not_started',
  source_snapshot jsonb not null default '{}'::jsonb,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 1 and 500),
  completed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (case_id, workspace_id)
    references public.employee_onboarding_cases(id, workspace_id) on delete cascade,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  unique (case_id, kind, source_id),
  check (not blocks_activation or required)
);

create index employee_onboarding_requirements_case_idx
  on public.employee_onboarding_requirements (case_id, sort_order, id);
create unique index employee_onboarding_requirements_source_unique
  on public.employee_onboarding_requirements (case_id, kind, source_id) nulls not distinct;

create table public.employee_sensitive_identifiers (
  employee_id uuid primary key,
  workspace_id uuid not null,
  ciphertext text not null,
  encrypted_data_key text not null,
  nonce text not null,
  authentication_tag text not null,
  key_id text not null check (char_length(key_id) between 1 and 500),
  key_version text not null check (char_length(key_version) between 1 and 80),
  schema_version text not null default 'ssn-envelope:v1',
  last_four text not null check (last_four ~ '^\d{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade
);

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  requirement_id uuid not null references public.employee_onboarding_requirements(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  object_path text not null check (char_length(object_path) between 1 and 800),
  original_filename text not null check (char_length(original_filename) between 1 and 240),
  media_type text not null check (media_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  content_digest text check (content_digest is null or content_digest ~ '^[0-9a-f]{64}$'),
  review_status public.employee_document_review_status not null,
  expiry_date date,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 1 and 500),
  uploaded_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  unique (requirement_id, version_number),
  unique (object_path)
);

create table public.employee_acknowledgement_envelopes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  case_id uuid not null references public.employee_onboarding_cases(id) on delete cascade,
  requirement_id uuid not null references public.employee_onboarding_requirements(id) on delete restrict,
  template_version_id uuid not null references public.signature_template_versions(id) on delete restrict,
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  intent_statement text not null,
  typed_name text not null check (char_length(btrim(typed_name)) between 1 and 161),
  action_label text not null default 'Acknowledge policy',
  user_id uuid not null references auth.users(id),
  membership_id uuid not null references public.workspace_memberships(id),
  authenticated_at timestamptz not null,
  executed_at timestamptz not null default now(),
  idempotency_key uuid not null,
  evidence_schema_version text not null default 'acknowledgement:v1',
  unique (requirement_id),
  unique (workspace_id, idempotency_key),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade
);

create table public.employee_availability_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  case_id uuid not null references public.employee_onboarding_cases(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  timezone text not null check (char_length(timezone) between 1 and 80),
  recurring_rules jsonb not null,
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  unique (case_id, version_number),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  check (jsonb_typeof(recurring_rules) = 'array' and jsonb_array_length(recurring_rules) = 7)
);

create table public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  case_id uuid not null references public.employee_onboarding_cases(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (char_length(action) between 1 and 120),
  target_type text not null check (char_length(target_type) between 1 and 80),
  target_id text not null check (char_length(target_id) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade
);

create index onboarding_events_case_idx on public.onboarding_events (case_id, occurred_at desc);

alter table public.employee_private_profiles enable row level security;
alter table public.employee_onboarding_cases enable row level security;
alter table public.employee_onboarding_requirements enable row level security;
alter table public.employee_sensitive_identifiers enable row level security;
alter table public.employee_documents enable row level security;
alter table public.employee_acknowledgement_envelopes enable row level security;
alter table public.employee_availability_versions enable row level security;
alter table public.onboarding_events enable row level security;

revoke all on public.employee_private_profiles, public.employee_onboarding_cases,
  public.employee_onboarding_requirements, public.employee_sensitive_identifiers,
  public.employee_documents, public.employee_acknowledgement_envelopes,
  public.employee_availability_versions, public.onboarding_events
from public, anon, authenticated;
grant select on public.employee_private_profiles, public.employee_onboarding_cases,
  public.employee_onboarding_requirements, public.employee_sensitive_identifiers,
  public.employee_documents, public.employee_acknowledgement_envelopes,
  public.employee_availability_versions, public.onboarding_events
to service_role;

create function public.initialize_employee_onboarding_service(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  onboarding_case_id uuid;
begin
  select profile.* into employee
  from public.employee_profiles profile
  join public.workspace_memberships candidate
    on candidate.workspace_id = profile.workspace_id and candidate.user_id = profile.user_id
  where profile.user_id = target_user_id
    and profile.archived_at is null
    and candidate.status in ('pending_activation', 'active')
  order by candidate.created_at
  limit 1;
  if employee.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
  select * into membership from public.workspace_memberships
  where workspace_id = employee.workspace_id and user_id = target_user_id
    and status in ('pending_activation', 'active')
  order by created_at limit 1;

  insert into public.employee_onboarding_cases (workspace_id, employee_id, membership_id)
  values (employee.workspace_id, employee.id, membership.id)
  on conflict (employee_id) do update set updated_at = public.employee_onboarding_cases.updated_at
  returning id into onboarding_case_id;

  insert into public.employee_onboarding_requirements (
    workspace_id, case_id, employee_id, kind, title, description,
    required, blocks_activation, requires_review, sort_order, source_snapshot
  ) values
    (employee.workspace_id, onboarding_case_id, employee.id, 'profile', 'Profile and privacy', 'Private contact, identity, and teammate visibility choices.', true, true, false, 10, '{}'::jsonb),
    (employee.workspace_id, onboarding_case_id, employee.id, 'ssn', 'Secure identity', 'Dedicated encrypted identity collection.', true, true, false, 20, '{}'::jsonb),
    (employee.workspace_id, onboarding_case_id, employee.id, 'availability', 'Availability', 'Confirmed recurring weekly availability.', true, true, false, 500, '{}'::jsonb)
  on conflict (case_id, kind, source_id) do nothing;

  insert into public.employee_onboarding_requirements (
    workspace_id, case_id, employee_id, kind, source_id, title, description,
    required, blocks_activation, requires_review, sort_order, source_snapshot
  )
  select employee.workspace_id, onboarding_case_id, employee.id, 'document', document.id,
    document.title, document.description, true, true, document.requires_review,
    100 + document.sort_order,
    jsonb_build_object(
      'document_type_id', document.id,
      'accepted_formats', document.accepted_formats,
      'tracks_expiry', document.tracks_expiry,
      'requires_review', document.requires_review
    )
  from public.document_types document
  where document.workspace_id = employee.workspace_id
    and document.required_at_onboarding and document.archived_at is null
  on conflict (case_id, kind, source_id) do nothing;

  insert into public.employee_onboarding_requirements (
    workspace_id, case_id, employee_id, kind, source_id, title, description,
    required, blocks_activation, requires_review, sort_order, source_snapshot
  )
  select employee.workspace_id, onboarding_case_id, employee.id, 'acknowledgement', version.id,
    version.title, version.summary, version.required_at_onboarding,
    version.blocks_activation, false, 300 + version.version_number,
    jsonb_build_object(
      'template_version_id', version.id,
      'content_text', version.content_text,
      'content_digest', version.content_digest,
      'intent_statement', version.intent_statement,
      'locale', version.locale,
      'effective_date', version.effective_date,
      'retention_policy_id', version.retention_policy_id
    )
  from public.signature_template_versions version
  join public.signature_templates template on template.id = version.template_id
  where version.workspace_id = employee.workspace_id
    and version.status = 'published'
    and version.execution_class = 'acknowledgement'
    and version.required_at_onboarding
    and template.archived_at is null
    and not exists (
      select 1 from public.signature_template_versions newer
      where newer.template_id = version.template_id and newer.status = 'published'
        and newer.version_number > version.version_number
    )
  on conflict (case_id, kind, source_id) do nothing;

  if not exists (select 1 from public.onboarding_events event where event.case_id = onboarding_case_id and event.action = 'onboarding.started') then
    insert into public.onboarding_events (
      workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
    ) values (
      employee.workspace_id, employee.id, onboarding_case_id, target_user_id,
      'onboarding.started', 'onboarding_case', onboarding_case_id::text
    );
  end if;
  return onboarding_case_id;
end;
$$;

create function public.preview_employee_invitation_service(invitation_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workspace_name', workspace.name,
    'email', invitation.email,
    'expires_at', invitation.expires_at
  )
  from public.employee_invitations invitation
  join public.workspaces workspace on workspace.id = invitation.workspace_id
  where invitation.token_hash = invitation_token_hash
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  limit 1;
$$;

create function public.get_employee_onboarding_service(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  profile jsonb;
  availability jsonb;
  requirements jsonb;
  completed_count integer;
  total_count integer;
  first_path text;
begin
  perform public.initialize_employee_onboarding_service(target_user_id);
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  join public.employee_profiles candidate on candidate.id = onboarding.employee_id
  where candidate.user_id = target_user_id
  order by onboarding.created_at limit 1;
  select * into employee from public.employee_profiles where id = target_case.employee_id;
  select * into membership from public.workspace_memberships where id = target_case.membership_id;

  select to_jsonb(private_profile) - 'created_at' - 'updated_at' - 'employee_id' - 'workspace_id'
  into profile from public.employee_private_profiles private_profile
  where private_profile.employee_id = employee.id;
  select jsonb_build_object('timezone', version.timezone, 'days', version.recurring_rules)
  into availability from public.employee_availability_versions version
  where version.case_id = target_case.id order by version.version_number desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id,
    'kind', requirement.kind,
    'title', requirement.title,
    'description', requirement.description,
    'status', requirement.status,
    'required', requirement.required,
    'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review,
    'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', requirement.source_snapshot->>'content_text',
    'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', requirement.source_snapshot->>'intent_statement',
    'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order, requirement.id), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status in ('completed', 'awaiting_review'))
  into requirements, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded';

  select case requirement.kind
    when 'profile' then '/welcome/profile'
    when 'ssn' then '/welcome/identity'
    when 'document' then '/welcome/documents/' || requirement.id
    when 'acknowledgement' then '/welcome/acknowledgements/' || requirement.id
    when 'availability' then '/welcome/availability'
  end into first_path
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id
    and requirement.required
    and requirement.status in ('not_started', 'in_progress', 'rejected', 'manual_follow_up')
  order by case when requirement.status = 'rejected' then 0 else 1 end,
    requirement.sort_order, requirement.id
  limit 1;
  first_path := coalesce(first_path,
    case when target_case.status = 'approved' then '/app/employee-hub' else '/welcome/review' end);

  return jsonb_build_object(
    'case_id', target_case.id,
    'workspace_id', target_case.workspace_id,
    'workspace_name', (select name from public.workspaces where id = target_case.workspace_id),
    'employee_id', employee.id,
    'employee_name', concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name),
    'membership_id', membership.id,
    'membership_status', membership.status,
    'case_status', target_case.status,
    'revision', target_case.revision,
    'progress_completed', completed_count,
    'progress_total', total_count,
    'first_actionable_path', first_path,
    'ssn_status', jsonb_build_object(
      'present', exists(select 1 from public.employee_sensitive_identifiers where employee_id = employee.id),
      'last_four', (select last_four from public.employee_sensitive_identifiers where employee_id = employee.id)
    ),
    'profile', profile,
    'availability', availability,
    'assignments', jsonb_build_object(
      'locations', coalesce((select jsonb_agg(location.name order by assignment.is_primary desc, location.name)
        from public.employee_location_assignments assignment join public.locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
      'jobs', coalesce((select jsonb_agg(job.name order by assignment.is_primary desc, job.name)
        from public.employee_job_assignments assignment join public.jobs job on job.id = assignment.job_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb)
    ),
    'requirements', requirements
  );
end;
$$;

create function public.save_employee_onboarding_profile_service(
  target_user_id uuid,
  profile_payload jsonb,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id for update of onboarding;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if target_case.status in ('submitted', 'approved', 'cancelled') then raise exception 'onboarding cannot be edited' using errcode = '22023'; end if;
  if coalesce(profile_payload->>'legal_first_name', '') = ''
    or coalesce(profile_payload->>'legal_last_name', '') = ''
    or coalesce(profile_payload->>'phone', '') = ''
    or coalesce(profile_payload->>'street_address', '') = ''
    or coalesce(profile_payload->>'city', '') = ''
    or coalesce(profile_payload->>'region', '') = ''
    or coalesce(profile_payload->>'postal_code', '') = ''
    or coalesce(profile_payload->>'country_code', '') !~ '^[A-Z]{2}$'
    or coalesce(profile_payload->>'date_of_birth', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(profile_payload->>'emergency_contact_name', '') = ''
    or coalesce(profile_payload->>'emergency_contact_phone', '') = '' then
    raise exception 'complete private profile required' using errcode = '22023';
  end if;
  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_last_name, preferred_name,
    phone, street_address, city, region, postal_code, country_code, date_of_birth,
    emergency_contact_name, emergency_contact_phone,
    share_phone_with_teammates, share_email_with_teammates
  ) values (
    target_case.employee_id, target_case.workspace_id,
    btrim(profile_payload->>'legal_first_name'), btrim(profile_payload->>'legal_last_name'),
    btrim(coalesce(profile_payload->>'preferred_name', '')), btrim(profile_payload->>'phone'),
    btrim(profile_payload->>'street_address'), btrim(profile_payload->>'city'),
    btrim(profile_payload->>'region'), btrim(profile_payload->>'postal_code'),
    upper(profile_payload->>'country_code'), (profile_payload->>'date_of_birth')::date,
    btrim(profile_payload->>'emergency_contact_name'), btrim(profile_payload->>'emergency_contact_phone'),
    coalesce((profile_payload->>'share_phone_with_teammates')::boolean, false),
    coalesce((profile_payload->>'share_email_with_teammates')::boolean, false)
  ) on conflict (employee_id) do update set
    legal_first_name = excluded.legal_first_name, legal_last_name = excluded.legal_last_name,
    preferred_name = excluded.preferred_name, phone = excluded.phone,
    street_address = excluded.street_address, city = excluded.city, region = excluded.region,
    postal_code = excluded.postal_code, country_code = excluded.country_code,
    date_of_birth = excluded.date_of_birth,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    share_phone_with_teammates = excluded.share_phone_with_teammates,
    share_email_with_teammates = excluded.share_email_with_teammates, updated_at = now();
  update public.employee_onboarding_requirements set status = 'completed', rejection_reason = null,
    completed_at = now(), updated_at = now()
  where case_id = target_case.id and kind = 'profile';
  update public.employee_onboarding_cases set status = 'in_progress', revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.profile_saved', 'onboarding_case', target_case.id::text);
  return expected_revision;
end;
$$;

create function public.save_employee_ssn_envelope_service(
  target_user_id uuid,
  encrypted_ciphertext text,
  encrypted_key text,
  encrypted_nonce text,
  encrypted_tag text,
  kms_key_id text,
  kms_key_version text,
  ssn_last_four text,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype;
begin
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id for update of onboarding;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if ssn_last_four !~ '^\d{4}$' or least(length(encrypted_ciphertext), length(encrypted_key), length(encrypted_nonce), length(encrypted_tag), length(kms_key_id)) < 1 then
    raise exception 'valid encrypted identity envelope required' using errcode = '22023';
  end if;
  insert into public.employee_sensitive_identifiers (
    employee_id, workspace_id, ciphertext, encrypted_data_key, nonce,
    authentication_tag, key_id, key_version, last_four
  ) values (
    target_case.employee_id, target_case.workspace_id, encrypted_ciphertext,
    encrypted_key, encrypted_nonce, encrypted_tag, kms_key_id, kms_key_version, ssn_last_four
  ) on conflict (employee_id) do update set ciphertext = excluded.ciphertext,
    encrypted_data_key = excluded.encrypted_data_key, nonce = excluded.nonce,
    authentication_tag = excluded.authentication_tag, key_id = excluded.key_id,
    key_version = excluded.key_version, last_four = excluded.last_four, updated_at = now();
  update public.employee_onboarding_requirements set status = 'completed', rejection_reason = null,
    completed_at = now(), updated_at = now() where case_id = target_case.id and kind = 'ssn';
  update public.employee_onboarding_cases set status = 'in_progress', revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.ssn_saved', 'employee_sensitive_identifier', target_case.employee_id::text,
    jsonb_build_object('schema_version', 'ssn-envelope:v1', 'key_version', kms_key_version));
  return expected_revision;
end;
$$;

create function public.save_employee_availability_service(
  target_user_id uuid,
  availability_timezone text,
  availability_days jsonb,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype; next_version integer;
begin
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id for update of onboarding;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if char_length(availability_timezone) not between 1 and 80
    or jsonb_typeof(availability_days) <> 'array' or jsonb_array_length(availability_days) <> 7 then
    raise exception 'complete weekly availability required' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(availability_days) day
    where (day->>'day')::integer not between 0 and 6
      or day->>'mode' not in ('unavailable', 'unrestricted', 'windows')
      or jsonb_typeof(day->'windows') <> 'array'
  ) or (select count(distinct (day->>'day')::integer) from jsonb_array_elements(availability_days) day) <> 7 then
    raise exception 'each weekday requires one explicit availability state' using errcode = '22023';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.employee_availability_versions where case_id = target_case.id;
  insert into public.employee_availability_versions (
    workspace_id, employee_id, case_id, version_number, timezone, recurring_rules, confirmed_by
  ) values (
    target_case.workspace_id, target_case.employee_id, target_case.id, next_version,
    availability_timezone, availability_days, target_user_id
  );
  update public.employee_onboarding_requirements set status = 'completed', rejection_reason = null,
    completed_at = now(), updated_at = now() where case_id = target_case.id and kind = 'availability';
  update public.employee_onboarding_cases set status = 'in_progress', revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.availability_confirmed', 'availability_version', next_version::text,
    jsonb_build_object('version', next_version, 'timezone', availability_timezone));
  return expected_revision;
end;
$$;

create function public.confirm_employee_document_service(
  target_user_id uuid,
  target_requirement_id uuid,
  storage_object_path text,
  upload_filename text,
  upload_media_type text,
  upload_size_bytes bigint,
  upload_expiry_date date,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype; requirement public.employee_onboarding_requirements%rowtype; next_version integer;
begin
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  select * into requirement from public.employee_onboarding_requirements
  where id = target_requirement_id and case_id = target_case.id and kind = 'document' for update;
  if requirement.id is null then raise exception 'document requirement unavailable' using errcode = 'P0002'; end if;
  if upload_media_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
    or upload_size_bytes not between 1 and 10485760
    or storage_object_path not like target_case.workspace_id::text || '/' || target_case.employee_id::text || '/' || target_requirement_id::text || '/%' then
    raise exception 'invalid private document upload' using errcode = '22023';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version from public.employee_documents where requirement_id = requirement.id;
  update public.employee_documents set review_status = 'superseded'
  where requirement_id = requirement.id and review_status <> 'superseded';
  insert into public.employee_documents (
    workspace_id, employee_id, requirement_id, version_number, object_path,
    original_filename, media_type, size_bytes, review_status, expiry_date, uploaded_by
  ) values (
    target_case.workspace_id, target_case.employee_id, requirement.id, next_version,
    storage_object_path, upload_filename, upload_media_type, upload_size_bytes,
    case
      when requirement.requires_review then 'awaiting_review'::public.employee_document_review_status
      else 'accepted'::public.employee_document_review_status
    end,
    upload_expiry_date, target_user_id
  );
  update public.employee_onboarding_requirements set
    status = case
      when requires_review then 'awaiting_review'::public.employee_onboarding_requirement_status
      else 'completed'::public.employee_onboarding_requirement_status
    end,
    rejection_reason = null, completed_at = now(), updated_at = now()
  where id = requirement.id;
  update public.employee_onboarding_cases set status = 'in_progress', revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.document_uploaded', 'onboarding_requirement', requirement.id::text,
    jsonb_build_object('version', next_version, 'review_required', requirement.requires_review));
  return expected_revision;
end;
$$;

create function public.acknowledge_employee_requirement_service(
  target_user_id uuid,
  target_requirement_id uuid,
  signer_name text,
  expected_content_digest text,
  authenticated_timestamp timestamptz,
  request_idempotency_key uuid,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype; requirement public.employee_onboarding_requirements%rowtype;
begin
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  select * into requirement from public.employee_onboarding_requirements
  where id = target_requirement_id and case_id = target_case.id and kind = 'acknowledgement' for update;
  if requirement.id is null or requirement.source_snapshot->>'content_digest' <> expected_content_digest
    or char_length(btrim(signer_name)) not between 1 and 161 then
    raise exception 'acknowledgement content or signer is invalid' using errcode = '22023';
  end if;
  insert into public.employee_acknowledgement_envelopes (
    workspace_id, employee_id, case_id, requirement_id, template_version_id,
    content_digest, intent_statement, typed_name, user_id, membership_id,
    authenticated_at, idempotency_key
  ) values (
    target_case.workspace_id, target_case.employee_id, target_case.id, requirement.id,
    requirement.source_id, expected_content_digest,
    requirement.source_snapshot->>'intent_statement', btrim(signer_name), target_user_id,
    target_case.membership_id, authenticated_timestamp, request_idempotency_key
  ) on conflict (workspace_id, idempotency_key) do nothing;
  update public.employee_onboarding_requirements set status = 'completed', rejection_reason = null,
    completed_at = now(), updated_at = now() where id = requirement.id;
  update public.employee_onboarding_cases set status = 'in_progress', revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.acknowledgement_completed', 'onboarding_requirement', requirement.id::text,
    jsonb_build_object('content_digest', expected_content_digest, 'evidence_schema_version', 'acknowledgement:v1'));
  return expected_revision;
end;
$$;

create function public.submit_employee_onboarding_service(target_user_id uuid, expected_revision integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype;
begin
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if exists (select 1 from public.employee_onboarding_requirements
    where case_id = target_case.id and required and status not in ('completed', 'awaiting_review')) then
    raise exception 'required onboarding items remain incomplete' using errcode = '23514';
  end if;
  update public.employee_onboarding_cases set status = 'submitted', submitted_at = now(),
    revision = revision + 1, updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.submitted', 'onboarding_case', target_case.id::text);
  return expected_revision;
end;
$$;

create function public.get_employee_onboarding_review_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_onboarding.review') then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id;
  if target_case.id is null then raise exception 'onboarding case unavailable' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id, 'kind', requirement.kind, 'title', requirement.title,
    'description', requirement.description, 'status', requirement.status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded';
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', exists(select 1 from public.employee_sensitive_identifiers where employee_id = target_employee_id),
    'requirements', requirement_rows
  );
end;
$$;

create function public.review_employee_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  review_action text,
  target_requirement_id uuid,
  review_reason text,
  expected_revision integer,
  production_ready boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype; requirement public.employee_onboarding_requirements%rowtype;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_onboarding.review') then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id for update;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document' and not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.review') then
      raise exception 'employee document review required' using errcode = '42501';
    end if;
    if review_action = 'reject_requirement' and char_length(btrim(coalesce(review_reason, ''))) not between 1 and 500 then
      raise exception 'specific correction reason required' using errcode = '22023';
    end if;
    update public.employee_onboarding_requirements set
      status = case
        when review_action = 'accept_requirement' then 'completed'::public.employee_onboarding_requirement_status
        else 'rejected'::public.employee_onboarding_requirement_status
      end,
      rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
      reviewed_by = actor_user_id, reviewed_at = now(), updated_at = now()
    where id = requirement.id;
    if requirement.kind = 'document' then
      update public.employee_documents set
        review_status = case
          when review_action = 'accept_requirement' then 'accepted'::public.employee_document_review_status
          else 'rejected'::public.employee_document_review_status
        end,
        rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
        reviewed_by = actor_user_id, reviewed_at = now()
      where requirement_id = requirement.id and review_status = 'awaiting_review';
    end if;
    if review_action = 'reject_requirement' then
      update public.employee_onboarding_cases set status = 'changes_requested', revision = revision + 1,
        updated_at = now() where id = target_case.id returning revision into expected_revision;
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
    end if;
  elsif review_action = 'activate' then
    if target_case.status <> 'submitted' then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed') then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    update public.workspace_memberships set status = 'active', updated_at = now()
    where id = target_case.membership_id and status = 'pending_activation';
    if not found then raise exception 'pending membership unavailable' using errcode = '23514'; end if;
    update public.employee_onboarding_cases set status = 'approved', approved_by = actor_user_id,
      approved_at = now(), revision = revision + 1, updated_at = now()
    where id = target_case.id returning revision into expected_revision;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, target_employee_id, actor_user_id,
      'employee.activated', 'Employee onboarding approved and workspace access activated');
  else
    raise exception 'unsupported onboarding review action' using errcode = '22023';
  end if;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.' || review_action, 'onboarding_case', target_case.id::text,
    jsonb_build_object('requirement_id', target_requirement_id, 'reason_present', nullif(btrim(coalesce(review_reason, '')), '') is not null));
  return expected_revision;
end;
$$;

create function public.get_employee_document_path_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_requirement_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare document_path text;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.review') then
    raise exception 'employee document review required' using errcode = '42501';
  end if;
  select document.object_path into document_path
  from public.employee_documents document
  join public.employee_onboarding_requirements requirement
    on requirement.id = document.requirement_id
  where document.workspace_id = target_workspace_id
    and document.employee_id = target_employee_id
    and document.requirement_id = target_requirement_id
    and requirement.kind = 'document'
    and document.review_status <> 'superseded'
  order by document.version_number desc
  limit 1;
  if document_path is null then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;
  return document_path;
end;
$$;

revoke all on function public.initialize_employee_onboarding_service(uuid) from public, anon, authenticated;
revoke all on function public.preview_employee_invitation_service(text) from public, anon, authenticated;
revoke all on function public.get_employee_onboarding_service(uuid) from public, anon, authenticated;
revoke all on function public.save_employee_onboarding_profile_service(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.save_employee_ssn_envelope_service(uuid, text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.save_employee_availability_service(uuid, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.confirm_employee_document_service(uuid, uuid, text, text, text, bigint, date, integer) from public, anon, authenticated;
revoke all on function public.acknowledge_employee_requirement_service(uuid, uuid, text, text, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.submit_employee_onboarding_service(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_employee_onboarding_review_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_employee_onboarding_service(uuid, uuid, uuid, text, uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_employee_document_path_service(uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.initialize_employee_onboarding_service(uuid) to service_role;
grant execute on function public.preview_employee_invitation_service(text) to service_role;
grant execute on function public.get_employee_onboarding_service(uuid) to service_role;
grant execute on function public.save_employee_onboarding_profile_service(uuid, jsonb, integer) to service_role;
grant execute on function public.save_employee_ssn_envelope_service(uuid, text, text, text, text, text, text, text, integer) to service_role;
grant execute on function public.save_employee_availability_service(uuid, text, jsonb, integer) to service_role;
grant execute on function public.confirm_employee_document_service(uuid, uuid, text, text, text, bigint, date, integer) to service_role;
grant execute on function public.acknowledge_employee_requirement_service(uuid, uuid, text, text, timestamptz, uuid, integer) to service_role;
grant execute on function public.submit_employee_onboarding_service(uuid, integer) to service_role;
grant execute on function public.get_employee_onboarding_review_service(uuid, uuid, uuid) to service_role;
grant execute on function public.review_employee_onboarding_service(uuid, uuid, uuid, text, uuid, text, integer, boolean) to service_role;
grant execute on function public.get_employee_document_path_service(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.list_employees(
  target_workspace_id uuid,
  include_archived boolean default false,
  search_text text default '',
  status_filter text default 'all',
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  id uuid, workspace_id uuid, employee_code text, first_name text, last_name text,
  preferred_name text, display_name text, invitation_email text, start_date date,
  primary_location_id uuid, primary_location_name text, location_count bigint,
  primary_job_id uuid, primary_job_name text, job_count bigint, role_name text,
  display_status text, archived_at timestamptz, revision integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with directory as (
    select employee.id, employee.workspace_id, employee.employee_code,
      employee.first_name, employee.last_name, employee.preferred_name,
      concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name) as display_name,
      employee.invitation_email, employee.start_date,
      primary_location.location_id as primary_location_id,
      location.name as primary_location_name,
      (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null) as location_count,
      primary_job.job_id as primary_job_id, job.name as primary_job_name,
      (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null) as job_count,
      role.name as role_name,
      case
        when employee.archived_at is not null then 'archived'
        when membership.status = 'active' then 'active'
        when onboarding.status in ('submitted', 'changes_requested') then 'needs_attention'
        when membership.status = 'pending_activation' then 'onboarding'
        when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
        else 'not_invited'
      end as display_status,
      employee.archived_at, employee.revision
    from public.employee_profiles employee
    left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
    left join public.locations location on location.id = primary_location.location_id
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    left join public.jobs job on job.id = primary_job.job_id
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
    left join public.workspace_roles role on role.id = membership.role_id
    left join public.employee_onboarding_cases onboarding on onboarding.employee_id = employee.id
    left join lateral (
      select candidate.status, candidate.expires_at
      from public.employee_invitations candidate
      where candidate.employee_id = employee.id
      order by candidate.created_at desc limit 1
    ) invitation on true
    where employee.workspace_id = target_workspace_id
      and public.workspace_has_permission(target_workspace_id, 'employees.read')
      and public.can_access_employee(target_workspace_id, employee.id)
      and (include_archived = (employee.archived_at is not null))
  )
  select * from directory
  where (btrim(search_text) = '' or concat_ws(' ', first_name, last_name, preferred_name, employee_code, invitation_email) ilike '%' || btrim(search_text) || '%')
    and (status_filter = 'all' or display_status = status_filter)
  order by lower(display_name), id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
$$;
