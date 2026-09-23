begin;
-- Kadikoy=Palo Alto, Besiktas=Sunnyvale, Ayse=Alex, Mehmet=Burak, Ali=Ferhat, Zeynep=Alejandro(admin)
update employee_profiles set archived_at=null where id='15000000-0000-4000-8000-000000fa0008';
update workspace_memberships set status='active', role='manager', role_id='bbbb6f06-0472-4230-984c-d58335df8b74' where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1' and user_id='e8336f72-d18e-41bd-bb8d-fac7b8f74353';
update employee_location_assignments set ended_at=now() where employee_id='9abeff35-d9ad-4d55-bedd-dbf9a932e92b' and location_id='6b98d6ab-c5c3-433f-8b8c-1c6c1a8c437c' and ended_at is null;
update workspace_memberships set role='manager', role_id='bbbb6f06-0472-4230-984c-d58335df8b74' where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1' and user_id='0021f57e-f379-4ae9-a099-689d7af46c62';
set constraints all immediate;
insert into employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) values('6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1','9abeff35-d9ad-4d55-bedd-dbf9a932e92b','6b98d6ab-c5c3-433f-8b8c-1c6c1a8c437c',false,'52977b4c-157c-4a73-9c16-83f55c5419df');
set constraints all immediate;
select 'W1 mehmet scopes after being added as worker at Kadikoy', string_agg(l.name, ',') from membership_location_scopes s join workspace_memberships m on m.id=s.membership_id join locations l on l.id=s.location_id where m.user_id='0021f57e-f379-4ae9-a099-689d7af46c62' and m.workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1';
select set_config('request.jwt.claim.sub','e8336f72-d18e-41bd-bb8d-fac7b8f74353',true);
select 'W2 ayse can_access mehmet (manager, now shares Kadikoy)', public.can_access_employee('6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1','9abeff35-d9ad-4d55-bedd-dbf9a932e92b');
select 'W3 ayse schedule shows mehmet row', jsonb_path_exists(public.get_schedule_read_model_service('e8336f72-d18e-41bd-bb8d-fac7b8f74353','6ea5d512-bc7f-4cf3-aad4-2f0815de0fa1','2026-09-29'),'$.employees[*] ? (@.id == "9abeff35-d9ad-4d55-bedd-dbf9a932e92b")');
select 'W4 ayse time off decision on own request blocked?', 'see code';
rollback;
