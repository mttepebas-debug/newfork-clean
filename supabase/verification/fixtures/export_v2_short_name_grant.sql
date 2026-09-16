-- Only in the BL-037 owned scratch replay; transaction restores the granted state.
begin;
select plan(5);
revoke select(short_name) on public.locations from service_role;
create temporary table grant_before as select
  has_column_privilege('anon','public.locations','short_name','SELECT') as anon_read,
  has_column_privilege('authenticated','public.locations','short_name','SELECT') as authenticated_read;
set local role service_role;
select lives_ok($$select id,workspace_id,timezone from public.locations limit 0$$,'existing service column access still works');
select throws_ok($$select id,short_name from public.locations limit 0$$,'42501',null,'missing short-name grant reproduces Schedule failure');
reset role;
grant select(short_name) on public.locations to service_role;
set local role service_role;
select lives_ok($$select id,short_name from public.locations limit 0$$,'only forward grant fixes the failing service read');
select throws_ok($$select street_address from public.locations limit 0$$,'42501',null,'unrelated service columns remain inaccessible');
reset role;
select ok((select anon_read=has_column_privilege('anon','public.locations','short_name','SELECT') and
 authenticated_read=has_column_privilege('authenticated','public.locations','short_name','SELECT') from grant_before),'anon and authenticated privileges unchanged');
select * from finish();
rollback;
