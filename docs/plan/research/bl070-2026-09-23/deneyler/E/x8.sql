begin;
\i /tmp/fixture.sql
insert into auth.users(id,email) values ('e0000000-0000-4000-8000-0000000000ad','fx-admin@example.test');
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations) select w,'e0000000-0000-4000-8000-0000000000ad','admin'::public.workspace_role,false from fx;
select 'admin all_locations after insert', all_locations from public.workspace_memberships where user_id='e0000000-0000-4000-8000-0000000000ad';
select 'admin can manage Besiktas', public.schedule_actor_can_manage_service('e0000000-0000-4000-8000-0000000000ad',w,bes) from fx;
rollback;
