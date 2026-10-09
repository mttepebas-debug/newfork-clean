-- Availability is a declaration, never a manager-reviewed onboarding proposal.
create function public.guard_weekly_onboarding_requirement() returns trigger
language plpgsql security definer set search_path='' as $$
declare declared_at timestamptz;
begin
 if new.kind <> 'availability' or exists (
  select 1 from public.employee_onboarding_cases c where c.id=new.case_id and c.status in ('approved','cancelled')
 ) then return new; end if;
 select s.availability_onboarding_required into new.required
 from public.workspace_scheduling_settings s where s.workspace_id=new.workspace_id;
 if new.required is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 new.blocks_activation:=new.required;
 new.requires_review:=false;
 select p.updated_at into declared_at from public.employee_weekly_preferences p
 where p.workspace_id=new.workspace_id and p.employee_id=new.employee_id;
 new.status:=case when declared_at is null then 'not_started' else 'completed' end;
 new.completed_at:=declared_at;
 new.rejection_reason:=null;
 new.reviewed_at:=null;
 new.reviewed_by:=null;
 return new;
end; $$;
revoke all on function public.guard_weekly_onboarding_requirement() from public,anon,authenticated,service_role;
create trigger weekly_onboarding_requirement before insert or update on public.employee_onboarding_requirements
 for each row when (new.kind='availability') execute function public.guard_weekly_onboarding_requirement();

create function public.sync_weekly_onboarding_requirements(w uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c record; required_now boolean; declared boolean;
begin
 select s.availability_onboarding_required into required_now from public.workspace_scheduling_settings s where s.workspace_id=w;
 if required_now is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 -- Match onboarding's case lock so activation and a policy change serialize.
 for c in select id,employee_id from public.employee_onboarding_cases
  where workspace_id=w and status in ('in_progress','submitted','changes_requested') order by id for update
 loop
  declared:=exists(select 1 from public.employee_weekly_preferences p where p.workspace_id=w and p.employee_id=c.employee_id);
  update public.employee_onboarding_requirements r set required=required_now,updated_at=now()
  where r.case_id=c.id and r.kind='availability' and (
   r.required is distinct from required_now or r.blocks_activation is distinct from required_now or r.requires_review
   or r.status::text is distinct from case when declared then 'completed' else 'not_started' end
  );
  if found then
   update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where id=c.id;
  end if;
 end loop;
end; $$;
revoke all on function public.sync_weekly_onboarding_requirements(uuid) from public,anon,authenticated,service_role;

create function public.sync_weekly_onboarding_settings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.sync_weekly_onboarding_requirements(new.workspace_id);
 return new;
end; $$;
revoke all on function public.sync_weekly_onboarding_settings() from public,anon,authenticated,service_role;
create trigger weekly_onboarding_settings after update of availability_onboarding_required on public.workspace_scheduling_settings
 for each row when (old.availability_onboarding_required is distinct from new.availability_onboarding_required)
 execute function public.sync_weekly_onboarding_settings();

-- Keep the existing profile/document/auth read contract; stop reading legacy weeks.
do $$
declare body text; old_read text;
begin
 body:=pg_get_functiondef('public.get_employee_onboarding_service(uuid)'::regprocedure);
 old_read:=$old$  select jsonb_build_object('timezone', version.timezone, 'days', version.recurring_rules)
  into availability from public.employee_availability_versions version
  where version.case_id = target_case.id order by version.version_number desc limit 1;$old$;
 if strpos(body,old_read)=0 then raise exception 'Onboarding getter availability anchor changed'; end if;
 execute replace(body,old_read,'  availability := null;');
end; $$;

create or replace function public.review_employee_onboarding_service(actor_user_id uuid,target_workspace_id uuid,target_employee_id uuid,
 review_action text,target_requirement_id uuid,review_reason text,expected_revision integer,production_ready boolean)
returns integer language plpgsql security definer set search_path='' as $$
begin
 perform public.get_employee_onboarding_review_service(actor_user_id,target_workspace_id,target_employee_id);
 if review_action in ('accept_requirement','reject_requirement') and exists (
  select 1 from public.employee_onboarding_requirements r where r.id=target_requirement_id
   and r.workspace_id=target_workspace_id and r.employee_id=target_employee_id and r.kind='availability'
 ) then raise exception 'Weekly availability is confirmed by the employee and does not require review' using errcode='22023'; end if;
 return public.review_employee_onboarding_before_availability_service(actor_user_id,target_workspace_id,target_employee_id,
  review_action,target_requirement_id,review_reason,expected_revision,production_ready);
end; $$;
revoke all on function public.review_employee_onboarding_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.review_employee_onboarding_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) to service_role;

do $$
declare w uuid;
begin
 for w in select distinct workspace_id from public.employee_onboarding_cases where status in ('in_progress','submitted','changes_requested') order by workspace_id
 loop
  perform public.availability_lock_workspace(w);
  perform public.sync_weekly_onboarding_requirements(w);
 end loop;
end; $$;
