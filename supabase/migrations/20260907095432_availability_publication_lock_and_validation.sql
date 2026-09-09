-- Availability is planning input. Publication locks survive unpublish/republish.
-- New entry points are additive so later existing migration wrappers remain intact.
alter table public.employee_schedule_availability_versions
  add column effective_from date,
  add column effective_until date;
update public.employee_schedule_availability_versions
set effective_from = (effective_at at time zone timezone)::date;
alter table public.employee_schedule_availability_versions
  alter column effective_from set not null,
  add constraint availability_effective_period check (effective_until is null or effective_until >= effective_from);

alter table public.employee_availability_versions
  add column effective_from date,
  add column effective_until date,
  add constraint onboarding_availability_effective_period check (effective_until is null or effective_until >= effective_from);
update public.employee_availability_versions set effective_from=(confirmed_at at time zone timezone)::date;
alter table public.employee_availability_versions alter column effective_from set not null;

create table public.availability_publication_locks (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid not null,
  week_start date not null,
  first_published_at timestamptz not null,
  primary key (workspace_id, location_id, week_start),
  foreign key (location_id, workspace_id) references public.locations(id, workspace_id) on delete cascade
);
alter table public.availability_publication_locks enable row level security;
revoke all on public.availability_publication_locks from public, anon, authenticated;
grant select, insert on public.availability_publication_locks to service_role;

insert into public.availability_publication_locks(workspace_id, location_id, week_start, first_published_at)
select workspace_id, location_id, week_start, min(published_at)
from public.schedule_location_publications group by workspace_id, location_id, week_start;

create function public.availability_lock_workspace(w uuid) returns void
language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('availability-publication:' || w::text, 0));
$$;
revoke all on function public.availability_lock_workspace(uuid) from public, anon, authenticated;
grant execute on function public.availability_lock_workspace(uuid) to service_role;

create function public.capture_availability_publication_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.availability_lock_workspace(new.workspace_id);
  insert into public.availability_publication_locks(workspace_id, location_id, week_start, first_published_at)
  values(new.workspace_id, new.location_id, new.week_start, new.published_at)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.capture_availability_publication_lock() from public, anon, authenticated;
create trigger availability_publication_lock before insert on public.schedule_location_publications
for each row execute function public.capture_availability_publication_lock();

create function public.validate_availability_week(tz text, days jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare d jsonb; win jsonb; start_clock time; end_clock time;
begin
  if tz is null or not exists(select 1 from pg_timezone_names where name=tz)
    or days is null or jsonb_typeof(days)<>'array' or jsonb_array_length(days)<>7 then
    raise exception 'valid timezone and complete weekly availability required' using errcode='22023';
  end if;
  if (select count(distinct item.value->>'day') from jsonb_array_elements(days) item)<>7 then
    raise exception 'each weekday must be provided once' using errcode='22023';
  end if;
  for d in select value from jsonb_array_elements(days) loop
    if d->>'day' is null or d->>'day' !~ '^[0-6]$'
      or d->>'mode' is null or d->>'mode' not in ('windows','unrestricted','unavailable')
      or d->'windows' is null or jsonb_typeof(d->'windows')<>'array' then
      raise exception 'invalid availability day' using errcode='22023';
    end if;
    if jsonb_array_length(d->'windows')>4
      or (d->>'mode'='windows' and jsonb_array_length(d->'windows')=0)
      or (d->>'mode'<>'windows' and jsonb_array_length(d->'windows')<>0) then
      raise exception 'invalid availability windows' using errcode='22023';
    end if;
    for win in select value from jsonb_array_elements(d->'windows') loop
      if win->>'start' is null or win->>'end' is null
        or win->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        or (win->>'end'<>'24:00' and win->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then
        raise exception 'valid availability clock times required' using errcode='22023';
      end if;
      start_clock := (win->>'start')::time; end_clock := (win->>'end')::time;
      if end_clock<=start_clock then
        raise exception 'availability end must follow start; use the next day for overnight hours' using errcode='22023';
      end if;
    end loop;
    if exists (
      select 1 from jsonb_array_elements(d->'windows') with ordinality a(win,n)
      join jsonb_array_elements(d->'windows') with ordinality b(win,n) on a.n<b.n
      where (a.win->>'start')::time<(b.win->>'end')::time
        and (b.win->>'start')::time<(a.win->>'end')::time
    ) then raise exception 'availability windows cannot overlap' using errcode='22023'; end if;
  end loop;
end;
$$;
revoke all on function public.validate_availability_week(text,jsonb) from public, anon, authenticated;
grant execute on function public.validate_availability_week(text,jsonb) to service_role;

create function public.guard_availability_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'availability versions are immutable; submit a new version' using errcode='23514';
  end if;
  perform public.availability_lock_workspace(new.workspace_id);
  perform public.validate_availability_week(new.timezone,new.recurring_rules);
  if tg_table_name='employee_schedule_availability_versions' then
    new.effective_from:=coalesce(new.effective_from,(new.effective_at at time zone new.timezone)::date);
  else
    new.effective_from:=coalesce(new.effective_from,(new.confirmed_at at time zone new.timezone)::date);
  end if;
  if exists (
    select 1 from public.availability_publication_locks locked
    where locked.workspace_id=new.workspace_id
      and locked.week_start<=coalesce(new.effective_until,'infinity'::date)
      and locked.week_start+6>=new.effective_from
      and (
        exists(select 1 from public.employee_location_assignments a where a.employee_id=new.employee_id
          and a.workspace_id=new.workspace_id and a.location_id=locked.location_id and a.ended_at is null)
        or exists(select 1 from public.schedule_published_shifts s where s.employee_id=new.employee_id
          and s.workspace_id=new.workspace_id and s.location_id=locked.location_id
          and s.scheduled_date between locked.week_start and locked.week_start+6)
      )
  ) then
    raise exception 'This period is published. Your assigned shifts remain your responsibility. Request time off or a shift change, or choose an unpublished period.' using errcode='23514';
  end if;
  if tg_table_name='employee_schedule_availability_versions' then
    new.effective_at := new.effective_from::timestamp at time zone new.timezone;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_availability_write() from public, anon, authenticated;
create trigger availability_write_guard before insert or update on public.employee_schedule_availability_versions
for each row execute function public.guard_availability_write();
create trigger onboarding_availability_write_guard before insert or update on public.employee_availability_versions
for each row execute function public.guard_availability_write();

create function public.sync_onboarding_availability() returns trigger
language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  perform public.availability_lock_workspace(new.workspace_id);
  select coalesce(max(version_number),0)+1 into next_version
    from public.employee_schedule_availability_versions where employee_id=new.employee_id;
  insert into public.employee_schedule_availability_versions(
    workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until
  ) values(new.workspace_id,new.employee_id,next_version,new.timezone,new.recurring_rules,'onboarding',new.confirmed_by,new.effective_from,new.effective_until);
  return new;
end;
$$;
revoke all on function public.sync_onboarding_availability() from public, anon, authenticated;
create trigger onboarding_availability_sync after insert on public.employee_availability_versions
for each row execute function public.sync_onboarding_availability();

create function public.employee_availability_context_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare employee public.employee_profiles%rowtype; locks jsonb; latest jsonb;
begin
  select profile.* into employee from public.employee_profiles profile
    join public.workspace_memberships membership on membership.workspace_id=profile.workspace_id and membership.user_id=profile.user_id
    where profile.user_id=actor_user_id and profile.workspace_id=target_workspace_id and profile.archived_at is null
      and membership.status in ('active','pending_activation');
  if employee.id is null then raise exception 'employee profile required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('location_id',locked.location_id,'location_name',location.name,
    'starts_on',locked.week_start,'ends_on',locked.week_start+6) order by locked.week_start,location.name),'[]'::jsonb)
    into locks from public.availability_publication_locks locked
    join public.locations location on location.id=locked.location_id
    where locked.workspace_id=target_workspace_id and locked.week_start+6>=current_date
      and (exists(select 1 from public.employee_location_assignments a where a.employee_id=employee.id and a.location_id=locked.location_id and a.ended_at is null)
        or exists(select 1 from public.schedule_published_shifts s where s.employee_id=employee.id and s.location_id=locked.location_id and s.scheduled_date between locked.week_start and locked.week_start+6));
  select jsonb_build_object('timezone',v.timezone,'days',v.recurring_rules,'effective_from',v.effective_from,
    'effective_until',v.effective_until,'revision',v.version_number,'source',v.source)
    into latest from public.employee_schedule_availability_versions v where v.employee_id=employee.id
    order by version_number desc limit 1;
  return jsonb_build_object('latest',latest,'revision',coalesce((latest->>'revision')::integer,0),'published_periods',locks,
    'suggested_start',greatest(current_date,coalesce((select max((l->>'ends_on')::date)+1 from jsonb_array_elements(locks) l),current_date)));
end;
$$;
revoke all on function public.employee_availability_context_service(uuid,uuid) from public, anon, authenticated;
grant execute on function public.employee_availability_context_service(uuid,uuid) to service_role;

create function public.save_employee_availability_v2_service(
  actor_user_id uuid,target_workspace_id uuid,availability_timezone text,availability_days jsonb,
  starts_on date,ends_on date,expected_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare employee public.employee_profiles%rowtype; current_revision integer;
begin
  employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  perform public.availability_lock_workspace(target_workspace_id);
  if starts_on is null or starts_on < (now() at time zone availability_timezone)::date
    or (ends_on is not null and ends_on<starts_on) then
    raise exception 'choose a valid future availability period' using errcode='22023';
  end if;
  select coalesce(max(version_number),0) into current_revision from public.employee_schedule_availability_versions where employee_id=employee.id;
  if expected_revision is distinct from current_revision then
    raise exception 'availability changed; refresh before saving' using errcode='40001';
  end if;
  insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,
    source,recorded_by,effective_from,effective_until)
  values(target_workspace_id,employee.id,current_revision+1,availability_timezone,availability_days,'employee',actor_user_id,starts_on,ends_on);
  return jsonb_build_object('status','saved','revision',current_revision+1);
end;
$$;
revoke all on function public.save_employee_availability_v2_service(uuid,uuid,text,jsonb,date,date,integer) from public, anon, authenticated;
grant execute on function public.save_employee_availability_v2_service(uuid,uuid,text,jsonb,date,date,integer) to service_role;

create function public.save_onboarding_availability_v2_service(
  target_user_id uuid,availability_timezone text,availability_days jsonb,expected_revision integer,
  starts_on date,ends_on date,availability_revision integer
) returns integer language plpgsql security definer set search_path = '' as $$
declare c public.employee_onboarding_cases%rowtype; next_version integer; current_version integer;
begin
  select onboarding.* into c from public.employee_onboarding_cases onboarding
    join public.employee_profiles e on e.id=onboarding.employee_id
    join public.workspace_memberships m on m.id=onboarding.membership_id
    where e.user_id=target_user_id and e.archived_at is null and m.status in ('active','pending_activation')
    order by onboarding.created_at limit 1;
  if c.id is null then raise exception 'onboarding unavailable' using errcode='P0002'; end if;
  perform public.availability_lock_workspace(c.workspace_id);
  select * into c from public.employee_onboarding_cases where id=c.id for update;
  if c.revision is distinct from expected_revision then raise exception 'onboarding changed; refresh required' using errcode='40001'; end if;
  select coalesce(max(version_number),0) into current_version from public.employee_schedule_availability_versions where employee_id=c.employee_id;
  if current_version is distinct from availability_revision then raise exception 'availability changed; refresh required' using errcode='40001'; end if;
  if starts_on is null or starts_on<(now() at time zone availability_timezone)::date or ends_on<starts_on then
    raise exception 'choose a valid future availability period' using errcode='22023';
  end if;
  select coalesce(max(version_number),0)+1 into next_version from public.employee_availability_versions where case_id=c.id;
  insert into public.employee_availability_versions(workspace_id,employee_id,case_id,version_number,timezone,recurring_rules,confirmed_by,effective_from,effective_until)
  values(c.workspace_id,c.employee_id,c.id,next_version,availability_timezone,availability_days,target_user_id,starts_on,ends_on);
  update public.employee_onboarding_requirements set status='completed',rejection_reason=null,completed_at=now(),updated_at=now()
    where case_id=c.id and kind='availability';
  update public.employee_onboarding_cases set status='in_progress',revision=revision+1,updated_at=now()
    where id=c.id returning revision into expected_revision;
  insert into public.onboarding_events(workspace_id,employee_id,case_id,actor_user_id,action,target_type,target_id,metadata)
  values(c.workspace_id,c.employee_id,c.id,target_user_id,'onboarding.availability_confirmed','availability_version',next_version::text,
    jsonb_build_object('version',next_version,'timezone',availability_timezone,'effective_from',starts_on,'effective_until',ends_on));
  return expected_revision;
end;
$$;
revoke all on function public.save_onboarding_availability_v2_service(uuid,text,jsonb,integer,date,date,integer) from public,anon,authenticated;
grant execute on function public.save_onboarding_availability_v2_service(uuid,text,jsonb,integer,date,date,integer) to service_role;

create function public.availability_rules_for_date(target_employee_id uuid,target_date date)
returns jsonb language sql stable set search_path = '' as $$
  select recurring_rules from public.employee_schedule_availability_versions
  where employee_id=target_employee_id and effective_from<=target_date
    and (effective_until is null or effective_until>=target_date)
  order by version_number desc limit 1;
$$;
revoke all on function public.availability_rules_for_date(uuid,date) from public,anon,authenticated;
grant execute on function public.availability_rules_for_date(uuid,date) to service_role;

create function public.get_employee_hub_availability_v2_service(actor_user_id uuid,target_workspace_id uuid,target_from date,target_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare model jsonb; current_availability jsonb;
begin
  model:=public.get_employee_hub_service(actor_user_id,target_workspace_id,target_from,target_to);
  select jsonb_build_object('timezone',v.timezone,'days',v.recurring_rules) into current_availability
    from public.employee_schedule_availability_versions v
    where v.employee_id=(model->'employee'->>'id')::uuid
      and v.effective_from<=(now() at time zone v.timezone)::date
      and (v.effective_until is null or v.effective_until>=(now() at time zone v.timezone)::date)
    order by v.version_number desc limit 1;
  return jsonb_set(model,'{availability}',coalesce(current_availability,'null'::jsonb));
end;
$$;
revoke all on function public.get_employee_hub_availability_v2_service(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.get_employee_hub_availability_v2_service(uuid,uuid,date,date) to service_role;

create function public.get_schedule_read_model_availability_v2_service(actor_user_id uuid,target_workspace_id uuid,target_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare model jsonb; employees jsonb;
begin
  -- The existing read model performs actor/location/role authorization first.
  model:=public.get_schedule_read_model_service(actor_user_id,target_workspace_id,target_date);
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
    'availability',public.availability_rules_for_date((e.value->>'id')::uuid,target_date),
    'availability_versions',coalesce((select jsonb_agg(jsonb_build_object(
      'revision',v.version_number,'timezone',v.timezone,'days',v.recurring_rules,
      'effective_from',v.effective_from,'effective_until',v.effective_until
    ) order by v.version_number desc) from public.employee_schedule_availability_versions v
      where v.workspace_id=target_workspace_id and v.employee_id=(e.value->>'id')::uuid
        and v.effective_from<=(model->>'week_start')::date+7
        and (v.effective_until is null or v.effective_until>=(model->>'week_start')::date-1)),'[]'::jsonb)
  ) order by e.n),'[]'::jsonb) into employees from jsonb_array_elements(model->'employees') with ordinality e(value,n);
  return jsonb_set(model,'{employees}',employees);
end;
$$;
revoke all on function public.get_schedule_read_model_availability_v2_service(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.get_schedule_read_model_availability_v2_service(uuid,uuid,date) to service_role;
