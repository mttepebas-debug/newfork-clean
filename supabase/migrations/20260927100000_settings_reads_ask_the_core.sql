-- FB-6.1.9: the eight Settings pages read through the API.
--
-- Settings > Locations, Jobs, Shift types, Shift labels, Important dates,
-- Roles, Documents and Acknowledgements read their tables straight from the
-- browser, so somebody who may not read a page gets an empty list and the page
-- cannot say "no access". Each page gets one entry point here. Its first step
-- asks the authorization core with the permission the page is opened with, so
-- a refusal is 42501 with an authz.* hint, like every other entry point.
--
-- The answers carry the columns the browser selects today. The browser's
-- direct reads (and read_role_workspace) stay until the web reads through the
-- API; then they go (no twin paths).

-- One action per read permission; Shift types and Shift labels share one.
-- Locations is a set action: a manager reads the locations they work at
-- (REUSE "Ürün kuralları"); the rest read the whole organization.
insert into app_private.authz_actions (key, scope_class, effect, permission_key) values
  ('settings.locations.read', 'set', 'read', 'settings.locations.read'),
  ('settings.jobs.read', 'org', 'read', 'settings.jobs.read'),
  ('settings.shift_catalog.read', 'org', 'read', 'settings.shift_catalog.read'),
  ('settings.important_dates.read', 'org', 'read', 'important_dates.read'),
  ('settings.roles.read', 'org', 'read', 'roles.read'),
  ('settings.documents.read', 'org', 'read', 'documents.read'),
  ('settings.signature_templates.read', 'org', 'read', 'signature_templates.read');

-- The locations among ids, as Settings > Locations shows them.
create function app_private.settings_locations(w uuid, ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(l) order by l.sort_order, l.name, l.id), '[]'::jsonb)
  from (
    select location.id, location.workspace_id, location.name, location.short_name, location.phone,
      location.street_address, location.city, location.region, location.postal_code,
      location.country_code, location.timezone, location.sort_order, location.archived_at
    from public.locations location
    where location.workspace_id = w and location.deleted_at is null and location.id = any (ids)
  ) l;
$$;
revoke all on function app_private.settings_locations(uuid, uuid[]) from public;

-- Settings > Locations. Owner and admins: every location; a manager: where
-- they work; a manager who works nowhere: authz.out_of_scope.
create function public.list_settings_locations_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.locations.read',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'settings.locations.read'));
  return app_private.settings_locations(target_workspace_id,
    app_private.scope_set(actor_user_id, target_workspace_id, 'settings.locations.read'));
end;
$$;

-- Settings > Jobs: departments and jobs in one answer.
create function public.read_settings_jobs_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.read');
  return jsonb_build_object(
    'departments', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.name, d.id), '[]'::jsonb)
      from (
        select department.id, department.workspace_id, department.name, department.color,
          department.sort_order, department.archived_at
        from public.departments department
        where department.workspace_id = target_workspace_id and department.deleted_at is null
      ) d),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(j) order by j.sort_order, j.name, j.id), '[]'::jsonb)
      from (
        select job.id, job.workspace_id, job.department_id, job.name, job.color, job.sort_order, job.archived_at
        from public.jobs job
        where job.workspace_id = target_workspace_id and job.deleted_at is null
      ) j)
  );
end;
$$;

-- Settings > Shift types. Default hours as HH:MM.
create function public.list_settings_shift_types_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.shift_catalog.read');
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.name, t.id), '[]'::jsonb)
    from (
      select shift_type.id, shift_type.workspace_id, shift_type.name, shift_type.color,
        to_char(shift_type.default_start_time, 'HH24:MI') as default_start_time,
        to_char(shift_type.default_end_time, 'HH24:MI') as default_end_time,
        shift_type.default_revision, shift_type.crosses_midnight, shift_type.sort_order, shift_type.archived_at
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.deleted_at is null
    ) t
  );
end;
$$;

-- Settings > Shift labels.
create function public.list_settings_shift_labels_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.shift_catalog.read');
  return (
    select coalesce(jsonb_agg(to_jsonb(l) order by l.sort_order, l.name, l.id), '[]'::jsonb)
    from (
      select label.id, label.workspace_id, label.name, label.color, label.sort_order, label.archived_at
      from public.shift_labels label
      where label.workspace_id = target_workspace_id and label.deleted_at is null
    ) l
  );
end;
$$;

-- Settings > Important dates. Every date, archived ones too (the page filters),
-- each with the names of its locations. locations: where the reader may add a
-- date, for the page's location picker (a manager's role need not hold
-- settings.locations.read to add a date at their own location).
create function public.read_settings_important_dates_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  return jsonb_build_object(
    'dates', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.starts_on, d.title, d.id), '[]'::jsonb)
      from (
        select date_row.id, date_row.workspace_id, date_row.location_id, date_row.location_ids,
          date_row.title, date_row.type, date_row.starts_on, date_row.ends_on, date_row.recurrence,
          date_row.note, date_row.affects_scheduling, date_row.archived_at,
          (select location.name from public.locations location
           where location.id = date_row.location_id and location.workspace_id = date_row.workspace_id) as location_name,
          (select coalesce(jsonb_agg(coalesce(location.name, 'Archived location') order by listed.n), '[]'::jsonb)
           from unnest(date_row.location_ids) with ordinality listed(id, n)
           left join public.locations location
             on location.id = listed.id and location.workspace_id = date_row.workspace_id
            and location.deleted_at is null) as location_names
        from public.important_dates date_row
        where date_row.workspace_id = target_workspace_id
      ) d),
    'locations', app_private.settings_locations(target_workspace_id,
      app_private.scope_set(actor_user_id, target_workspace_id, 'important_date.write'))
  );
end;
$$;

-- Settings > Roles: what read_role_workspace answers the browser today.
create function public.read_role_workspace_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.roles.read');
  return jsonb_build_object(
    'permissions', (select jsonb_agg(p order by p.sort_order) from public.permissions p),
    'roles', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
        'permission_keys', coalesce((select jsonb_agg(g.permission_key order by g.permission_key)
          from public.workspace_role_permissions g where g.role_id = r.id), '[]'::jsonb),
        'member_count', (select count(*) from public.workspace_memberships m where m.role_id = r.id and m.status = 'active'),
        'pending_invite_count', (select count(*) from public.employee_invitations i
          where i.role_id = r.id and i.status = 'pending' and i.expires_at > now()),
        'blocking_member_count', (select count(*) from public.workspace_memberships m where m.role_id = r.id)
          + (select count(*) from public.employee_access_snapshots snap where snap.role_id = r.id),
        'blocking_invite_count', (select count(*) from public.employee_invitations i where i.role_id = r.id),
        'editable', app_private.can_edit_role(actor_user_id, target_workspace_id, r.id),
        'deletable', r.system_key is null and app_private.can_edit_role(actor_user_id, target_workspace_id, r.id)
          and not exists (select 1 from public.workspace_memberships m where m.role_id = r.id)
          and not exists (select 1 from public.employee_invitations i where i.role_id = r.id)
          and not exists (select 1 from public.employee_access_snapshots snap where snap.role_id = r.id)
      ) order by r.sort_order, r.name)
      from public.workspace_roles r
      where r.workspace_id = target_workspace_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Settings > Documents: the document types.
create function public.list_settings_document_types_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.read');
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.title, t.id), '[]'::jsonb)
    from (
      select document_type.id, document_type.workspace_id, document_type.title, document_type.description,
        document_type.required_at_onboarding, document_type.requires_review, document_type.accepted_formats,
        document_type.tracks_expiry, document_type.expiry_warning_days, document_type.expiry_schedule_impact,
        document_type.sort_order, document_type.archived_at, document_type.lifecycle_settings,
        document_type.lifecycle_revision, document_type.publication_status, document_type.publication_revision,
        document_type.published_at
      from public.document_types document_type
      where document_type.workspace_id = target_workspace_id
    ) t
  );
end;
$$;

-- Settings > Acknowledgements: retention policies, templates and template
-- versions in one answer.
create function public.read_signature_settings_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.signature_templates.read');
  return jsonb_build_object(
    'policies', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.name, p.id), '[]'::jsonb)
      from (
        select policy.id, policy.workspace_id, policy.name, policy.retention_trigger, policy.duration_days,
          policy.jurisdiction_scope, policy.authority_reference, policy.status, policy.approved_at, policy.archived_at
        from public.signature_retention_policies policy
        where policy.workspace_id = target_workspace_id
      ) p),
    'templates', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.name, t.id), '[]'::jsonb)
      from (
        select template.id, template.workspace_id, template.name, template.archived_at
        from public.signature_templates template
        where template.workspace_id = target_workspace_id
      ) t),
    'versions', (
      select coalesce(jsonb_agg(to_jsonb(v) order by v.version_number desc, v.id), '[]'::jsonb)
      from (
        select version.id, version.workspace_id, version.template_id, version.version_number, version.title,
          version.summary, version.execution_class, version.content_text, version.content_digest,
          version.intent_statement, version.locale, version.effective_date, version.required_at_onboarding,
          version.blocks_activation, version.retention_policy_id, version.status, version.published_at,
          version.lifecycle_settings, version.lifecycle_revision
        from public.signature_template_versions version
        where version.workspace_id = target_workspace_id
      ) v)
  );
end;
$$;

revoke all on function
  public.list_settings_locations_service(uuid, uuid),
  public.read_settings_jobs_service(uuid, uuid),
  public.list_settings_shift_types_service(uuid, uuid),
  public.list_settings_shift_labels_service(uuid, uuid),
  public.read_settings_important_dates_service(uuid, uuid),
  public.read_role_workspace_service(uuid, uuid),
  public.list_settings_document_types_service(uuid, uuid),
  public.read_signature_settings_service(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.list_settings_locations_service(uuid, uuid),
  public.read_settings_jobs_service(uuid, uuid),
  public.list_settings_shift_types_service(uuid, uuid),
  public.list_settings_shift_labels_service(uuid, uuid),
  public.read_settings_important_dates_service(uuid, uuid),
  public.read_role_workspace_service(uuid, uuid),
  public.list_settings_document_types_service(uuid, uuid),
  public.read_signature_settings_service(uuid, uuid)
to service_role;
