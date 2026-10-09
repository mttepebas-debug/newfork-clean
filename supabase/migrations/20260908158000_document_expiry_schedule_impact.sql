create type public.document_expiry_schedule_impact as enum (
  'track_only',
  'warn',
  'block'
);

alter table public.document_types
  add column expiry_schedule_impact public.document_expiry_schedule_impact
    not null default 'track_only';

alter table public.document_types
  add constraint document_types_expiry_block_requires_required
  check (
    expiry_schedule_impact <> 'block'
    or required_at_onboarding
  );

create or replace function public.save_document_type(
  target_workspace_id uuid,
  target_document_type_id uuid,
  document_title text,
  document_description text,
  is_required_at_onboarding boolean,
  is_review_required boolean,
  document_formats text[],
  should_track_expiry boolean,
  warning_days integer,
  schedule_impact text
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
  normalized_schedule_impact public.document_expiry_schedule_impact;
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
  if coalesce(schedule_impact, 'track_only') not in ('track_only', 'warn', 'block') then
    raise exception 'invalid expiry schedule impact' using errcode = '22023';
  end if;
  normalized_schedule_impact := coalesce(schedule_impact, 'track_only')::public.document_expiry_schedule_impact;
  if not coalesce(should_track_expiry, false) then
    normalized_schedule_impact := 'track_only';
  end if;
  if normalized_schedule_impact = 'block' and not coalesce(is_required_at_onboarding, false) then
    raise exception 'only required documents can create hard schedule conflicts' using errcode = '22023';
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
      expiry_schedule_impact,
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
      normalized_schedule_impact,
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
        expiry_schedule_impact = normalized_schedule_impact,
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
    jsonb_build_object(
      'title', btrim(document_title),
      'expiry_schedule_impact', normalized_schedule_impact
    )
  );

  return saved_id;
end;
$$;

create or replace function public.save_document_type(
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
language sql
security definer
set search_path = ''
as $$
  select public.save_document_type(
    target_workspace_id,
    target_document_type_id,
    document_title,
    document_description,
    is_required_at_onboarding,
    is_review_required,
    document_formats,
    should_track_expiry,
    warning_days,
    'track_only'
  );
$$;

create or replace function public.save_document_type_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_document_type_id uuid,
  document_title text,
  document_description text,
  is_required_at_onboarding boolean,
  is_review_required boolean,
  document_formats text[],
  should_track_expiry boolean,
  warning_days integer,
  schedule_impact text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_document_type(
    target_workspace_id,
    target_document_type_id,
    document_title,
    document_description,
    is_required_at_onboarding,
    is_review_required,
    document_formats,
    should_track_expiry,
    warning_days,
    schedule_impact
  );
end;
$$;

create or replace function public.save_document_type_service(
  actor_user_id uuid,
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
language sql
security definer
set search_path = ''
as $$
  select public.save_document_type_service(
    actor_user_id,
    target_workspace_id,
    target_document_type_id,
    document_title,
    document_description,
    is_required_at_onboarding,
    is_review_required,
    document_formats,
    should_track_expiry,
    warning_days,
    'track_only'
  );
$$;

revoke all on function public.save_document_type(uuid, uuid, text, text, boolean, boolean, text[], boolean, integer, text)
from public, anon, authenticated;
revoke all on function public.save_document_type_service(uuid, uuid, uuid, text, text, boolean, boolean, text[], boolean, integer, text)
from public, anon, authenticated;
grant execute on function public.save_document_type_service(uuid, uuid, uuid, text, text, boolean, boolean, text[], boolean, integer, text)
to service_role;
