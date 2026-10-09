-- A metadata writer must not revoke eligibility between final review and commit.
-- Row triggers cover service RPCs and direct authorized table writes alike.
-- Do not wait while holding a row lock: an approval may need FK/row locks in the
-- opposite order. Fail with a business conflict so the caller can retry safely.
create function public.shift_exchange_guard_eligibility_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare workspaces uuid[]; w uuid;
begin
 if tg_op='INSERT' then workspaces:=array[new.workspace_id];
 elsif tg_op='DELETE' then workspaces:=array[old.workspace_id];
 else workspaces:=array[old.workspace_id,new.workspace_id]; end if;
 for w in select distinct value from unnest(workspaces) value where value is not null order by value loop
  if coalesce((select shift_exchanges_enabled from public.workspaces where id=w),false)
    and not pg_try_advisory_xact_lock(hashtextextended(w::text,921)) then
   raise exception 'A shift change is being reviewed. Your changes were not saved; try again.' using errcode='PT409';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function public.shift_exchange_guard_eligibility_write() from public,anon,authenticated,service_role;

create trigger a_shift_exchange_eligibility_write
before insert or update or delete on public.employee_job_assignments
for each row execute function public.shift_exchange_guard_eligibility_write();

create trigger a_shift_exchange_eligibility_write
before insert or update or delete on public.employee_location_assignments
for each row execute function public.shift_exchange_guard_eligibility_write();

create trigger a_shift_exchange_eligibility_write
before update of workspace_id,archived_at,is_excluded_from_schedule,start_date,user_id or delete
on public.employee_profiles
for each row execute function public.shift_exchange_guard_eligibility_write();
