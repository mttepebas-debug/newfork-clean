begin;
-- Kadikoy=Palo Alto, Besiktas=Sunnyvale, Ayse=Alex, Mehmet=Burak, Ali=Ferhat, Zeynep=Alejandro(admin)
update employee_profiles set archived_at=null where id='15000000-0000-4000-8000-000000fa0008';
update workspace_memberships set status='active', role='manager', role_id='bbbb6f06-0472-4230-984c-d58335df8b74' where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1' and user_id='e8336f72-d18e-41bd-bb8d-fac7b8f74353';
update employee_location_assignments set ended_at=now() where employee_id='9abeff35-d9ad-4d55-bedd-dbf9a932e92b' and location_id='6b98d6ab-c5c3-433f-8b8c-1c6c1a8c437c' and ended_at is null;
update workspace_memberships set role='manager', role_id='bbbb6f06-0472-4230-984c-d58335df8b74' where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1' and user_id='0021f57e-f379-4ae9-a099-689d7af46c62';
set constraints all immediate;
select 'D0 alex scopes before', count(*) from membership_location_scopes s join workspace_memberships m on m.id=s.membership_id where m.user_id='e8336f72-d18e-41bd-bb8d-fac7b8f74353' and m.workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1';
select 'D1 demote', left(public.update_employee_membership_role_service('52977b4c-157c-4a73-9c16-83f55c5419df','6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1','15000000-0000-4000-8000-000000fa0008','b1aa5750-04c7-4672-8447-9a6e6bcc35a7')::text,200);
set constraints all immediate;
select 'D2 alex role/all_locations/scopes after', m.role, m.all_locations, (select count(*) from membership_location_scopes s where s.membership_id=m.id) from workspace_memberships m where m.user_id='e8336f72-d18e-41bd-bb8d-fac7b8f74353' and m.workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1';
-- manager with Kadikoy added as worker location: Mehmet gets PA too
insert into employee_location_assignments(workspace_id,employee_id,location_id,is_primary) values('6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1','9abeff35-d9ad-4d55-bedd-dbf9a932e92b','6b98d6ab-c5c3-433f-8b8c-1c6c1a8c437c',false);
set constraints all immediate;
select 'D3 mehmet scopes after being added as worker at Kadikoy', string_agg(l.name, ',') from membership_location_scopes s join workspace_memberships m on m.id=s.membership_id join locations l on l.id=s.location_id where m.user_id='0021f57e-f379-4ae9-a099-689d7af46c62' and m.workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1';
rollback;
