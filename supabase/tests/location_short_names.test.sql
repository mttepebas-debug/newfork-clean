begin;
select plan(13);

insert into auth.users(id, email) values ('b1370000-0000-4000-8000-000000000001', 'export-short-name@example.test');
insert into public.workspaces(id,name,created_by) values
 ('b1370000-0000-4000-8000-000000000002','Export test A','b1370000-0000-4000-8000-000000000001'),
 ('b1370000-0000-4000-8000-000000000003','Export test B','b1370000-0000-4000-8000-000000000001');
create function pg_temp.add_location(n text, short text, w uuid default 'b1370000-0000-4000-8000-000000000002') returns void
language sql as $$
 insert into public.locations(workspace_id,name,short_name,street_address,city,region,postal_code,timezone)
 values(w,n,short,'','','','','UTC');
$$;
select lives_ok($$select pg_temp.add_location('One','MAIN')$$,'new location accepts short name');
select throws_ok($$select pg_temp.add_location('Duplicate','main')$$,'23505',null,'case-insensitive uniqueness is enforced');
select lives_ok($$select pg_temp.add_location('Other workspace','MAIN','b1370000-0000-4000-8000-000000000003')$$,'uniqueness is workspace scoped');
select throws_ok($$select pg_temp.add_location('Missing',null)$$,'23514','A location short name is required','new location requires a short name');
select throws_ok($$select pg_temp.add_location('Short','A')$$,'23514',null,'one character rejected');
select throws_ok($$select pg_temp.add_location('Long','ABCDEFGHIJKLM')$$,'23514',null,'thirteen characters rejected');
select throws_ok($$select pg_temp.add_location('Space','A B')$$,'23514',null,'spaces rejected');
select lives_ok($$select pg_temp.add_location('Unicode','Şişli-2')$$,'unicode letters and hyphen accepted');
select throws_ok($$update public.locations set short_name=null where workspace_id='b1370000-0000-4000-8000-000000000002' and name='One'$$,'23514','A location short name is required','assigned name cannot be cleared');
select lives_ok($$update public.locations set short_name='MAIN-2' where workspace_id='b1370000-0000-4000-8000-000000000002' and name='One'$$,'short name is editable');
select ok((select relrowsecurity from pg_class where oid='public.locations'::regclass),'existing RLS remains enabled');
set local role service_role;
select lives_ok($$select id,short_name from public.locations where workspace_id='b1370000-0000-4000-8000-000000000002'$$,'service enrichment can read scoped short names');
select throws_ok($$select street_address from public.locations$$,'42501',null,'short-name grant does not widen location column access');
reset role;
select * from finish();
rollback;
