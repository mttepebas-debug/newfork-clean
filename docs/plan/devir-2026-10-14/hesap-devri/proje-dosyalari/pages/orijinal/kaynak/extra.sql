begin;
select tests.demo_user('x:alex', 'Alex', 'Morgan');
select tests.demo_user('x:jordan', 'Jordan', 'Hayes');
select public.create_owner_workspace_service(tests.user('x:jordan'), 'Hayes Kitchen');
commit;
