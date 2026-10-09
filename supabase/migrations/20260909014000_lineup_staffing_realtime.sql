-- Reuse the workspace invalidation bus consumed once by AppShell. No employee,
-- shift, offer, location, decision or notification content enters this broadcast.
-- Subscribers refetch authorized APIs, including both weeks/locations of a swap.
create function public.lineup_staffing_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 perform realtime.send(
  jsonb_build_object('workspace_id',new.workspace_id),
  'changed','shift-exchanges:'||new.workspace_id::text,false
 );
 return new;
end;
$$;

create trigger lineup_staffing_proposal_created
after insert on public.lineup_proposals
for each row execute function public.lineup_staffing_broadcast();

create trigger lineup_staffing_proposal_changed
after update of status on public.lineup_proposals
for each row when (old.status is distinct from new.status)
execute function public.lineup_staffing_broadcast();

create trigger lineup_staffing_assignment_changed
after insert on public.lineup_operation_events
for each row execute function public.lineup_staffing_broadcast();

revoke all on function public.lineup_staffing_broadcast()
from public,anon,authenticated,service_role;
