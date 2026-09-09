-- Reassignment invalidation also covers older pending-op/direct table paths.
-- Depends only on 12001; preserve the independently maintained 13000 work.
do $reassignment$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.guard_schedule_assignment_availability()'::regprocedure);
 anchor:='s:=s||jsonb_build_object(''id'',logical_id);';
 if position(anchor in body)=0 then raise exception 'Assignment guard identity changed'; end if;
 body:=replace(body,anchor,anchor||E'\n if tg_op=''UPDATE'' and new.employee_id is null and old.employee_id is not null then\n  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id and revoked_at is null;\n end if;');
 anchor:='case when tg_table_name=''schedule_published_shifts'' then (s->>''publication_id'')::uuid end';
 if position(anchor in body)=0 then raise exception 'Publication carry-forward guard changed'; end if;
 -- INSERT checks the preceding publication. An in-place UPDATE must compare
 -- against the current publication, not resurrect a superseded assignment.
 body:=replace(body,anchor,'case when tg_table_name=''schedule_published_shifts'' and tg_op=''INSERT'' then (s->>''publication_id'')::uuid end');
 execute body;

 body:=replace(pg_get_functiondef('public.bulk_delete_schedule_edit_shifts_service(uuid,uuid,uuid[])'::regprocedure),E'\r\n',E'\n');
 anchor:='  with draft_deletes as (';
 if position(anchor in body)=0 then raise exception 'Bulk deletion validation changed'; end if;
 body:=replace(body,anchor,E'  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=any(target_shift_ids) and revoked_at is null;\n'||anchor);
 execute body;
end; $reassignment$;

create function public.revoke_removed_assignment_availability_override() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.availability_lock_workspace(old.workspace_id);
 -- Save/acquire/discard copies can delete a row while its identical assignment
 -- still exists in the other store. Keep only evidence valid for retained work.
 update public.schedule_availability_overrides o set revoked_at=now()
 where o.workspace_id=old.workspace_id and o.shift_id=old.id and o.revoked_at is null
  and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=o.workspace_id and s.id=o.shift_id
    and case when s.employee_id is not null then public.assess_shift_availability(s.workspace_id,s.employee_id,to_jsonb(s))->>'fingerprint'=o.assessment_fingerprint else false end)
  and not exists(select 1 from public.schedule_draft_shifts s where s.workspace_id=o.workspace_id and s.id=o.shift_id
    and case when s.employee_id is not null then public.assess_shift_availability(s.workspace_id,s.employee_id,to_jsonb(s))->>'fingerprint'=o.assessment_fingerprint else false end);
 return old;
end; $$;
revoke all on function public.revoke_removed_assignment_availability_override() from public,anon,authenticated,service_role;
create trigger availability_removed_assignment after delete on public.schedule_edit_session_shifts for each row execute function public.revoke_removed_assignment_availability_override();
create trigger availability_removed_assignment after delete on public.schedule_draft_shifts for each row execute function public.revoke_removed_assignment_availability_override();
