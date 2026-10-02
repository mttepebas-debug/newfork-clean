-- FB-6.6 A1a: documents, signature templates and employee onboarding ask the
-- authorization core (app_private.authorize / authz_reason / scope_set).
--
--   * The eleven Settings > Documents and Signature templates bridges are
--     folded: each *_service holds its old inner body, asks the core first
--     (settings.documents.write, D7) and the inner function goes.
--   * Every other document and onboarding entry point asks the core first:
--     documents.read / documents.review / documents.self, onboarding.review /
--     onboarding.self, employee.read / employee.save where the screen is the
--     Employees drawer. service_actor_can_access_employee goes with its last
--     callers; service_actor_has_permission leaves this area.
--   * D1 nobody reviews their own document or a peer's: documents.review is
--     no_self and rank_below in the core. D2 one decision on a person working
--     at two locations is the decision. D3 a restricted manager reviews
--     nothing: the review actions are not restricted_ok. D4 somebody still
--     finishing onboarding opens their own notifications. D5 the owner's own
--     upload is on file at once and waits in nobody's queue (BL-118).
--   * D6: a draft definition still has no effect; the publication trigger
--     filters first and the services' assert_document_published comes after
--     the core.
--   * Onboarding activation is internal work (BL-133): an authorized review
--     or the employee's own last step leads to it; it is no entry point.
--   * BL-264: app_private.set_document_exemption runs as its caller.
--   * Who approves a legal name typed in onboarding (S1) and who sees a
--     pending document (S2) wait for Mert; today's answers stay.

-- 1. Which workspace an employee's own onboarding call is about ------------------------

-- The workspace named, or the one the call itself would act on: the onboarding
-- case it opens (by_case) or the first live membership with an employee record.
create function app_private.onboarding_self_workspace(u uuid, w uuid, by_case boolean)
returns uuid
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(
    w,
    case when by_case then (
      select c.workspace_id from public.employee_onboarding_cases c
      where c.id = app_private.employee_onboarding_case_id(u, null)
    ) end,
    (select profile.workspace_id
     from public.employee_profiles profile
     join public.workspace_memberships candidate
       on candidate.workspace_id = profile.workspace_id and candidate.user_id = profile.user_id
     where profile.user_id = u and profile.archived_at is null
       and candidate.status in ('pending_activation', 'active')
     order by candidate.created_at
     limit 1)
  );
$$;
revoke all on function app_private.onboarding_self_workspace(uuid, uuid, boolean) from public, anon, authenticated;

-- 2. Settings > Documents and Signature templates: the bridges fold -----------------

create or replace function public.approve_signature_retention_policy_service(actor_user_id uuid, target_workspace_id uuid, target_policy_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  target_name text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');

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
$function$;

create or replace function public.publish_signature_template_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  draft_record public.signature_template_versions%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
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
$function$;

create or replace function public.reorder_document_types_service(actor_user_id uuid, target_workspace_id uuid, ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  expected_count integer;
  matched_count integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
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
$function$;

create or replace function public.save_document_type_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, document_title text, document_description text, is_required_at_onboarding boolean, is_review_required boolean, document_formats text[], should_track_expiry boolean, warning_days integer, schedule_impact text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  saved_id uuid;
  normalized_formats text[];
  normalized_schedule_impact public.document_expiry_schedule_impact;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
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
$function$;

create or replace function public.save_signature_retention_policy_service(actor_user_id uuid, target_workspace_id uuid, target_policy_id uuid, policy_name text, policy_trigger text, policy_duration_days integer, policy_jurisdiction_scope text, policy_authority_reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  saved_id uuid;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
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
$function$;

create or replace function public.save_signature_template_draft_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid, template_name text, template_summary text, template_content text, template_intent_statement text, template_locale text, template_effective_date date, is_required_at_onboarding boolean, should_block_activation boolean, target_retention_policy_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  saved_template_id uuid;
  saved_version_id uuid;
  normalized_content text := replace(replace(template_content, E'\r\n', E'\n'), E'\r', E'\n');
  next_version integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
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
$function$;

create or replace function public.set_document_type_archived_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, should_archive boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  target_title text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');

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
$function$;

create or replace function public.set_signature_retention_policy_archived_service(actor_user_id uuid, target_workspace_id uuid, target_policy_id uuid, should_archive boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  target_name text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
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
$function$;

create or replace function public.set_signature_template_archived_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid, should_archive boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  target_name text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
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
$function$;

create or replace function public.unapprove_signature_retention_policy_service(actor_user_id uuid, target_workspace_id uuid, target_policy_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  target_name text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');

  update public.signature_retention_policies
  set status = 'draft', approved_by = null, approved_at = null, updated_at = now()
  where id = target_policy_id and workspace_id = target_workspace_id
    and status = 'approved' and archived_at is null
  returning name into target_name;
  if target_name is null then
    raise exception 'approved retention policy not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id, 'signature_retention_policy.unapproved',
    'signature_retention_policy', target_policy_id::text,
    jsonb_build_object('name', target_name)
  );
end;
$function$;

create or replace function public.unpublish_signature_template_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := actor_user_id;
  published_record public.signature_template_versions%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');

  select version.* into published_record
  from public.signature_template_versions version
  join public.signature_templates template on template.id = version.template_id
  where version.workspace_id = target_workspace_id
    and version.template_id = target_template_id
    and version.status = 'published'
    and template.archived_at is null
  order by version.version_number desc
  limit 1
  for update of version;

  if published_record.id is null then
    raise exception 'published acknowledgement template not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.signature_template_versions draft
    where draft.template_id = target_template_id
      and draft.status = 'draft'
      and draft.id <> published_record.id
  ) then
    raise exception 'draft acknowledgement already exists' using errcode = '23505';
  end if;

  update public.signature_template_versions
  set status = 'draft', published_by = null, published_at = null, updated_at = now()
  where id = published_record.id;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id, 'signature_template.unpublished',
    'signature_template', target_template_id::text,
    jsonb_build_object(
      'version_id', published_record.id,
      'version_number', published_record.version_number,
      'content_digest', published_record.content_digest
    )
  );
end;
$function$;

create or replace function public.save_document_type_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, document_title text, document_description text, is_required_at_onboarding boolean, is_review_required boolean, document_formats text[], should_track_expiry boolean, warning_days integer)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
  return public.save_document_type_service(actor_user_id, target_workspace_id, target_document_type_id, document_title,
    document_description, is_required_at_onboarding, is_review_required, document_formats, should_track_expiry, warning_days, 'track_only');
end;
$function$;

create or replace function public.save_document_type_draft_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, document_payload jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
  return public.save_document_type_lifecycle_service(actor_user_id, target_workspace_id, target_document_type_id, expected_revision, document_payload);
end;
$function$;

create or replace function public.initialize_employee_onboarding_service(target_user_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, null, false), 'onboarding.self');
  return public.initialize_employee_onboarding_service(target_user_id, null::uuid);
end;
$function$;

-- 3. Every other entry point and helper asks the core ---------------------------------

create or replace function app_private.document_actor_can_read(actor uuid, w uuid, e uuid, owner_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select app_private.workspace_allows_interactive_access(w) and (
  exists(select 1 from public.employee_profiles p join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.user_id=p.user_id
   where p.id=e and p.workspace_id=w and p.user_id=actor and owner_user=actor and p.archived_at is null
    and m.status in ('active','pending_activation'))
  or app_private.authz_reason(actor,w,'documents.read',null,e) is null
 );
$function$;

create or replace function app_private.document_notification_policy(outbox_id uuid, u uuid, snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.notification_outbox%rowtype; valid boolean; e uuid;
begin
 select * into o from public.notification_outbox where id=outbox_id;
 if o.type_key not like 'people.documents.%' then return snapshot; end if;
 e:=(o.payload->>'employee_id')::uuid;
 if o.type_key='people.documents.review' then valid:=app_private.authz_reason(u,o.workspace_id,'documents.review',null,e) is null;
 else valid:=exists(select 1 from public.employee_profiles where id=e and workspace_id=o.workspace_id and user_id=u and archived_at is null); end if;
 if o.payload->>'requirement_id' is not null then valid:=valid and exists(select 1 from public.employee_onboarding_requirements r where r.id=(o.payload->>'requirement_id')::uuid and r.workspace_id=o.workspace_id and r.employee_id=e and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt); end if;
 if o.type_key='people.documents.missing' then valid:=valid and exists(select 1 from public.employee_onboarding_requirements r where r.workspace_id=o.workspace_id and r.employee_id=e and r.lifecycle_user_id=u and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt and r.lifecycle_settings->>'mode'<>'optional' and app_private.document_obligation_state(r,now()) in ('missing','grace','rejected','expired') and not exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state='pending_review')); end if;
 if o.type_key in ('people.documents.review','people.documents.expiry') then valid:=valid and exists(select 1 from public.employee_onboarding_requirements r join public.employee_document_submissions s on s.id=(o.payload->>'submission_id')::uuid where r.id=(o.payload->>'requirement_id')::uuid and r.workspace_id=o.workspace_id and s.requirement_id=r.id and (case when o.type_key='people.documents.review' then r.submitted_document_id=s.id and s.state='pending_review' else r.approved_document_id=s.id and s.state='accepted' end)); end if;
 if o.type_key in ('people.documents.review','people.documents.expiry','people.documents.assigned') then valid:=valid and not exists(select 1 from public.employee_onboarding_requirements r left join public.document_types d on d.id=r.source_id and d.workspace_id=r.workspace_id and r.kind='document' where r.id=(o.payload->>'requirement_id')::uuid and (r.publication_paused_at is not null or d.publication_status='draft' or o.created_at<d.published_at or (o.payload ? 'document_publication_revision' and r.kind='document' and (o.payload->>'document_publication_revision')::integer is distinct from d.publication_revision))); end if;
 if o.type_key in ('people.documents.restricted','people.documents.restored') then valid:=valid and (app_private.document_actor_blocked(u,o.workspace_id)=(o.type_key='people.documents.restricted')); end if;

 if not coalesce(valid,false) then return snapshot||jsonb_build_object('decision','deny','eligible',false,'reason_chain',coalesce(snapshot->'reason_chain','[]'::jsonb)||'"document_audience_changed"'::jsonb); end if;
 return snapshot;
end;
$function$;

create or replace function app_private.enqueue_document_notification(w uuid, e uuid, u uuid, k text, kind text, title text, body text, requirement uuid DEFAULT NULL::uuid, actor uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare event uuid; recipients uuid[]; route text; requirement_kind text; submission uuid;
begin
 if kind='missing' then body:='You have outstanding document requests. Open Documents for details.'; end if; if u is null or not app_private.workspace_allows_interactive_access(w)
  or not exists(select 1 from public.employee_profiles p join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.user_id=p.user_id where p.id=e and p.workspace_id=w and p.user_id=u and p.archived_at is null and m.status in ('active','pending_activation')) then return false; end if;
 if requirement is not null and kind in ('expiry','review','assigned') and exists(select 1 from public.employee_onboarding_requirements r where r.id=requirement and r.publication_paused_at is not null) then return false; end if; if requirement is not null then
  select r.kind::text,case when enqueue_document_notification.kind='expiry' then r.approved_document_id else r.submitted_document_id end into requirement_kind,submission from public.employee_onboarding_requirements r where r.id=requirement and r.workspace_id=w and r.employee_id=e and r.lifecycle_user_id=u and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt;
  if requirement_kind is null then return false; end if;
 end if;
 if kind='review' then
  select coalesce(array_agg(m.user_id),'{}'::uuid[]) into recipients from public.workspace_memberships m where m.workspace_id=w and m.status='active'
   and app_private.authz_reason(m.user_id,w,'documents.review',null,e) is null;
  route:='/app/employees/documents?requirement='||requirement::text;
 else recipients:=array[u]; route:='/app/account/documents?workspace='||w::text||case when requirement is null then '' else '&requirement='||requirement::text||'&kind='||requirement_kind end; end if;
 insert into app_private.document_notification_dedup(workspace_id,employee_id,user_id,notification_key) values(w,e,u,k) on conflict do nothing returning event_id into event;
 if event is null then return false; end if;
 perform public.enqueue_notification_outbox_service(w,event,'people.documents.'||kind,1,actor,'employee_documents',e::text,
  jsonb_build_object('correlation_id',event,'employee_id',e,'requirement_id',requirement,'submission_id',submission,'document_publication_revision',(select d.publication_revision from public.employee_onboarding_requirements r join public.document_types d on d.id=r.source_id and d.workspace_id=r.workspace_id where r.id=requirement and r.kind='document'),'recipient_user_ids',to_jsonb(recipients),'audience_contract',case when kind='review' then 'document_reviewers' else 'document_employee' end,
   'title',title,'body',body,'safe_preview','A document update is available.','action_url',route,'group_key','documents:'||e::text),now());
 return true;
end;
$function$;

create or replace function app_private.document_timezone_admin(actor uuid, w uuid, e uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Saves the person and writes document settings: an owner or an admin.
 select app_private.authz_reason(actor,w,'employee.save',null,e) is null
  and app_private.authz_reason(actor,w,'settings.documents.write') is null;
$function$;

create or replace function app_private.preview_lifecycle_definition(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, target_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d app_private.lifecycle_definition%rowtype; rows jsonb; token text;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 select * into d from app_private.lifecycle_definition where id=target_document_type_id and workspace_id=target_workspace_id and kind=target_kind;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 with candidates as (
  select e.id,e.first_name,e.last_name,e.revision as employee_revision,r,
   d.archived_at is null and (target_kind<>'document' or (e.archived_at is null and m.status in ('active','pending_activation'))) and app_private.document_target_matches(e.workspace_id,e.id,d.lifecycle_settings->'target') as matches,
   m.status as membership_status
  from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
  left join public.employee_onboarding_requirements r on r.workspace_id=e.workspace_id and r.employee_id=e.id and r.source_id=d.id and r.kind::text=target_kind and r.lifecycle_retired_at is null
  where e.workspace_id=target_workspace_id and ((e.archived_at is null and m.status in ('active','pending_activation')) or (target_kind='document' and (r).publication_paused_at is not null))
 ), effects as (
  select *,case when (r).lifecycle_exempt then 'exempt'
   when target_kind='document' and ((r).lifecycle_retired_at is not null or (r).lifecycle_assignment_disabled or (r).lifecycle_closed_at is not null or (r).status='superseded') then 'unchanged' when target_kind='document' and matches and (r).publication_paused_at is not null then 'update' when not matches and (r).id is not null and (r).lifecycle_closed_at is null then 'remove'
   when matches and (r).id is null and (membership_status='pending_activation' or d.lifecycle_settings->>'assignment_scope'='all_active') then 'assign'
   when matches and ((r).lifecycle_closed_at is not null or (r).status='superseded') then 'reopen'
   when matches and (r).id is not null and ((r).lifecycle_settings is distinct from d.lifecycle_settings or (r).source_snapshot is distinct from d.snapshot
    or (r).title is distinct from d.title or (r).description is distinct from d.description) then 'update'
   else 'unchanged' end as action
  from candidates
 ) select coalesce(jsonb_agg(jsonb_build_object('employee_id',id,'employee_name',concat_ws(' ',first_name,last_name),'employee_revision',employee_revision,
   'requirement_id',(r).id,'revision',(r).lifecycle_revision,'action',action,
   'deadline_action',case when action in ('remove','exempt') or d.lifecycle_settings->>'mode'='optional' then 'clear'
    when target_kind='document' and (r).publication_paused_at is not null and action='update' then 'restart' when action in ('assign','reopen') then 'restart'
    when action='update' and ((r).lifecycle_settings->>'mode',(r).lifecycle_settings->>'period_days',(r).lifecycle_settings->>'suspend_on_overdue')
      is distinct from (d.lifecycle_settings->>'mode',d.lifecycle_settings->>'period_days',d.lifecycle_settings->>'suspend_on_overdue') then 'restart'
    else 'preserve' end) order by id),'[]') into rows from effects;
 token:=encode(extensions.digest(convert_to(jsonb_build_object('actor',actor_user_id,'definition',to_jsonb(d),'employees',rows)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('revision',d.lifecycle_revision,'preview_token',token,'employees',rows);
end;
$function$;

create or replace function app_private.apply_lifecycle_definition(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_preview_token text, apply_reason text, target_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d app_private.lifecycle_definition%rowtype; preview jsonb; item jsonb; r public.employee_onboarding_requirements%rowtype;
 case_id uuid; member public.workspace_memberships%rowtype; deadline timestamptz; applied integer:=0; valid_approved boolean;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 if nullif(btrim(apply_reason),'') is null or char_length(apply_reason)>500 then raise exception 'application reason required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 if target_kind='acknowledgement' then perform 1 from public.signature_template_versions where id=target_document_type_id and workspace_id=target_workspace_id for update; else perform 1 from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update; end if; select * into d from app_private.lifecycle_definition where id=target_document_type_id and workspace_id=target_workspace_id and kind=target_kind;
 if d.id is null or d.lifecycle_revision is distinct from expected_revision then raise exception 'document type changed; refresh required' using errcode='PT409'; end if;
 -- Lock every scoped input that contributes to this preview before revalidation.
 perform 1 from public.employee_profiles e where e.workspace_id=target_workspace_id and e.archived_at is null order by e.id for update;
 perform 1 from public.employee_onboarding_cases where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id order by id for update;
 preview:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,target_kind);
 if preview->>'preview_token' is distinct from expected_preview_token then raise exception 'document impact changed; refresh preview' using errcode='PT409'; end if;
 for item in select value from jsonb_array_elements(preview->'employees') where value->>'action' in ('assign','update','reopen','remove') loop
  select m.* into member from public.workspace_memberships m join public.employee_profiles e on e.workspace_id=m.workspace_id and e.user_id=m.user_id
   where e.id=(item->>'employee_id')::uuid and m.workspace_id=target_workspace_id;
  if item->>'action'='assign' then
   insert into public.employee_onboarding_cases(workspace_id,employee_id,membership_id,status,approved_at,approved_by)
   values(target_workspace_id,(item->>'employee_id')::uuid,member.id,
    case when member.status='active' then 'approved'::public.employee_onboarding_case_status else 'in_progress'::public.employee_onboarding_case_status end,
    case when member.status='active' then now() end,case when member.status='active' then actor_user_id end)
   on conflict(employee_id) do nothing;
   select id into case_id from public.employee_onboarding_cases where workspace_id=target_workspace_id and employee_id=(item->>'employee_id')::uuid;
   insert into public.employee_onboarding_requirements(workspace_id,employee_id,case_id,kind,source_id,title,description,required,blocks_activation,requires_review,sort_order,source_snapshot,lifecycle_settings)
   values(target_workspace_id,(item->>'employee_id')::uuid,case_id,target_kind::public.employee_onboarding_requirement_kind,d.id,d.title,d.description,d.lifecycle_settings->>'mode'='required',d.lifecycle_settings->>'mode'='required',d.requires_review,100+d.sort_order,d.snapshot,d.lifecycle_settings)
   returning * into r;
  else
   select * into r from public.employee_onboarding_requirements where id=(item->>'requirement_id')::uuid;
   deadline:=r.deadline_at;
   r.publication_paused_at:=null; r.lifecycle_closed_at:=null; if r.status='superseded' then r.status:='not_started'; end if;
   valid_approved:=app_private.document_obligation_state(r,now())='completed';
   if item->>'deadline_action'='clear' or valid_approved then deadline:=null;
   elsif item->>'deadline_action'='restart' then
    deadline:=case when member.status='active' and d.lifecycle_settings->>'period_days' is not null then now()+(d.lifecycle_settings->>'period_days')::integer*interval '24 hours' end;
   end if;
   update public.employee_onboarding_requirements set
    title=d.title,description=d.description,source_snapshot=d.snapshot,lifecycle_settings=d.lifecycle_settings,
    required=d.lifecycle_settings->>'mode'='required',blocks_activation=d.lifecycle_settings->>'mode'='required',requires_review=d.requires_review,
    lifecycle_assignment_disabled=d.archived_at is not null,lifecycle_closed_at=case when item->>'action'='remove' then now() end,lifecycle_close_reason=case when item->>'action'='remove' then btrim(apply_reason) end,
    status=case when item->>'action'='reopen' and status='superseded' then 'not_started'::public.employee_onboarding_requirement_status else status end,
    publication_paused_at=case when target_kind='document' then null else publication_paused_at end,deadline_at=deadline,paused_remaining_seconds=case when target_kind='document' and item->>'deadline_action'='restart' and not valid_approved and d.lifecycle_settings->>'mode'<>'optional' and exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state='pending_review') then (d.lifecycle_settings->>'period_days')::numeric*86400 when item->>'deadline_action'='preserve' then paused_remaining_seconds end,
    document_suspended_at=case when target_kind='document' and item->>'deadline_action'='restart' then null when item->>'action'='remove' or d.lifecycle_settings->>'mode'='optional' or not (d.lifecycle_settings->>'suspend_on_overdue')::boolean then null else document_suspended_at end,
    lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning * into r;
  end if;
  perform app_private.document_audit(r,actor_user_id,'document.definition_applied',jsonb_build_object('reason',btrim(apply_reason),'definition_revision',d.lifecycle_revision,'action',item->>'action','revision',r.lifecycle_revision,'deadline_action',item->>'deadline_action'));
  if member.status='pending_activation' and r.required and item->>'action' in ('assign','reopen') then update public.employee_onboarding_cases set status='changes_requested',revision=revision+1,updated_at=now() where id=r.case_id and status='submitted'; end if; perform app_private.document_sync_onboarding(r.id,actor_user_id); applied:=applied+1;
 end loop;
 return jsonb_build_object('applied',applied);
end;
$function$;

create or replace function app_private.document_account_inbox_action_base(actor_user_id uuid, target_workspace_id uuid, target_item_id uuid, target_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare affected integer; workspace_result jsonb;
begin
 if target_workspace_id is not null then
  perform app_private.authorize(actor_user_id,target_workspace_id,'notifications.read_own'); end if;
 if target_action not in ('read_all','seen','read','unread','dismiss') then raise exception 'unsupported notification action' using errcode='22023'; end if;
 if target_action='read_all' or exists(select 1 from public.account_notification_items where id=target_item_id and user_id=actor_user_id) then
  update public.account_notification_items set
   seen_at=coalesce(seen_at,now()),
   read_at=case when target_action in ('read','read_all') then coalesce(read_at,now()) when target_action='unread' then null else read_at end,
   dismissed_at=case when target_action='dismiss' then now() else dismissed_at end
  where user_id=actor_user_id and dismissed_at is null and (target_action='read_all' or id=target_item_id);
  get diagnostics affected=row_count;
  if target_action='read_all' and target_workspace_id is not null then
   workspace_result:=public.act_on_notification_inbox_workspace_base(actor_user_id,target_workspace_id,null,target_action);
   affected:=affected+(workspace_result->>'affected')::integer;
  end if;
  return jsonb_build_object('status','saved','affected',affected);
 end if;
 if target_workspace_id is null then raise exception 'notification inbox item not found' using errcode='P0002'; end if;
 return public.act_on_notification_inbox_workspace_base(actor_user_id,target_workspace_id,target_item_id,target_action);
end; $function$;

create or replace function public.act_on_notification_inbox_workspace_base(actor_user_id uuid, target_workspace_id uuid, target_item_id uuid, target_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  affected integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');

  if target_action = 'read_all' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        read_at = coalesce(item.read_at, now())
    from public.notification_recipients recipient
    where item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible';
  elsif target_item_id is null then
    raise exception 'notification inbox item required' using errcode = '22023';
  elsif target_action = 'seen' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now())
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  elsif target_action = 'read' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        read_at = coalesce(item.read_at, now())
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  elsif target_action = 'unread' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        read_at = null
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  elsif target_action = 'dismiss' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        dismissed_at = now()
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  else
    raise exception 'unsupported notification action' using errcode = '22023';
  end if;

  get diagnostics affected = row_count;
  if target_action <> 'read_all' and affected = 0 then
    raise exception 'notification inbox item not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('status', 'saved', 'affected', affected);
end;
$function$;

create or replace function public.get_notification_inbox_v2_service(actor_user_id uuid, target_workspace_id uuid, target_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_cursor_id uuid DEFAULT NULL::uuid, target_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  effective_limit integer := greatest(1, least(coalesce(target_limit, 30), 50));
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  if (target_cursor_created_at is null) <> (target_cursor_id is null) then
    raise exception 'complete notification cursor required' using errcode = '22023';
  end if;

  with candidate as (
    select
      item.id,
      item.workspace_id,
      recipient.event_id,
      event.type_key,
      event.schema_version,
      item.title,
      item.body,
      item.safe_preview,
      item.action_url,
      item.group_key,
      item.created_at,
      item.seen_at,
      item.read_at,
      item.dismissed_at,
      item.visibility_state
    from public.notification_inbox_items item
    join public.notification_recipients recipient
      on recipient.id = item.recipient_projection_id
     and recipient.workspace_id = item.workspace_id
    join public.notification_events event
      on event.id = recipient.event_id
     and event.workspace_id = recipient.workspace_id
    where item.workspace_id = target_workspace_id
      and recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible'
      and (
        target_cursor_created_at is null
        or (item.created_at, item.id) < (target_cursor_created_at, target_cursor_id)
      )
    order by item.created_at desc, item.id desc
    limit effective_limit + 1
  ), page as (
    select * from candidate
    order by created_at desc, id desc
    limit effective_limit
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'unread_count', (
      select count(*)
      from public.notification_inbox_items unread_item
      join public.notification_recipients unread_recipient
        on unread_recipient.id = unread_item.recipient_projection_id
       and unread_recipient.workspace_id = unread_item.workspace_id
      where unread_item.workspace_id = target_workspace_id
        and unread_recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
        and unread_item.read_at is null
        and unread_item.dismissed_at is null
        and unread_item.visibility_state = 'visible'
    ),
    'next_cursor', case
      when (select count(*) from candidate) > effective_limit then (
        select jsonb_build_object('created_at', created_at, 'id', id)
        from page
        order by created_at asc, id asc
        limit 1
      )
      else null
    end,
    'items', coalesce((
      select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id desc)
      from page page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

create or replace function public.get_notification_inbox_v2_service(actor_user_id uuid, target_workspace_id uuid, target_category text, target_severity text, target_read_state text, target_cursor_created_at timestamp with time zone, target_cursor_id uuid, target_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  effective_limit integer := greatest(1, least(coalesce(target_limit, 30), 50));
begin
  if target_workspace_id is not null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  end if;
  if (target_cursor_created_at is null) <> (target_cursor_id is null) then
    raise exception 'complete notification cursor required' using errcode = '22023';
  end if;
  if target_category is not null and target_category not in (
    'security', 'schedule', 'requests',
    'payroll', 'people', 'communications', 'system',
    'announcement', 'request'
  ) then
    raise exception 'valid notification category required' using errcode = '22023';
  end if;
  if target_severity is not null and target_severity not in ('info', 'success', 'warning', 'action_required') then
    raise exception 'valid notification severity required' using errcode = '22023';
  end if;
  if target_read_state is not null and target_read_state not in ('all', 'seen', 'unseen', 'read', 'unread') then
    raise exception 'valid notification read state required' using errcode = '22023';
  end if;

  with all_items as (
    select
      item.id,
      item.workspace_id,
      catalog.category,
      event.type_key,
      event.schema_version,
      catalog.severity,
      item.title,
      item.body,
      case when target_workspace_id is null then (select w.name from public.workspaces w where w.id=item.workspace_id)||' · A document update is available.' else item.safe_preview end as safe_preview,
      item.action_url,
      item.group_key,
      'notification_event'::text as source_type,
      event.id as source_id,
      item.created_at,
      item.seen_at,
      item.read_at,
      item.dismissed_at,
      item.visibility_state
    from public.notification_inbox_items item
    join public.notification_recipients recipient
      on recipient.id = item.recipient_projection_id
     and recipient.workspace_id = item.workspace_id
    join public.notification_events event
      on event.id = recipient.event_id
     and event.workspace_id = recipient.workspace_id
    join public.notification_catalog catalog
      on catalog.type_key = event.type_key
     and catalog.schema_version = event.schema_version
    where (item.workspace_id = target_workspace_id or (target_workspace_id is null and app_private.document_account_inbox_allowed(item.id,get_notification_inbox_v2_service.actor_user_id)))
      and recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible'

    union all
    select a.id,null::uuid,'security',a.type_key,a.schema_version,c.severity,t.content->>'title',t.content->>'body',
     t.content->>'safe_preview','/app/account/security',null::text,'account_security',a.event_id,a.created_at,a.seen_at,a.read_at,a.dismissed_at,'visible'
    from public.account_notification_items a join public.notification_catalog c using(type_key,schema_version)
    join public.notification_template_versions t using(type_key,schema_version)
    where a.user_id=actor_user_id and a.dismissed_at is null and t.channel='in_app' and t.locale='en' and t.status='published'
  ), candidate as (
    select * from all_items item where true
      and (
        target_category is null
        or item.category = target_category
        or (target_category = 'announcement' and item.category = 'communications')
        or (target_category = 'request' and item.category = 'requests')
      )
      and (target_severity is null or item.severity = target_severity)
      and (
        target_read_state is null
        or target_read_state = 'all'
        or (target_read_state = 'seen' and item.seen_at is not null)
        or (target_read_state = 'unseen' and item.seen_at is null)
        or (target_read_state = 'read' and item.read_at is not null)
        or (target_read_state = 'unread' and item.read_at is null)
      )
      and (
        target_cursor_created_at is null
        or (item.created_at, item.id) < (target_cursor_created_at, target_cursor_id)
      )
    order by item.created_at desc, item.id desc
    limit effective_limit + 1
  ), page as (
    select * from candidate
    order by created_at desc, id desc
    limit effective_limit
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'unread_count', (select count(*) from public.account_notification_items where user_id=actor_user_id and read_at is null and dismissed_at is null) + (
      select count(*)
      from public.notification_inbox_items unread_item
      join public.notification_recipients unread_recipient
        on unread_recipient.id = unread_item.recipient_projection_id
       and unread_recipient.workspace_id = unread_item.workspace_id
      where (unread_item.workspace_id = target_workspace_id or (target_workspace_id is null and app_private.document_account_inbox_allowed(unread_item.id,get_notification_inbox_v2_service.actor_user_id)))
        and unread_recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
        and unread_item.read_at is null
        and unread_item.dismissed_at is null
        and unread_item.visibility_state = 'visible'
    ),
    'next_cursor', case
      when (select count(*) from candidate) > effective_limit then (
        select jsonb_build_object('created_at', created_at, 'id', id)
        from page
        order by created_at asc, id asc
        limit 1
      )
      else null
    end,
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page_row.id,
        'workspace_id', page_row.workspace_id,
        'scope', case when page_row.workspace_id is null then 'account' else 'workspace' end,
        'category', page_row.category,
        'type_key', page_row.type_key,
        'severity', page_row.severity,
        'safe_preview', page_row.safe_preview,
        'title', page_row.title,
        'body', page_row.body,
        'action_url', page_row.action_url,
        'group_key', page_row.group_key,
        'source_type', page_row.source_type,
        'source_id', page_row.source_id,
        'created_at', page_row.created_at,
        'seen_at', page_row.seen_at,
        'read_at', page_row.read_at,
        'visibility_state', page_row.visibility_state
      ) order by page_row.created_at desc, page_row.id desc)
      from page page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

create or replace function public.document_definition_target_options_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name) from public.locations l where l.workspace_id=target_workspace_id and app_private.location_is_live(l)),'[]'),
  'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by lower(d.name),d.id) from public.departments d where d.workspace_id=target_workspace_id and d.archived_at is null),'[]'),
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'name',j.name,'department_id',j.department_id) order by lower(j.name),j.id) from public.jobs j where j.workspace_id=target_workspace_id and j.archived_at is null),'[]'),
  'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',concat_ws(' ',e.first_name,e.last_name)) order by e.first_name,e.last_name) from public.employee_profiles e where e.workspace_id=target_workspace_id and e.archived_at is null),'[]')
 ) into result;
 return result;
end;
$function$;

create or replace function public.preview_document_publication_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.document_types%rowtype; result jsonb; effects jsonb; scope_options jsonb; pair text[]; identities jsonb; token text;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 if d.archived_at is not null then raise exception 'Archived documents cannot be published; restore first' using errcode='PT409'; end if;
 perform app_private.assert_document_definition_target(actor_user_id,target_workspace_id,d.lifecycle_settings->'target');
 result:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
 if d.publication_status='published' then
  select coalesce(jsonb_agg(jsonb_build_object('employee_id',r.employee_id,'employee_name',concat_ws(' ',e.first_name,e.last_name),'employee_revision',e.revision,
    'requirement_id',r.id,'revision',r.lifecycle_revision,'action','pause','deadline_action','pause') order by r.id),'[]') into effects
  from public.employee_onboarding_requirements r join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=r.workspace_id
  where r.workspace_id=target_workspace_id and r.source_id=d.id and r.kind='document' and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt and not r.lifecycle_assignment_disabled;
  result:=jsonb_set(result,'{employees}',effects);
 end if;
 scope_options:=public.document_definition_target_options_service(actor_user_id,target_workspace_id);
 -- Include selected identities and the actual locations/jobs/departments of affected employees.
 foreach pair slice 1 in array array[['location_ids','locations'],['department_ids','departments'],['job_ids','jobs'],['employee_ids','named_people']] loop
  select coalesce(jsonb_agg(o order by o->>'name',o->>'id'),'[]') into identities
  from jsonb_array_elements(scope_options->case when pair[2]='named_people' then 'employees' else pair[2] end) o
  where (pair[2]<>'named_people' and jsonb_array_length(coalesce(d.lifecycle_settings->'target'->pair[1],'[]'))=0) or (d.lifecycle_settings->'target'->pair[1]) ? (o->>'id') or (pair[2]<>'named_people' and exists(
   select 1 from jsonb_array_elements(result->'employees') effect
   where effect->>'action' not in ('unchanged','exempt') and (
    (pair[2]='locations' and exists(select 1 from public.employee_location_assignments a where a.workspace_id=target_workspace_id and a.employee_id=(effect->>'employee_id')::uuid and a.ended_at is null and a.location_id=(o->>'id')::uuid)) or
    (pair[2] in ('jobs','departments') and exists(select 1 from public.employee_job_assignments a join public.jobs j on j.id=a.job_id and j.workspace_id=a.workspace_id where a.workspace_id=target_workspace_id and a.employee_id=(effect->>'employee_id')::uuid and a.ended_at is null and (case when pair[2]='jobs' then j.id else j.department_id end)=(o->>'id')::uuid))
   )));
  result:=result||jsonb_build_object(pair[2],identities);
 end loop;
 -- Return exact matcher membership even for unchanged/exempt rows; bind it to the confirmation token.
 select coalesce(jsonb_agg(effect || jsonb_build_object('matches_target',
   exists(select 1 from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
    where e.id=(effect->>'employee_id')::uuid and e.workspace_id=target_workspace_id and e.archived_at is null and m.status in ('active','pending_activation')
      and app_private.document_target_matches(e.workspace_id,e.id,d.lifecycle_settings->'target')))
   order by position),'[]') into effects
 from jsonb_array_elements(result->'employees') with ordinality as entries(effect,position);
 result:=jsonb_set(result,'{employees}',effects);
 result:=(result-'preview_token')||jsonb_build_object('publication_revision',d.publication_revision,'target',d.lifecycle_settings->'target','assignment_scope',d.lifecycle_settings->>'assignment_scope','transition',case when d.publication_status='draft' then 'publish' else 'unpublish' end);
 token:=encode(extensions.digest(convert_to(jsonb_build_object('actor',actor_user_id,'definition',to_jsonb(d),'impact',result)::text,'UTF8'),'sha256'),'hex');
 return result||jsonb_build_object('preview_token',token);
end;
$function$;

create or replace function public.set_document_publication_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_publication_revision integer, expected_preview_token text, publish_reason text, target_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.document_types%rowtype; preview jsonb; core_preview jsonb; result jsonb; r public.employee_onboarding_requirements%rowtype;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 if target_status is null or target_status not in ('draft','published') or nullif(btrim(publish_reason),'') is null or char_length(publish_reason)>500 then raise exception 'Valid publication status and reason required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 if d.lifecycle_revision is distinct from expected_revision or d.publication_revision is distinct from expected_publication_revision or d.publication_status=target_status then raise exception 'Document publication changed; refresh required' using errcode='PT409'; end if;
 -- Assignment mutations use this same tenant advisory lock. Lock cases before requirements, as Submit/review do.
 perform 1 from public.employee_profiles where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_cases where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id and kind='document' order by id for update;
 perform 1 from public.departments where workspace_id=target_workspace_id order by id for share;
 perform 1 from public.employee_location_assignments where workspace_id=target_workspace_id order by id for share;
 preview:=public.preview_document_publication_service(actor_user_id,target_workspace_id,d.id);
 if preview->>'preview_token' is distinct from expected_preview_token then raise exception 'Document publication impact changed; refresh preview' using errcode='PT409'; end if;
 if target_status='published' then
  update public.document_types set publication_status='published',publication_revision=publication_revision+1,published_at=now() where id=d.id;
  core_preview:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
  result:=app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,d.id,d.lifecycle_revision,core_preview->>'preview_token',publish_reason,'document');
  update public.employee_onboarding_requirements set publication_paused_at=null,lifecycle_revision=lifecycle_revision+1 where workspace_id=target_workspace_id and source_id=d.id and kind='document' and publication_paused_at is not null and (lifecycle_exempt or lifecycle_closed_at is not null or lifecycle_retired_at is not null or lifecycle_assignment_disabled or status='superseded');
  for r in select * from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id and kind='document'
   and owner_excused and lifecycle_retired_at is null and not app_private.employee_record_is_workspace_owner(workspace_id,employee_id) loop
   perform app_private.set_document_exemption(r,actor_user_id,false,'No longer the owner',r.lifecycle_revision);
  end loop;
 else
  update public.document_types set publication_status='draft',publication_revision=publication_revision+1 where id=d.id;
  for r in update public.employee_onboarding_requirements set publication_paused_at=now(),deadline_at=null,document_suspended_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now()
   where workspace_id=target_workspace_id and source_id=d.id and kind='document' and lifecycle_retired_at is null and lifecycle_closed_at is null and not lifecycle_exempt and not lifecycle_assignment_disabled returning * loop
   perform app_private.document_audit(r,actor_user_id,'document.publication_paused',jsonb_build_object('reason',btrim(publish_reason),'publication_revision',d.publication_revision+1));
  end loop;
  update public.notification_outbox set payload=jsonb_set(payload,'{body}',to_jsonb('You have outstanding document requests. Open Documents for details.'::text)) where workspace_id=target_workspace_id and type_key='people.documents.missing' and status in ('pending','retry');
  result:=jsonb_build_object('paused',jsonb_array_length(preview->'employees'));
 end if;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
 values(target_workspace_id,actor_user_id,case when target_status='published' then 'document_type.published' else 'document_type.unpublished' end,'document_type',d.id::text,jsonb_build_object('reason',btrim(publish_reason),'definition_revision',d.lifecycle_revision,'publication_revision',d.publication_revision+1,'impact',preview->'employees'));
 return result||jsonb_build_object('publication_status',target_status,'publication_revision',d.publication_revision+1);
end;
$function$;

create or replace function public.save_document_type_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, document_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare settings jsonb:=document_payload->'lifecycle_settings'; saved_id uuid; actual_revision integer; period integer;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 settings:=jsonb_set(settings,'{assignment_scope}','"all_active"'::jsonb); if target_document_type_id is null and jsonb_array_length(coalesce(settings->'target'->'employee_ids','[]'))>0 then raise exception 'Individual document assignment is not supported' using errcode='22023'; end if; if target_document_type_id is not null and exists(select 1 from public.document_types d where d.id=target_document_type_id and d.workspace_id=target_workspace_id and coalesce(d.lifecycle_settings->'target'->'employee_ids','[]') is distinct from coalesce(settings->'target'->'employee_ids','[]')) then raise exception 'Legacy named targets must be preserved' using errcode='22023'; end if; if settings is null or settings->>'mode' is null or settings->>'mode' not in ('optional','required','conditional')
  or settings->>'assignment_scope' is null or settings->>'assignment_scope' not in ('future_onboarding','all_active')
  or jsonb_typeof(settings->'target') is distinct from 'object'
 then raise exception 'valid document lifecycle settings required' using errcode='22023'; end if;
 perform app_private.assert_document_definition_target(actor_user_id,target_workspace_id,settings->'target'); period:=(settings->>'period_days')::integer;
 if (period is not null and period not between 1 and 3650)
  or (settings->>'mode'='conditional' and period is null)
  or (coalesce((settings->>'suspend_on_overdue')::boolean,false) and (settings->>'mode'='optional' or period is null))
 then raise exception 'valid document period required' using errcode='22023'; end if;
 if target_document_type_id is not null then
  select lifecycle_revision into actual_revision from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;
  if actual_revision is null then raise exception 'document type unavailable' using errcode='P0002'; end if;
  if actual_revision is distinct from expected_revision then raise exception 'document type changed; refresh required' using errcode='PT409'; end if;
 end if;
 saved_id:=public.save_document_type_service(actor_user_id,target_workspace_id,target_document_type_id,
  document_payload->>'title',coalesce(document_payload->>'description',''),settings->>'mode'='required',
  (document_payload->>'requires_review')::boolean,array(select jsonb_array_elements_text(document_payload->'accepted_formats')),
  (document_payload->>'tracks_expiry')::boolean,(document_payload->>'expiry_warning_days')::integer,'track_only');
 update public.document_types set lifecycle_settings=settings,lifecycle_revision=case when target_document_type_id is null then 1 else lifecycle_revision+1 end where id=saved_id;
 return saved_id;
end;
$function$;

create or replace function public.save_policy_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid, policy_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare settings jsonb:=policy_payload->'lifecycle_settings'; saved_id uuid; period integer; prior_revision integer;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 if settings is null or settings->>'mode' is null or settings->>'mode' not in ('optional','required')
  or settings->>'assignment_scope' is null or settings->>'assignment_scope' not in ('future_onboarding','all_active') or jsonb_typeof(settings->'target') is distinct from 'object'
 then raise exception 'valid policy assignment settings required' using errcode='22023'; end if;
 perform app_private.assert_document_definition_target(actor_user_id,target_workspace_id,settings->'target');
 period:=(settings->>'period_days')::integer;
 if (period is not null and period not between 1 and 3650) or (coalesce((settings->>'suspend_on_overdue')::boolean,false) and (settings->>'mode'='optional' or period is null))
 then raise exception 'valid policy delivery period required' using errcode='22023'; end if;
 if target_template_id is not null then
  perform 1 from public.signature_templates where id=target_template_id and workspace_id=target_workspace_id for update;
  select lifecycle_revision into prior_revision from public.signature_template_versions where template_id=target_template_id and workspace_id=target_workspace_id and status='draft' for update;
  if prior_revision is not null and prior_revision is distinct from (policy_payload->>'lifecycle_revision')::integer then raise exception 'policy draft changed; refresh required' using errcode='PT409'; end if;
 end if;
 saved_id:=public.save_signature_template_draft_service(actor_user_id,target_workspace_id,target_template_id,
  policy_payload->>'title',policy_payload->>'summary',policy_payload->>'content_text',policy_payload->>'intent_statement',policy_payload->>'locale',
  (policy_payload->>'effective_date')::date,settings->>'mode'='required',settings->>'mode'='required',(policy_payload->>'retention_policy_id')::uuid);
 update public.signature_template_versions set lifecycle_settings=settings,lifecycle_revision=coalesce(prior_revision,0)+1 where template_id=saved_id and status='draft';
 return saved_id;
end;
$function$;

create or replace function public.extend_employee_document_deadline_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_revision integer, additional_days integer, extension_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; revised_deadline timestamptz;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'documents.review',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 perform 1 from public.employee_onboarding_cases c join public.employee_onboarding_requirements q on q.case_id=c.id where q.id=target_requirement_id and q.workspace_id=target_workspace_id for update of c;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind in ('document','acknowledgement') for update;
 if r.id is null then raise exception 'document unavailable' using errcode='P0002'; end if;
 perform app_private.assert_document_published(r);
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if additional_days is null or additional_days not between 1 and 3650 or nullif(btrim(extension_reason),'') is null or char_length(extension_reason)>500 then raise exception 'extension days and reason required' using errcode='22023'; end if;
 if r.deadline_at is null or r.deadline_at<=now() or r.lifecycle_exempt or r.lifecycle_closed_at is not null or r.lifecycle_retired_at is not null
  or r.lifecycle_settings->>'mode'='optional' or r.document_suspended_at is not null or app_private.document_actor_blocked(r.lifecycle_user_id,r.workspace_id)
  or app_private.document_obligation_state(r,now())='completed'
  or exists(select 1 from public.employee_document_submissions where id=r.submitted_document_id and state='pending_review')
 then raise exception 'only an active deadline before suspension can be extended' using errcode='22023'; end if;
 revised_deadline:=r.deadline_at+additional_days*interval '24 hours';
 update public.employee_onboarding_requirements set deadline_at=revised_deadline,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.deadline_extended',jsonb_build_object('reason',btrim(extension_reason),'previous_deadline',r.deadline_at,'new_deadline',revised_deadline,'additional_days',additional_days,'revision',expected_revision));
 return expected_revision;
end;
$function$;

create or replace function public.review_employee_document_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_revision integer, target_submission_id uuid, review_decision text, review_reason text, correction_period text, file_decisions jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; s public.employee_document_submissions%rowtype; choice jsonb; next_deadline timestamptz; remaining numeric; suspended timestamptz; correction_draft uuid;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'documents.review',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 perform 1 from public.employee_onboarding_cases c join public.employee_onboarding_requirements q on q.case_id=c.id where q.id=target_requirement_id and app_private.document_actor_can_read(actor_user_id,q.workspace_id,q.employee_id,q.lifecycle_user_id) for update of c;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id for update;
 if r.id is null then raise exception 'document unavailable' using errcode='P0002'; end if;
 perform app_private.assert_document_published(r);
 if r.lifecycle_revision<>expected_revision or r.submitted_document_id is distinct from target_submission_id then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.status='superseded' then raise exception 'document obligation is closed' using errcode='22023'; end if;
 select * into s from public.employee_document_submissions where id=target_submission_id and requirement_id=r.id and state in ('pending_review','accepted') for update;
 if s.id is null then raise exception 'submission changed; refresh required' using errcode='PT409'; end if;
 if review_decision is null or review_decision not in ('approve','reject') or correction_period is null or correction_period not in ('full','remaining')
  or (review_decision='reject' and (nullif(btrim(review_reason),'') is null or char_length(review_reason)>500)) then raise exception 'valid review decision and reason required' using errcode='22023'; end if;
 if file_decisions is null or jsonb_typeof(file_decisions)<>'array' then raise exception 'file decisions required' using errcode='22023'; end if;
 if jsonb_array_length(file_decisions)<>(select count(*) from public.employee_document_submission_files where submission_id=s.id)
  or (select count(distinct value->>'id') from jsonb_array_elements(file_decisions))<>jsonb_array_length(file_decisions)
 then raise exception 'decide every file exactly once' using errcode='22023'; end if;
 for choice in select value from jsonb_array_elements(file_decisions) loop
  if choice->>'decision' is null or choice->>'decision' not in ('keep','discard') or char_length(coalesce(choice->>'note',''))>500
   or not exists(select 1 from public.employee_document_submission_files where submission_id=s.id and file_id=(choice->>'id')::uuid)
  then raise exception 'invalid file decision' using errcode='22023'; end if;
 end loop;
 if review_decision='approve' and not exists(select 1 from jsonb_array_elements(file_decisions) f where f->>'decision'='keep') then raise exception 'keep a file to approve' using errcode='22023'; end if;
 if review_decision='approve' and s.expiry_date is not null and app_private.document_employee_timezone(r.workspace_id,r.employee_id) is null then raise exception 'Document timezone needs administrator configuration' using errcode='22023'; end if; if review_decision='approve' and s.expiry_date<(now() at time zone app_private.document_employee_timezone(r.workspace_id,r.employee_id))::date then raise exception 'expired document cannot be approved' using errcode='22023'; end if;
 remaining:=coalesce(r.paused_remaining_seconds,case when r.deadline_at is not null then greatest(0,extract(epoch from r.deadline_at-now())) end);
 if review_decision='reject' and correction_period='remaining' and coalesce(remaining,0)<=0 then raise exception 'no correction time remains' using errcode='22023'; end if;
 suspended:=r.document_suspended_at;
 if app_private.document_obligation_blocked(r,now()) then suspended:=coalesce(suspended,now()); end if;
 next_deadline:=r.deadline_at;
 if review_decision='reject' then
  next_deadline:=case when correction_period='remaining' then now()+remaining*interval '1 second'
   when r.lifecycle_settings->>'period_days' is not null then now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours' else null end;
 end if;
 for choice in select value from jsonb_array_elements(file_decisions) loop
  update public.employee_document_submission_files set decision=choice->>'decision',note=coalesce(choice->>'note','') where submission_id=s.id and file_id=(choice->>'id')::uuid;
 end loop;
 update public.employee_document_submissions set state=case when review_decision='approve' then 'accepted' else 'rejected' end,
  reviewed_at=now(),reviewed_by=actor_user_id,rejection_reason=case when review_decision='reject' then btrim(review_reason) end where id=s.id;
 update public.employee_onboarding_requirements set
  approved_document_id=case when review_decision='approve' then s.id when approved_document_id=s.id then null else approved_document_id end,
  deadline_at=next_deadline,paused_remaining_seconds=null,
  document_suspended_at=case when review_decision='approve' then null else suspended end,
  status=case when review_decision='approve' then 'completed'::public.employee_onboarding_requirement_status else 'rejected'::public.employee_onboarding_requirement_status end,
  rejection_reason=case when review_decision='reject' then btrim(review_reason) end,
  lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.'||review_decision,
  jsonb_build_object('submission_id',s.id,'revision',expected_revision,'reason',review_reason,'correction_period',correction_period,'old_deadline',r.deadline_at,'new_deadline',next_deadline,'files',file_decisions));

 if review_decision='reject' and exists(select 1 from public.employee_document_submission_files where submission_id=s.id and decision='keep')
  and not exists(select 1 from public.employee_document_submissions where requirement_id=r.id and state='draft') then
  insert into public.employee_document_submissions(workspace_id,employee_id,requirement_id,user_id,version,state,expiry_date,metadata)
  select r.workspace_id,r.employee_id,r.id,r.lifecycle_user_id,coalesce(max(version),0)+1,'draft',s.expiry_date,s.metadata from public.employee_document_submissions where requirement_id=r.id returning id into correction_draft;
  insert into public.employee_document_submission_files(submission_id,file_id,requirement_id,workspace_id,employee_id,decision,note)
  select correction_draft,file_id,requirement_id,workspace_id,employee_id,'keep',note from public.employee_document_submission_files where submission_id=s.id and decision='keep';
 end if;
 perform app_private.document_sync_onboarding(r.id,actor_user_id); return expected_revision;
end;
$function$;

create or replace function public.set_employee_document_exemption_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_revision integer, make_exempt boolean, exemption_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'documents.review',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind='document' for update;
 if r.id is null then raise exception 'document unavailable' using errcode='P0002'; end if;
 return app_private.set_document_exemption(r,actor_user_id,make_exempt,exemption_reason,expected_revision);
end;
$function$;

create or replace function public.set_employee_document_timezone_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_employee_revision integer, reference_timezone text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; e public.employee_profiles%rowtype;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'employee.save',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 select * into r from public.employee_onboarding_requirements where workspace_id=target_workspace_id and id=target_requirement_id;
 if r.id is null then raise exception 'document unavailable' using errcode='P0002'; end if;
 select * into e from public.employee_profiles where id=r.employee_id and workspace_id=r.workspace_id for update;
 if e.revision is distinct from expected_employee_revision then raise exception 'employee changed; refresh required' using errcode='PT409'; end if;
 if not (e.is_remote or e.is_excluded_from_schedule) or exists(select 1 from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where a.workspace_id=e.workspace_id and a.employee_id=e.id and a.ended_at is null and a.is_primary)
 then raise exception 'the active primary location controls the document timezone' using errcode='22023'; end if;
 if reference_timezone is null or not (reference_timezone='UTC' or reference_timezone~'^[A-Za-z_]+/[A-Za-z0-9_+/-]+$') or not exists(select 1 from pg_catalog.pg_timezone_names where name=reference_timezone)
 then raise exception 'valid IANA timezone required' using errcode='22023'; end if;
 if e.document_timezone=reference_timezone then return e.revision; end if;
 update public.employee_profiles set document_timezone=reference_timezone,revision=revision+1,updated_at=now() where id=e.id returning revision into expected_employee_revision;
 perform app_private.document_audit(r,actor_user_id,'document.reference_timezone_changed',jsonb_build_object('previous',e.document_timezone,'timezone',reference_timezone,'employee_revision',expected_employee_revision));
 return expected_employee_revision;
end;
$function$;

create or replace function public.get_employee_document_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, self_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; submissions jsonb; history jsonb;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,case when self_only then 'documents.self' else 'documents.read' end,target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.kind in ('document','acknowledgement')));
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind in ('document','acknowledgement');
 if r.id is null or self_only is null or (self_only and r.lifecycle_user_id is distinct from actor_user_id)

 then raise exception 'document unavailable' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'state',s.state,'submitted_at',s.submitted_at,
  'reviewed_at',s.reviewed_at,'expiry_date',s.expiry_date,'metadata',s.metadata,'rejection_reason',s.rejection_reason,
  'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'filename',f.original_filename,'media_type',f.media_type,'size_bytes',f.size_bytes,'decision',sf.decision,'note',sf.note) order by f.created_at,f.id)
   from public.employee_document_submission_files sf join public.employee_documents f on f.id=sf.file_id where sf.submission_id=s.id),'[]')) order by s.version desc),'[]')
 into submissions from public.employee_document_submissions s where s.requirement_id=r.id and (self_only or s.state<>'draft');
 select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'occurred_at',ev.occurred_at,'metadata',ev.metadata) order by ev.occurred_at desc),'[]') into history
 from public.onboarding_events ev where ev.workspace_id=r.workspace_id and ev.employee_id=r.employee_id and ev.target_id=r.id::text;
 return jsonb_build_object('obligation',app_private.document_obligation_json(r),'submissions',submissions,'history',history,'policy',case when r.kind='acknowledgement' then jsonb_build_object('content_text',r.source_snapshot->>'content_text','content_digest',r.source_snapshot->>'content_digest','intent_statement',r.source_snapshot->>'intent_statement','can_withdraw',self_only and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and c.submitted_at is null and c.status='in_progress' and m.status='pending_activation' and r.lifecycle_retired_at is null),'history',coalesce((select jsonb_agg(jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'withdrawn_at',a.withdrawn_at,'content_digest',a.content_digest) order by a.executed_at,a.id) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and (not self_only or a.user_id=actor_user_id)),'[]'::jsonb),'evidence',(select jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'content_digest',a.content_digest,'intent_statement',a.intent_statement) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and a.withdrawn_at is null and (not self_only or a.user_id=actor_user_id))) end,'initial_deferral',jsonb_build_object('reason',r.conditional_reason,'allowed',self_only and r.kind='document' and r.lifecycle_settings->>'mode'='conditional' and r.submitted_document_id is null and not r.lifecycle_exempt and r.lifecycle_closed_at is null and not exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>'draft') and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and m.status='pending_activation')),'timezone_settings',(select jsonb_build_object('value',app_private.document_employee_timezone(r.workspace_id,r.employee_id),'configured_value',p.document_timezone,'employee_revision',p.revision,'can_manage',not self_only and (p.is_remote or p.is_excluded_from_schedule) and app_private.document_timezone_admin(actor_user_id,r.workspace_id,r.employee_id) and not exists(select 1 from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where a.workspace_id=r.workspace_id and a.employee_id=r.employee_id and a.ended_at is null and a.is_primary)) from public.employee_profiles p where p.id=r.employee_id));
end;
$function$;

create or replace function public.get_employee_document_lifecycle_path_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, target_submission_id uuid, target_file_id uuid, self_only boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare detail jsonb; path text;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,case when self_only then 'documents.self' else 'documents.read' end,target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.kind in ('document','acknowledgement')));
 detail:=public.get_employee_document_lifecycle_service(actor_user_id,target_workspace_id,target_requirement_id,self_only);
 select f.object_path into path from public.employee_document_submission_files sf
 join public.employee_document_submissions s on s.id=sf.submission_id join public.employee_documents f on f.id=sf.file_id
 where sf.requirement_id=target_requirement_id and sf.workspace_id=target_workspace_id and sf.submission_id=target_submission_id and sf.file_id=target_file_id and sf.decision='keep'
 and (self_only or s.state<>'draft');
 if path is null then raise exception 'document file unavailable' using errcode='P0002'; end if;
 return path;
end;
$function$;

create or replace function public.list_employee_document_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, self_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,case when self_only then 'documents.self' else 'documents.read' end,
  target_locations=>case when self_only then null else app_private.scope_set(actor_user_id,target_workspace_id,'documents.read') end);
 if self_only is null then raise exception 'document audience required' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(app_private.document_obligation_json(r) order by r.sort_order,r.id),'[]')
 from public.employee_onboarding_requirements r where r.workspace_id=target_workspace_id and r.kind in ('document','acknowledgement')
 and (not self_only or r.lifecycle_user_id=actor_user_id)
 and app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id));
end;
$function$;

create or replace function public.preview_employee_document_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, proposed_location_ids uuid[], proposed_job_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; d app_private.lifecycle_definition%rowtype; p public.employee_profiles%rowtype; m public.workspace_memberships%rowtype;
 result jsonb:='[]'; matching boolean; action text; readable boolean; approved boolean; next_deadline timestamptz;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'employee.save',target_person=>target_employee_id);
 select * into p from public.employee_profiles where id=target_employee_id and workspace_id=target_workspace_id;
 if p.id is null then raise exception 'employee unavailable' using errcode='P0002'; end if;
 if proposed_location_ids is null or proposed_job_ids is null or cardinality(proposed_location_ids)>100 or cardinality(proposed_job_ids)>100
  or exists(select 1 from unnest(proposed_location_ids) proposed(id) where proposed.id is null or not exists(select 1 from public.locations l where l.id=proposed.id and l.workspace_id=target_workspace_id and l.archived_at is null) or not proposed.id = any (app_private.scope_set(actor_user_id,target_workspace_id,'employee.save')))
  or exists(select 1 from unnest(proposed_job_ids) proposed(id) where proposed.id is null or not exists(select 1 from public.jobs j where j.id=proposed.id and j.workspace_id=target_workspace_id and j.archived_at is null))
 then raise exception 'Not allowed' using errcode='42501', hint='authz.out_of_scope', detail='employee.save'; end if;
 select * into m from public.workspace_memberships where workspace_id=target_workspace_id and user_id=p.user_id;
 if p.archived_at is not null or m.id is null or m.status not in ('active','pending_activation') then return result; end if;
 readable:=app_private.authz_reason(actor_user_id,target_workspace_id,'documents.read',null,target_employee_id) is null;
 for r in select * from public.employee_onboarding_requirements where workspace_id=target_workspace_id and employee_id=target_employee_id and kind in ('document','acknowledgement') and lifecycle_retired_at is null and source_id is not null and not lifecycle_exempt and not lifecycle_assignment_disabled loop
  matching:=app_private.document_target_matches_assignments(target_workspace_id,target_employee_id,r.lifecycle_settings->'target',proposed_location_ids,proposed_job_ids);
  action:=case when not matching and r.lifecycle_closed_at is null then 'remove' when matching and (r.lifecycle_closed_at is not null or r.status='superseded') then 'reopen' end;
  if action is null then continue; end if;
  next_deadline:=null;
  if action='reopen' then
   r.lifecycle_closed_at:=null; if r.status='superseded' then r.status:='not_started'; end if;
   approved:=app_private.document_obligation_state(r,now())='completed';
   if not approved and m.status='active' and r.lifecycle_settings->>'mode'<>'optional' then next_deadline:=now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours'; end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('title',case when readable then r.title else 'Document requirement' end,'action',action,'deadline_at',next_deadline,'period_days',(r.lifecycle_settings->>'period_days')::integer,'clears_block',action='remove' and app_private.document_obligation_blocked(r,now())));
 end loop;
 for d in select * from app_private.lifecycle_definition q where q.workspace_id=target_workspace_id and q.archived_at is null and q.current_version
  and (m.status='pending_activation' or q.lifecycle_settings->>'assignment_scope'='all_active')
  and app_private.document_target_matches_assignments(target_workspace_id,target_employee_id,q.lifecycle_settings->'target',proposed_location_ids,proposed_job_ids)
  and not exists(select 1 from public.employee_onboarding_requirements existing_req where existing_req.workspace_id=target_workspace_id and existing_req.employee_id=target_employee_id and existing_req.kind::text=q.kind and existing_req.source_id=q.id and existing_req.lifecycle_retired_at is null) loop
  next_deadline:=case when m.status='active' and d.lifecycle_settings->>'mode'<>'optional' then now()+(d.lifecycle_settings->>'period_days')::integer*interval '24 hours' end;
  result:=result||jsonb_build_array(jsonb_build_object('title',case when readable then d.title else 'Document requirement' end,'action','assign','deadline_at',next_deadline,'period_days',(d.lifecycle_settings->>'period_days')::integer,'clears_block',false));
 end loop;
 return result;
end;
$function$;

create or replace function public.acknowledge_document_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_revision integer, signer_name text, expected_content_digest text, authenticated_timestamp timestamp with time zone, request_idempotency_key uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; c public.employee_onboarding_cases%rowtype; evidence public.employee_acknowledgement_envelopes%rowtype; employee_name text;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'documents.self',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 select c0.* into c from public.employee_onboarding_cases c0 join public.employee_onboarding_requirements q on q.case_id=c0.id
 where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.lifecycle_user_id=actor_user_id for update of c0;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id for update;
 if c.id is null or r.kind<>'acknowledgement' or r.lifecycle_user_id is distinct from actor_user_id
  or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'policy unavailable' using errcode='P0002'; end if;
 select * into evidence from public.employee_acknowledgement_envelopes where workspace_id=target_workspace_id and idempotency_key=request_idempotency_key;
 if evidence.id is not null then if evidence.withdrawn_at is not null then raise exception 'acknowledgement was withdrawn; use a new request' using errcode='PT409'; end if;
  if evidence.requirement_id<>r.id or evidence.user_id<>actor_user_id or evidence.content_digest is distinct from expected_content_digest or evidence.typed_name is distinct from btrim(signer_name)
  then raise exception 'acknowledgement request changed' using errcode='PT409'; end if;
  return r.lifecycle_revision;
 end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'policy changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.status='superseded' then raise exception 'policy request is closed' using errcode='22023'; end if;
 select concat_ws(' ',first_name,last_name) into employee_name from public.employee_profiles where id=r.employee_id and workspace_id=r.workspace_id;
 if expected_content_digest is null or r.source_snapshot->>'content_digest' is distinct from expected_content_digest
  or signer_name is null or lower(regexp_replace(btrim(signer_name),'\s+',' ','g'))<>lower(regexp_replace(btrim(employee_name),'\s+',' ','g'))
  or request_idempotency_key is null or authenticated_timestamp is null or authenticated_timestamp<now()-interval '30 minutes' or authenticated_timestamp>now()+interval '1 minute'
 then raise exception 'current content, matching full name and recent sign-in required' using errcode='22023'; end if;
 if exists(select 1 from public.employee_acknowledgement_envelopes where requirement_id=r.id and withdrawn_at is null) then raise exception 'policy already acknowledged; refresh required' using errcode='PT409'; end if;
 insert into public.employee_acknowledgement_envelopes(workspace_id,employee_id,case_id,requirement_id,template_version_id,content_digest,intent_statement,typed_name,user_id,membership_id,authenticated_at,idempotency_key)
 values(r.workspace_id,r.employee_id,r.case_id,r.id,r.source_id,expected_content_digest,r.source_snapshot->>'intent_statement',btrim(signer_name),actor_user_id,c.membership_id,authenticated_timestamp,request_idempotency_key);
 update public.employee_onboarding_requirements set status='completed',completed_at=now(),deadline_at=null,paused_remaining_seconds=null,document_suspended_at=null,
  rejection_reason=null,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.policy_acknowledged',jsonb_build_object('content_digest',expected_content_digest,'evidence_schema_version','acknowledgement:v1','revision',expected_revision));
 perform app_private.document_sync_onboarding(r.id,actor_user_id);
 return expected_revision;
end;
$function$;

create or replace function public.withdraw_document_acknowledgement_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_revision integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; c public.employee_onboarding_cases%rowtype; evidence_id uuid;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'documents.self',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 select c0.* into c from public.employee_onboarding_cases c0 join public.employee_onboarding_requirements q on q.case_id=c0.id
 where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.lifecycle_user_id=actor_user_id for update of c0;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id for update;
 if c.id is null or r.kind<>'acknowledgement' or r.lifecycle_user_id is distinct from actor_user_id
  or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'policy unavailable' using errcode='P0002'; end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'policy changed; refresh required' using errcode='PT409'; end if;
 if c.submitted_at is not null or c.status<>'in_progress' or r.lifecycle_retired_at is not null
  or not exists(select 1 from public.workspace_memberships where id=c.membership_id and user_id=actor_user_id and status='pending_activation')
 then raise exception 'acknowledgement can only be withdrawn before first onboarding Submit' using errcode='22023'; end if;
 update public.employee_acknowledgement_envelopes set withdrawn_at=now() where requirement_id=r.id and user_id=actor_user_id and withdrawn_at is null returning id into evidence_id;
 if evidence_id is null then raise exception 'current acknowledgement unavailable' using errcode='PT409'; end if;
 update public.employee_onboarding_requirements set status='not_started',completed_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.policy_withdrawn',jsonb_build_object('evidence_id',evidence_id,'revision',expected_revision));
 perform app_private.document_sync_onboarding(r.id,actor_user_id);
 return expected_revision;
end;
$function$;

create or replace function public.remove_employee_document_draft_file_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_revision integer, target_submission_id uuid, target_file_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'documents.self',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind='document' for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 perform app_private.assert_document_published(r);
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.lifecycle_retired_at is not null then raise exception 'document request is closed' using errcode='22023'; end if;
 if not exists(select 1 from public.employee_document_submissions where id=target_submission_id and requirement_id=r.id and user_id=actor_user_id and state='draft') then raise exception 'draft unavailable' using errcode='PT409'; end if;
 delete from public.employee_document_submission_files where submission_id=target_submission_id and file_id=target_file_id and requirement_id=r.id;
 if not found then raise exception 'draft file unavailable' using errcode='P0002'; end if;
 update public.employee_onboarding_requirements set lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.draft_file_removed',jsonb_build_object('submission_id',target_submission_id,'file_id',target_file_id,'revision',expected_revision));
 return expected_revision;
end;
$function$;

create or replace function public.defer_initial_employee_document_service(actor_user_id uuid, target_requirement_id uuid, expected_revision integer, deferral_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype;
begin
 perform app_private.authorize(actor_user_id,(select q.workspace_id from public.employee_onboarding_requirements q where q.id=target_requirement_id),'documents.self',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id));
 perform 1 from public.employee_onboarding_cases c join public.employee_onboarding_requirements q on q.case_id=c.id
 where q.id=target_requirement_id and q.lifecycle_user_id=actor_user_id for update of c;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 perform app_private.assert_document_published(r);
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.kind<>'document' or r.lifecycle_settings->>'mode'<>'conditional' or r.lifecycle_closed_at is not null or r.lifecycle_exempt
  or r.submitted_document_id is not null or exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>'draft')
  or not exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and m.status='pending_activation')
 then raise exception 'only an initial conditional document can be deferred' using errcode='22023'; end if;
 if nullif(btrim(deferral_reason),'') is null or char_length(deferral_reason)>500 then raise exception 'a short reason is required' using errcode='22023'; end if;
 update public.employee_onboarding_requirements set conditional_reason=btrim(deferral_reason),lifecycle_revision=lifecycle_revision+1,updated_at=now()
 where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.initial_deferred',jsonb_build_object('reason',btrim(deferral_reason),'revision',expected_revision));
 perform app_private.document_sync_onboarding(r.id,actor_user_id);
 return expected_revision;
end;
$function$;

create or replace function public.get_employee_document_access_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'documents.self');
 return jsonb_build_object('restricted',app_private.document_actor_blocked(actor_user_id,target_workspace_id));
end;
$function$;

create or replace function public.save_employee_document_draft_file_service(actor_user_id uuid, target_requirement_id uuid, expected_revision integer, storage_object_path text, upload_filename text, upload_media_type text, upload_size_bytes bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; s public.employee_document_submissions%rowtype; file_id uuid; next_version integer; format text;
begin
 perform app_private.authorize(actor_user_id,(select q.workspace_id from public.employee_onboarding_requirements q where q.id=target_requirement_id),'documents.self',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id));
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and kind='document' for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 perform app_private.assert_document_published(r);
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or (r.lifecycle_exempt and not r.owner_excused) or r.status='superseded' then raise exception 'document obligation is closed' using errcode='22023'; end if;
 format:=case upload_media_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpeg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
 if format is null or not coalesce(r.source_snapshot->'accepted_formats' ? format,false)
  or upload_size_bytes is null or upload_size_bytes not between 1 and 10485760
  or nullif(btrim(upload_filename),'') is null or char_length(upload_filename)>240
  or not app_private.is_employee_onboarding_document_path(storage_object_path,r.workspace_id,r.employee_id,r.id)
 then raise exception 'invalid private document upload' using errcode='22023'; end if;
 select * into s from public.employee_document_submissions where requirement_id=r.id and state='draft' for update;
 if s.id is null then
  select coalesce(max(version),0)+1 into next_version from public.employee_document_submissions where requirement_id=r.id;
  insert into public.employee_document_submissions(workspace_id,employee_id,requirement_id,user_id,version,state)
   values(r.workspace_id,r.employee_id,r.id,actor_user_id,next_version,'draft') returning * into s;
 end if;
 select coalesce(max(version_number),0)+1 into next_version from public.employee_documents where requirement_id=r.id;
 insert into public.employee_documents(workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,uploaded_by)
 values(r.workspace_id,r.employee_id,r.id,next_version,storage_object_path,upload_filename,upload_media_type,upload_size_bytes,'superseded',actor_user_id) returning id into file_id;
 insert into public.employee_document_submission_files(submission_id,file_id,requirement_id,workspace_id,employee_id) values(s.id,file_id,r.id,r.workspace_id,r.employee_id);
 update public.employee_onboarding_requirements set lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.draft_file_added',jsonb_build_object('submission_id',s.id,'file_id',file_id,'revision',expected_revision));
 return expected_revision;
end;
$function$;

create or replace function public.submit_employee_document_lifecycle_service(actor_user_id uuid, target_requirement_id uuid, expected_revision integer, target_submission_id uuid, submission_expiry date, submission_metadata jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; s public.employee_document_submissions%rowtype; field jsonb; next_state text;
begin
 perform app_private.authorize(actor_user_id,(select q.workspace_id from public.employee_onboarding_requirements q where q.id=target_requirement_id),'documents.self',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id));
 perform 1 from public.employee_onboarding_cases c join public.employee_onboarding_requirements q on q.case_id=c.id where q.id=target_requirement_id and app_private.document_actor_can_read(actor_user_id,q.workspace_id,q.employee_id,q.lifecycle_user_id) for update of c;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 perform app_private.assert_document_published(r);
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or (r.lifecycle_exempt and not r.owner_excused) or r.status='superseded' then raise exception 'document obligation is closed' using errcode='22023'; end if;
 select * into s from public.employee_document_submissions where id=target_submission_id and requirement_id=r.id and user_id=actor_user_id and state='draft' for update;
 if s.id is null or not exists(select 1 from public.employee_document_submission_files where submission_id=s.id and decision='keep') then raise exception 'a draft with retained files is required' using errcode='22023'; end if;
 if coalesce((r.source_snapshot->>'tracks_expiry')::boolean,false) and submission_expiry is null then raise exception 'expiration date required' using errcode='22023'; end if;
 if submission_expiry is not null and app_private.document_employee_timezone(r.workspace_id,r.employee_id) is null then raise exception 'Document timezone needs administrator configuration' using errcode='22023'; end if; if submission_expiry < (now() at time zone app_private.document_employee_timezone(r.workspace_id,r.employee_id))::date then raise exception 'expired documents cannot be submitted' using errcode='22023'; end if;
 if submission_metadata is null or jsonb_typeof(submission_metadata)<>'object' then raise exception 'document metadata required' using errcode='22023'; end if;
 for field in select value from jsonb_array_elements(coalesce(r.lifecycle_settings->'extra_fields','[]')) loop
  if (field->>'required')::boolean and nullif(btrim(submission_metadata->>(field->>'key')),'') is null then raise exception 'required document field missing' using errcode='22023'; end if;
  if nullif(submission_metadata->>(field->>'key'),'') is not null then
   if field->>'kind'='date' then perform (submission_metadata->>(field->>'key'))::date;
   elsif field->>'kind'='number' then perform (submission_metadata->>(field->>'key'))::numeric; end if;
  end if;
 end loop;
 -- Materialize overdue state before submission; cron delays cannot reopen access.
 if app_private.document_obligation_blocked(r,now()) then r.document_suspended_at:=coalesce(r.document_suspended_at,now()); end if;
 next_state:=case when r.requires_review and not r.owner_excused then 'pending_review' else 'accepted' end;
 update public.employee_document_submissions set state='superseded' where id=r.submitted_document_id and state='pending_review';
 update public.employee_document_submissions set state=next_state,submitted_at=now(),expiry_date=submission_expiry,metadata=submission_metadata,
  reviewed_at=case when next_state='accepted' then now() end where id=s.id;
 update public.employee_onboarding_requirements set submitted_document_id=s.id,
  approved_document_id=case when next_state='accepted' then s.id else approved_document_id end,
  paused_remaining_seconds=case when r.paused_remaining_seconds is not null then r.paused_remaining_seconds when deadline_at is not null then greatest(0,extract(epoch from deadline_at-now())) end,
  document_suspended_at=case when next_state='accepted' then null else r.document_suspended_at end,
  status=case when next_state='accepted' then 'completed'::public.employee_onboarding_requirement_status else 'awaiting_review'::public.employee_onboarding_requirement_status end,
  rejection_reason=null,conditional_reason=null,lifecycle_revision=lifecycle_revision+1,updated_at=now()
 where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.submitted',jsonb_build_object('submission_id',s.id,'revision',expected_revision,'state',next_state));
 perform app_private.document_sync_onboarding(r.id,actor_user_id); return expected_revision;
end;
$function$;

create or replace function public.initialize_employee_onboarding_service(target_user_id uuid, target_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  onboarding_case_id uuid;
  should_snapshot_requirements boolean;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, false), 'onboarding.self');
  select profile.*
  into employee
  from public.employee_profiles profile
  join public.workspace_memberships candidate
    on candidate.workspace_id = profile.workspace_id
   and candidate.user_id = profile.user_id
  where profile.user_id = target_user_id
    and profile.archived_at is null
    and candidate.status in ('pending_activation', 'active')
    and (target_workspace_id is null or profile.workspace_id = target_workspace_id)
  order by candidate.created_at
  limit 1;

  if employee.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;

  select *
  into membership
  from public.workspace_memberships
  where workspace_id = employee.workspace_id
    and user_id = target_user_id
    and status in ('pending_activation', 'active')
  order by created_at
  limit 1;

  insert into public.employee_onboarding_cases (workspace_id, employee_id, membership_id)
  values (employee.workspace_id, employee.id, membership.id)
  on conflict (employee_id) do update
    set membership_id = excluded.membership_id,
        updated_at = public.employee_onboarding_cases.updated_at
  returning id into onboarding_case_id;

  should_snapshot_requirements := not exists (
    select 1
    from public.employee_onboarding_requirements requirement
    where requirement.case_id = onboarding_case_id and requirement.lifecycle_retired_at is null
  );

  if should_snapshot_requirements then
    insert into public.employee_onboarding_requirements (
      workspace_id, case_id, employee_id, kind, title, description,
      required, blocks_activation, requires_review, sort_order, source_snapshot
    ) values
      (employee.workspace_id, onboarding_case_id, employee.id, 'profile', 'Profile and privacy', 'Private contact, identity, and teammate visibility choices.', true, true, false, 10, '{}'::jsonb),
      (employee.workspace_id, onboarding_case_id, employee.id, 'availability', 'Availability', 'Confirmed recurring weekly availability.', false, false, false, 500, '{}'::jsonb)
    on conflict (case_id, kind, source_id) where lifecycle_retired_at is null do nothing;

    insert into public.employee_onboarding_requirements (
      workspace_id, case_id, employee_id, kind, source_id, title, description,
      required, blocks_activation, requires_review, sort_order, source_snapshot
    )
    select employee.workspace_id, onboarding_case_id, employee.id, 'document', document.id,
      document.title, document.description, true,
      true, document.requires_review,
      100 + document.sort_order,
      jsonb_build_object(
        'document_type_id', document.id,
        'accepted_formats', document.accepted_formats,
        'tracks_expiry', document.tracks_expiry,
        'requires_review', document.requires_review
      )
    from public.document_types document
    where document.workspace_id = employee.workspace_id
      and membership.status='pending_activation' and app_private.document_target_matches(employee.workspace_id,employee.id,document.lifecycle_settings->'target')
      and document.archived_at is null
    on conflict (case_id, kind, source_id) where lifecycle_retired_at is null do nothing;

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
      and membership.status='pending_activation' and app_private.document_target_matches(employee.workspace_id,employee.id,app_private.policy_lifecycle_settings(version)->'target')
      and template.archived_at is null
      and not exists (
        select 1
        from public.signature_template_versions newer
        where newer.template_id = version.template_id
          and newer.status = 'published'
          and newer.version_number > version.version_number
      )
    on conflict (case_id, kind, source_id) where lifecycle_retired_at is null do nothing;
  end if;

  if not exists (
    select 1
    from public.onboarding_events event
    where event.case_id = onboarding_case_id
      and event.action in ('onboarding.started', 'onboarding.rehire_started')
  ) then
    insert into public.onboarding_events (
      workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
    ) values (
      employee.workspace_id, employee.id, onboarding_case_id, target_user_id,
      'onboarding.started', 'onboarding_case', onboarding_case_id::text
    );
  end if;

  return onboarding_case_id;
end;
$function$;

create or replace function public.get_employee_onboarding_service(target_user_id uuid, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  profile jsonb;
  requirements jsonb;
  completed_count integer;
  total_count integer;
  first_path text;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, false), 'onboarding.self');
  perform public.initialize_employee_onboarding_service(target_user_id, target_workspace_id);
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id);
  if target_case.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
  select * into employee from public.employee_profiles where id = target_case.employee_id;
  select * into membership from public.workspace_memberships where id = target_case.membership_id;

  select to_jsonb(private_profile) - 'created_at' - 'updated_at' - 'employee_id' - 'workspace_id'
  into profile from public.employee_private_profiles private_profile
  where private_profile.employee_id = employee.id;
  profile := coalesce(
    profile,
    jsonb_build_object(
      'legal_first_name', employee.first_name,
      'legal_last_name', employee.last_name
    )
  );


  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id,
    'kind', requirement.kind,
    'title', requirement.title,
    'description', requirement.description,
    'status', requirement.status,
    'required', requirement.required,'document_mode',requirement.lifecycle_settings->>'mode', 'conditional_reason',requirement.conditional_reason,
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
  count(*) filter (where requirement.required or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional')),
  count(*) filter (where (requirement.required and requirement.status in ('completed', 'awaiting_review')) or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional' and not app_private.document_initial_action_missing(requirement)))
  into requirements, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null and (requirement.kind<>'document' or (not requirement.lifecycle_exempt and requirement.lifecycle_closed_at is null));

  select case requirement.kind
    when 'profile' then '/welcome/profile'
    when 'ssn' then '/welcome/review'
    when 'document' then '/welcome/documents/' || requirement.id
    when 'acknowledgement' then '/welcome/acknowledgements/' || requirement.id
    when 'availability' then '/welcome/availability'
  end into first_path
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id
    and (requirement.required or app_private.document_initial_action_missing(requirement))
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
    'employee_name', concat_ws(' ', employee.first_name, employee.last_name),
    'membership_id', membership.id,
    'membership_status', membership.status,
    'case_status', target_case.status,
    'revision', target_case.revision,
    'progress_completed', completed_count,
    'progress_total', total_count,
    'first_actionable_path', first_path,
    'ssn_status', jsonb_build_object(
      'present', false,
      'last_four', null
    ),
    'profile', profile,
    'assignments', jsonb_build_object(
      'locations', coalesce((select jsonb_agg(location.name order by assignment.is_primary desc, location.name)
        from public.employee_location_assignments assignment join public.locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
      'jobs', coalesce((select jsonb_agg(job.name order by assignment.is_primary desc, lower(job.name), job.id)
        from public.employee_job_assignments assignment join public.jobs job on job.id = assignment.job_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb)
    ),
    'requirements', requirements
  );
end;
$function$;

create or replace function public.save_employee_onboarding_profile_service(target_user_id uuid, profile_payload jsonb, expected_revision integer, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  normalized_country_code text := nullif(upper(btrim(coalesce(profile_payload->>'country_code', ''))), '');
  normalized_birth_date text := nullif(btrim(coalesce(profile_payload->>'date_of_birth', '')), '');
  submitted_phone text := nullif(btrim(coalesce(profile_payload->>'phone', '')), '');
  emergency_email text := btrim(coalesce(profile_payload->>'emergency_contact_email', ''));
  account_phone text;
  legal_name_changed boolean;
  next_requirement_status public.employee_onboarding_requirement_status;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if target_case.status in ('submitted', 'approved', 'cancelled') then raise exception 'onboarding cannot be edited' using errcode = '22023'; end if;

  select * into employee
  from public.employee_profiles
  where id = target_case.employee_id
  for update;

  select profile.phone_e164 into account_phone
  from public.user_profiles profile
  where profile.user_id = target_user_id;

  if coalesce(profile_payload->>'legal_first_name', '') = ''
    or coalesce(profile_payload->>'legal_last_name', '') = ''
    or coalesce(account_phone, submitted_phone) is null
    or coalesce(profile_payload->>'emergency_contact_name', '') = ''
    or coalesce(profile_payload->>'emergency_contact_relationship', '') = ''
    or coalesce(profile_payload->>'emergency_contact_phone', '') = ''
    or (emergency_email <> '' and emergency_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    or (normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$')
    or (normalized_birth_date is not null and normalized_birth_date !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'complete private profile required' using errcode = '22023';
  end if;

  -- The account is the phone's only source. An empty account takes the number
  -- typed here; a filled one keeps its own. The record copies the account.
  account_phone := app_private.adopt_account_phone(
    target_user_id, submitted_phone, btrim(employee.first_name || ' ' || employee.last_name)
  );

  legal_name_changed :=
    lower(btrim(profile_payload->>'legal_first_name')) is distinct from lower(btrim(employee.first_name))
    or lower(btrim(profile_payload->>'legal_last_name')) is distinct from lower(btrim(employee.last_name));
  next_requirement_status := case
    when legal_name_changed then 'awaiting_review'::public.employee_onboarding_requirement_status
    else 'completed'::public.employee_onboarding_requirement_status
  end;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name,
    phone, street_address, city, region, postal_code, country_code, date_of_birth,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    emergency_contact_email, share_phone_with_teammates, share_email_with_teammates
  ) values (
    target_case.employee_id, target_case.workspace_id,
    btrim(profile_payload->>'legal_first_name'),
    left(btrim(coalesce(profile_payload->>'legal_middle_name', '')), 80),
    btrim(profile_payload->>'legal_last_name'),
    left(btrim(coalesce(profile_payload->>'preferred_name', '')), 80),
    account_phone,
    nullif(btrim(coalesce(profile_payload->>'street_address', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'city', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'region', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'postal_code', '')), ''),
    normalized_country_code,
    normalized_birth_date::date,
    btrim(profile_payload->>'emergency_contact_name'),
    btrim(profile_payload->>'emergency_contact_relationship'),
    btrim(profile_payload->>'emergency_contact_phone'),
    emergency_email,
    coalesce((profile_payload->>'share_phone_with_teammates')::boolean, false),
    coalesce((profile_payload->>'share_email_with_teammates')::boolean, false)
  ) on conflict (employee_id) do update set
    legal_first_name = excluded.legal_first_name,
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    -- It was forced empty while the field was closed. The person answers it
    -- now, and leaving it blank is a valid answer.
    preferred_name = excluded.preferred_name,
    -- The account's number, same as the trigger writes; never the form's.
    phone = excluded.phone,
    street_address = excluded.street_address,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code,
    date_of_birth = excluded.date_of_birth,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_relationship = excluded.emergency_contact_relationship,
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_email = excluded.emergency_contact_email,
    share_phone_with_teammates = excluded.share_phone_with_teammates,
    share_email_with_teammates = excluded.share_email_with_teammates,
    updated_at = now();

  update public.employee_onboarding_requirements set
    status = next_requirement_status,
    requires_review = legal_name_changed,
    rejection_reason = null,
    reviewed_by = null,
    reviewed_at = null,
    completed_at = case when legal_name_changed then null else now() end,
    updated_at = now()
  where case_id = target_case.id and kind = 'profile'::public.employee_onboarding_requirement_kind;

  update public.employee_onboarding_cases set status = 'in_progress'::public.employee_onboarding_case_status, revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.profile_saved', 'onboarding_case', target_case.id::text,
    jsonb_build_object('legal_name_review_required', legal_name_changed));
  return expected_revision;
end;
$function$;

create or replace function public.submit_employee_onboarding_service(target_user_id uuid, expected_revision integer, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;

  if target_case.id is null or target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = '40001';
  end if;
  if exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_initial_action_missing(r)) then raise exception 'Submit conditional documents or give an initial reason' using errcode='23514'; end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and (kind<>'document' or (not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
      and status not in (
        'completed'::public.employee_onboarding_requirement_status,
        'awaiting_review'::public.employee_onboarding_requirement_status
      )
  ) then
    raise exception 'required onboarding items remain incomplete' using errcode = '23514';
  end if;

  update public.employee_onboarding_cases
  set status = 'submitted'::public.employee_onboarding_case_status,
      submitted_at = now(),
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning * into target_case;

  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id)
  values (
    target_case.workspace_id,
    target_case.employee_id,
    target_case.id,
    target_user_id,
    'onboarding.submitted',
    'onboarding_case',
    target_case.id::text
  );

  if not exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_activation_blocked(r)) and not target_case.final_approval_required
    and not exists (
      select 1
      from public.employee_onboarding_requirements
      where case_id = target_case.id
        and (kind<>'document' or (not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
        and blocks_activation
        and status <> 'completed'::public.employee_onboarding_requirement_status
    ) then
    return app_private.activate_employee_onboarding_case(
      target_case.id,
      target_user_id,
      'employee.auto_activated'
    );
  end if;

  return target_case.revision;
end;
$function$;

create or replace function public.leave_employee_onboarding_service(target_user_id uuid, expected_revision integer, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  target_membership public.workspace_memberships%rowtype;
begin
  perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;

  if target_case.id is null then
    raise exception 'onboarding unavailable' using errcode = 'P0002';
  end if;
  if target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = '40001';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.id = target_case.membership_id
    and membership.workspace_id = target_case.workspace_id
    and membership.user_id = target_user_id
  for update;

  if target_membership.id is null then
    raise exception 'workspace membership unavailable' using errcode = 'P0002';
  end if;
  if target_membership.status = 'active'::public.membership_status then
    raise exception 'active employees cannot leave onboarding' using errcode = '23514';
  end if;
  if target_membership.status <> 'pending_activation'::public.membership_status then
    raise exception 'pending onboarding membership required' using errcode = '23514';
  end if;
  if target_case.status = 'approved'::public.employee_onboarding_case_status then
    raise exception 'approved onboarding cannot be cancelled' using errcode = '22023';
  end if;

  perform set_config('app.workspace_closure', 'on', true);

  update public.workspace_memberships
  set status = 'suspended'::public.membership_status,
      updated_at = now()
  where id = target_membership.id
    and workspace_id = target_case.workspace_id;

  update public.employee_onboarding_cases
  set status = 'cancelled'::public.employee_onboarding_case_status,
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning * into target_case;

  insert into public.onboarding_events (
    workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
  ) values (
    target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.left', 'onboarding_case', target_case.id::text
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_case.workspace_id, target_user_id, 'employee_onboarding.left',
    'workspace_membership', target_membership.id::text,
    jsonb_build_object('employee_id', target_case.employee_id, 'case_id', target_case.id)
  );

  return jsonb_build_object(
    'status', 'left',
    'workspace_id', target_case.workspace_id,
    'employee_id', target_case.employee_id,
    'membership_id', target_membership.id,
    'revision', target_case.revision
  );
end;
$function$;

create or replace function public.get_employee_onboarding_review_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target_employee_id);
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
  ) order by requirement.sort_order) filter (where requirement.kind <> 'document' or app_private.authz_reason(actor_user_id, target_workspace_id, 'documents.read', null, target_employee_id) is null), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null;
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$function$;

create or replace function public.review_employee_onboarding_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, review_action text, target_requirement_id uuid, review_reason text, expected_revision integer, production_ready boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);
 perform public.get_employee_onboarding_review_service(actor_user_id,target_workspace_id,target_employee_id);
 if review_action in ('accept_requirement','reject_requirement') and exists (
  select 1 from public.employee_onboarding_requirements r where r.id=target_requirement_id
   and r.workspace_id=target_workspace_id and r.employee_id=target_employee_id and r.kind='availability'
 ) then raise exception 'Weekly availability is confirmed by the employee and does not require review' using errcode='22023'; end if;
 if exists(select 1 from public.employee_onboarding_requirements r where r.id=target_requirement_id and r.kind='document') then raise exception 'Review the submitted document version in Documents' using errcode='PT409'; end if;
 return public.review_employee_onboarding_before_availability_service(actor_user_id,target_workspace_id,target_employee_id,
  review_action,target_requirement_id,review_reason,expected_revision,production_ready);
end; $function$;

create or replace function public.review_employee_onboarding_before_availability_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, review_action text, target_requirement_id uuid, review_reason text, expected_revision integer, production_ready boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  private_profile public.employee_private_profiles%rowtype;
  target_employee_user_id uuid;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.workspace_id = target_workspace_id
    and onboarding.employee_id = target_employee_id
  for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  select employee.user_id into target_employee_user_id
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      perform app_private.authorize(actor_user_id, target_workspace_id, 'documents.review', target_person => target_employee_id);
    end if;
    -- Who approves a legal name typed in onboarding waits for Mert (FB-6.6 S1);
    -- until then it stays with whoever holds employees.private.manage.
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind
      and not (select state.class = 'owner' or 'employees.private.manage' = any (state.permissions)
               from app_private.actor(actor_user_id, target_workspace_id) state) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.missing_permission', detail = 'onboarding.review';
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
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      completed_at = case when review_action = 'accept_requirement' then now() else null end,
      updated_at = now()
    where id = requirement.id;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      update public.employee_documents set
        review_status = case
          when review_action = 'accept_requirement' then 'accepted'::public.employee_document_review_status
          else 'rejected'::public.employee_document_review_status
        end,
        rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
        reviewed_by = actor_user_id, reviewed_at = now()
      where requirement_id = requirement.id and review_status = 'awaiting_review'::public.employee_document_review_status;
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and review_action = 'accept_requirement' then
      select * into private_profile
      from public.employee_private_profiles
      where employee_id = target_employee_id;
      if private_profile.employee_id is null then
        raise exception 'private profile unavailable' using errcode = 'P0002';
      end if;
      update public.employee_profiles set
        first_name = private_profile.legal_first_name,
        last_name = private_profile.legal_last_name,
        revision = revision + 1,
        updated_at = now()
      where id = target_employee_id;
      insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
      values (target_workspace_id, target_employee_id, actor_user_id,
        'employee.legal_name_approved', 'Employee legal name change approved from onboarding');
    end if;
    if review_action = 'reject_requirement' then
      update public.employee_onboarding_cases set status = 'changes_requested'::public.employee_onboarding_case_status, revision = revision + 1,
        updated_at = now() where id = target_case.id returning revision into expected_revision;
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
      if target_case.status = 'submitted'::public.employee_onboarding_case_status
        and not public.employee_onboarding_final_approval_required(target_workspace_id)
        and not exists (
          select 1
          from public.employee_onboarding_requirements
          where case_id = target_case.id
            and required
            and blocks_activation
            and status <> 'completed'::public.employee_onboarding_requirement_status
        ) then
        expected_revision := app_private.activate_employee_onboarding_case(
          target_case.id,
          actor_user_id,
          'employee.auto_activated_after_review'
        );
      end if;
    end if;
  elsif review_action = 'activate' then
    if target_case.status <> 'submitted'::public.employee_onboarding_case_status then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed'::public.employee_onboarding_requirement_status) then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    expected_revision := app_private.activate_employee_onboarding_case(
      target_case.id,
      actor_user_id,
      'employee.activated'
    );
  else
    raise exception 'unsupported onboarding review action' using errcode = '22023';
  end if;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.' || review_action, 'onboarding_case', target_case.id::text,
    jsonb_build_object('requirement_id', target_requirement_id, 'reason_present', nullif(btrim(coalesce(review_reason, '')), '') is not null));
  return expected_revision;
end;
$function$;

-- Activation is what an authorized review or the employee's own last step leads to,
-- never an entry point of its own (BL-133).
create function app_private.activate_employee_onboarding_case(target_case_id uuid, actor_user_id uuid, event_action text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  next_revision integer;
begin
  select * into target_case
  from public.employee_onboarding_cases
  where id = target_case_id
  for update;

  if target_case.id is null then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  if exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_activation_blocked(r)) then raise exception 'Submit conditional documents or give an initial reason' using errcode='23514'; end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and (kind<>'document' or (publication_paused_at is null and not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
      and blocks_activation
      and status <> 'completed'::public.employee_onboarding_requirement_status
  ) then
    raise exception 'activation-blocking requirements remain' using errcode = '23514';
  end if;

  perform set_config('app.membership_change', target_case.membership_id::text, true);
  update public.workspace_memberships
  set status = 'active', updated_at = now()
  where id = target_case.membership_id and status = 'pending_activation';
  if not found then
    raise exception 'pending membership unavailable' using errcode = '23514';
  end if;

  update public.employee_onboarding_cases
  set status = 'approved'::public.employee_onboarding_case_status,
      approved_by = actor_user_id,
      approved_at = now(),
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning revision into next_revision;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_case.workspace_id,
    target_case.employee_id,
    actor_user_id,
    event_action,
    'Employee onboarding approved and workspace access activated'
  );

  return next_revision;
end;
$function$;

create or replace function app_private.document_sync_onboarding(target_requirement_id uuid, actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; c public.employee_onboarding_cases%rowtype;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id;
 update public.employee_documents f set review_status=case
  when sf.decision='discard' then 'superseded'::public.employee_document_review_status
  when s.id=r.approved_document_id and s.state='accepted' then 'accepted'::public.employee_document_review_status
  when s.id=r.submitted_document_id and s.state='pending_review' then 'awaiting_review'::public.employee_document_review_status
  when s.id=r.submitted_document_id and s.state='rejected' then 'rejected'::public.employee_document_review_status
  else 'superseded'::public.employee_document_review_status end, expiry_date=s.expiry_date
 from public.employee_document_submission_files sf join public.employee_document_submissions s on s.id=sf.submission_id
 where sf.file_id=f.id and s.requirement_id=r.id;
 if app_private.document_obligation_state(r,now())='completed' then
  update public.employee_onboarding_requirements set status='completed' where id=r.id and status<>'completed';
 end if;
 select c0.* into c from public.employee_onboarding_cases c0 join public.workspace_memberships m on m.id=c0.membership_id
 where c0.id=r.case_id and m.status='pending_activation' for update of c0;
 if c.id is null then return; end if;
 if r.kind='document' and r.lifecycle_settings->>'mode' in ('required','conditional') and r.status='rejected' and app_private.document_obligation_state(r,now())<>'completed' then c.status:='changes_requested'; end if; update public.employee_onboarding_cases set status=c.status,revision=revision+1,updated_at=now() where id=c.id;
 if c.status='submitted' and not c.final_approval_required
  and not exists(select 1 from public.employee_onboarding_requirements q where q.case_id=c.id and
   (app_private.document_activation_blocked(q) or (q.required and q.blocks_activation and q.status<>'completed' and
    (q.kind<>'document' or (q.publication_paused_at is null and not q.lifecycle_exempt and q.lifecycle_closed_at is null and q.status<>'superseded'))))) then
  perform app_private.activate_employee_onboarding_case(c.id,coalesce(actor,r.lifecycle_user_id),'employee.auto_activated');
 end if;
end;
$function$;

create or replace function public.sync_expiring_document_todos_service(target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inserted_count integer := 0;
  resolved_count integer := 0;
  notification_count integer := 0;
begin
  with latest_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.review_status <> 'superseded'::public.employee_document_review_status
      and (target_workspace_id is null or document.workspace_id = target_workspace_id)
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  eligible as (
    select
      document.workspace_id,
      document.id as document_id,
      document.employee_id,
      document.requirement_id,
      document.expiry_date,
      requirement.title as document_title,
      employee.first_name,
      employee.last_name,
      type.expiry_schedule_impact
    from latest_documents document
    join public.workspaces workspace
      on workspace.id = document.workspace_id
     and app_private.workspace_allows_interactive_access(workspace.id)
    join public.employee_onboarding_requirements requirement
      on requirement.id = document.requirement_id
     and requirement.workspace_id = document.workspace_id
     and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
     and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
    join public.document_types type
      on type.id = requirement.source_id
     and type.workspace_id = document.workspace_id
     and type.archived_at is null
     and type.tracks_expiry
    join public.employee_profiles employee
      on employee.id = document.employee_id
     and employee.workspace_id = document.workspace_id
     and employee.archived_at is null
    where document.review_status = 'accepted'::public.employee_document_review_status
      and document.expiry_date is not null
      and document.expiry_date <= current_date + type.expiry_warning_days
  )
  insert into public.workspace_todos (
    workspace_id,
    title,
    body,
    severity,
    status,
    system_generated,
    source_type,
    source_id,
    source_key,
    employee_id,
    due_at,
    action_url,
    resolved_at
  )
  select
    eligible.workspace_id,
    case
      when eligible.expiry_date < current_date then 'Expired employee document'
      else 'Employee document expires soon'
    end,
    btrim(eligible.first_name || ' ' || eligible.last_name) || ' - ' || eligible.document_title,
    case
      when eligible.expiry_date < current_date then 'action_required'::public.workspace_todo_severity
      else 'warning'::public.workspace_todo_severity
    end,
    'open'::public.workspace_todo_status,
    true,
    'employee_document_expiry',
    eligible.document_id,
    'requirement:' || eligible.requirement_id::text,
    eligible.employee_id,
    eligible.expiry_date::timestamptz,
    '/app/employees',
    null
  from eligible
  on conflict (workspace_id, source_type, source_id, source_key)
  do update set
    title = excluded.title,
    body = excluded.body,
    severity = excluded.severity,
    status = 'open'::public.workspace_todo_status,
    employee_id = excluded.employee_id,
    due_at = excluded.due_at,
    action_url = excluded.action_url,
    resolved_at = null,
    updated_at = now()
  where public.workspace_todos.status <> 'open'::public.workspace_todo_status
     or public.workspace_todos.title <> excluded.title
     or public.workspace_todos.body <> excluded.body
     or public.workspace_todos.severity <> excluded.severity
     or public.workspace_todos.employee_id is distinct from excluded.employee_id
     or public.workspace_todos.due_at is distinct from excluded.due_at
     or public.workspace_todos.action_url is distinct from excluded.action_url;
  get diagnostics inserted_count = row_count;

  with latest_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.review_status <> 'superseded'::public.employee_document_review_status
      and (target_workspace_id is null or document.workspace_id = target_workspace_id)
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  eligible as (
    select
      document.workspace_id,
      document.id as document_id,
      document.employee_id,
      document.requirement_id,
      document.expiry_date,
      requirement.title as document_title,
      employee.first_name,
      employee.last_name,
      array(
        select distinct membership.user_id
        from public.workspace_memberships membership
        where membership.workspace_id = document.workspace_id
          and membership.status = 'active'
          and app_private.authz_reason(membership.user_id, document.workspace_id, 'documents.read', null, document.employee_id) is null
        order by membership.user_id
      ) as recipient_user_ids
    from latest_documents document
    join public.workspaces workspace
      on workspace.id = document.workspace_id
     and app_private.workspace_allows_interactive_access(workspace.id)
    join public.employee_onboarding_requirements requirement
      on requirement.id = document.requirement_id
     and requirement.workspace_id = document.workspace_id
     and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
     and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
    join public.document_types type
      on type.id = requirement.source_id
     and type.workspace_id = document.workspace_id
     and type.archived_at is null
     and type.tracks_expiry
    join public.employee_profiles employee
      on employee.id = document.employee_id
     and employee.workspace_id = document.workspace_id
     and employee.archived_at is null
    where document.review_status = 'accepted'::public.employee_document_review_status
      and document.expiry_date is not null
      and document.expiry_date <= current_date + type.expiry_warning_days
  ),
  event_rows as (
    select
      eligible.*,
      md5(
        eligible.workspace_id::text || ':employee-document-expiry:' ||
        eligible.document_id::text || ':' || eligible.requirement_id::text
      ) as event_digest
    from eligible
    where cardinality(eligible.recipient_user_ids) > 0
  ),
  enqueued as (
    select public.enqueue_notification_outbox_service(
      event_rows.workspace_id,
      (
        substr(event_rows.event_digest, 1, 8) || '-' ||
        substr(event_rows.event_digest, 9, 4) || '-' ||
        substr(event_rows.event_digest, 13, 4) || '-' ||
        substr(event_rows.event_digest, 17, 4) || '-' ||
        substr(event_rows.event_digest, 21, 12)
      )::uuid,
      'people.employee_document.expiring',
      1,
      null,
      'employee_document',
      event_rows.document_id::text,
      jsonb_build_object(
        'correlation_id',
        (
          substr(event_rows.event_digest, 1, 8) || '-' ||
          substr(event_rows.event_digest, 9, 4) || '-' ||
          substr(event_rows.event_digest, 13, 4) || '-' ||
          substr(event_rows.event_digest, 17, 4) || '-' ||
          substr(event_rows.event_digest, 21, 12)
        )::uuid,
        'audience_contract', 'employee_document_expiry_reviewers',
        'recipient_user_ids', to_jsonb(event_rows.recipient_user_ids),
        'employee_id', event_rows.employee_id,
        'employee_name', btrim(event_rows.first_name || ' ' || event_rows.last_name),
        'document_id', event_rows.document_id,
        'requirement_id', event_rows.requirement_id,
        'document_title', event_rows.document_title,
        'expiry_date', event_rows.expiry_date,
        'title', case
          when event_rows.expiry_date < current_date then 'Employee document expired'
          else 'Employee document expiring'
        end,
        'body', btrim(event_rows.first_name || ' ' || event_rows.last_name) || ' - ' ||
          event_rows.document_title || ' expires on ' || event_rows.expiry_date::text || '.',
        'safe_preview', 'An employee document needs attention.',
        'action_url', '/app/employees',
        'group_key', 'employee-document-expiry:' || event_rows.document_id::text
      ),
      now()
    ) as outbox_id
    from event_rows
  )
  select count(*)::integer into notification_count
  from enqueued;

  with latest_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.review_status <> 'superseded'::public.employee_document_review_status
      and (target_workspace_id is null or document.workspace_id = target_workspace_id)
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  eligible as (
    select document.workspace_id, document.id as document_id, document.requirement_id
    from latest_documents document
    join public.workspaces workspace
      on workspace.id = document.workspace_id
     and app_private.workspace_allows_interactive_access(workspace.id)
    join public.employee_onboarding_requirements requirement
      on requirement.id = document.requirement_id
     and requirement.workspace_id = document.workspace_id
     and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
     and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
    join public.document_types type
      on type.id = requirement.source_id
     and type.workspace_id = document.workspace_id
     and type.archived_at is null
     and type.tracks_expiry
    join public.employee_profiles employee
      on employee.id = document.employee_id
     and employee.workspace_id = document.workspace_id
     and employee.archived_at is null
    where document.review_status = 'accepted'::public.employee_document_review_status
      and document.expiry_date is not null
      and document.expiry_date <= current_date + type.expiry_warning_days
  )
  update public.workspace_todos todo
  set status = 'resolved'::public.workspace_todo_status,
      resolved_at = now(),
      updated_at = now()
  where todo.source_type = 'employee_document_expiry'
    and todo.system_generated
    and todo.status = 'open'::public.workspace_todo_status
    and (target_workspace_id is null or todo.workspace_id = target_workspace_id)
    and not exists (
      select 1
      from eligible
      where eligible.workspace_id = todo.workspace_id
        and eligible.document_id = todo.source_id
        and 'requirement:' || eligible.requirement_id::text = todo.source_key
    );
  get diagnostics resolved_count = row_count;

  return jsonb_build_object(
    'status', 'synced',
    'affected', inserted_count + resolved_count,
    'opened_or_refreshed', inserted_count,
    'resolved', resolved_count,
    'notifications_enqueued', notification_count
  );
end;
$function$;

revoke all on function app_private.activate_employee_onboarding_case(uuid, uuid, text) from public, anon, authenticated;

-- BL-264: no reason to run as its owner; every caller already does.
alter function app_private.set_document_exemption(public.employee_onboarding_requirements, uuid, boolean, text, integer) security invoker;

-- 4. What goes ---------------------------------------------------------------------------

drop function public.approve_signature_retention_policy(uuid, uuid);
drop function public.publish_signature_template(uuid, uuid);
drop function public.reorder_document_types(uuid, uuid[]);
drop function public.save_document_type(uuid, uuid, text, text, boolean, boolean, text[], boolean, integer);
drop function public.save_document_type(uuid, uuid, text, text, boolean, boolean, text[], boolean, integer, text);
drop function public.save_signature_retention_policy(uuid, uuid, text, text, integer, text, text);
drop function public.save_signature_template_draft(uuid, uuid, text, text, text, text, text, date, boolean, boolean, uuid);
drop function public.set_document_type_archived(uuid, uuid, boolean);
drop function public.set_signature_retention_policy_archived(uuid, uuid, boolean);
drop function public.set_signature_template_archived(uuid, uuid, boolean);
drop function public.unapprove_signature_retention_policy(uuid, uuid);
drop function public.unpublish_signature_template(uuid, uuid);
drop function public.activate_employee_onboarding_case_service(uuid, uuid, text);
drop function app_private.document_publication_can_access(uuid, uuid, uuid);
drop function public.service_actor_can_access_employee(uuid, uuid, uuid);
