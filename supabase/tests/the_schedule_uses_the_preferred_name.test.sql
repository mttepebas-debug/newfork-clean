begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- A preferred name is what people are called where they are scheduled. Most of
-- the schedule already knew that and only ever saw an empty string, because the
-- column was pinned there by a check constraint. Five surfaces were missed and
-- kept showing the name on file beside surfaces that had switched over, so one
-- person appeared under two names on one screen.
--
-- The other half of the rule matters just as much: a document, a signature and
-- an onboarding record use the name on file, and nothing here changes that.

-- Every function that builds a display name for a schedule surface asks for the
-- preferred one first. This reads the bodies rather than calling them, because
-- what it is protecting is a rule about all of them rather than the behaviour
-- of any one.
select is(
  (select string_agg(p.proname, ', ' order by p.proname)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app_private')
     and p.proname in (
       'list_schedule_draft_document_conflicts_service',
       'preview_schedule_default_hours_service',
       'weekly_schedule_publication_preflight'
     )
     and p.prosrc !~ 'preferred_name'),
  null,
  'no schedule surface builds a name without asking for the preferred one'
);

-- And the ones that must not. A legal name is what a document is for.
select is(
  (select string_agg(p.proname, ', ' order by p.proname)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   -- document_obligation_json lives in app_private, so a check that looked only
   -- at public would pass without ever reading it.
   where n.nspname in ('public', 'app_private')
     and p.proname in (
       'document_obligation_json',
       'acknowledge_document_lifecycle_service',
       'preview_document_publication_service'
     )
     and p.prosrc ~ 'preferred_name'),
  null,
  'and no document surface has quietly picked one up'
);

-- The behaviour itself, end to end.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('24000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'called-sasha@example.test', '', '{}', '{}', now(), now());
insert into public.user_profiles (user_id, display_name)
values ('24000000-0000-4000-8000-000000000001', 'Alexander Okonkwo');

create temporary table called_target on commit drop as
select public.create_owner_workspace_service(
  '24000000-0000-4000-8000-000000000001', 'Called Co'
) as workspace_id;

insert into public.employee_profiles (id, workspace_id, user_id, employee_code, first_name, last_name, created_by)
values (
  '25000000-0000-4000-8000-000000000001',
  (select workspace_id from called_target),
  '24000000-0000-4000-8000-000000000001',
  'E-7301', 'Alexander', 'Okonkwo',
  '24000000-0000-4000-8000-000000000001'
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '25000000-0000-4000-8000-000000000001'),
  '',
  'somebody starts with no preferred name'
);

select is(
  public.request_employee_preferred_name_service(
    '24000000-0000-4000-8000-000000000001',
    (select workspace_id from called_target),
    '25000000-0000-4000-8000-000000000001',
    'Sasha'
  ),
  'published',
  'and asking for one takes effect where the workspace lets it through'
);

-- What the schedule calls them now. The expression each surface uses, read off
-- the record the way those functions read it.
select is(
  (select concat_ws(' ', coalesce(nullif(preferred_name, ''), first_name), last_name)
   from public.employee_profiles where id = '25000000-0000-4000-8000-000000000001'),
  'Sasha Okonkwo',
  'the schedule calls them what they asked to be called'
);

-- And the name on file has not moved, because that is the other half of it.
select is(
  (select first_name || ' ' || last_name from public.employee_profiles
   where id = '25000000-0000-4000-8000-000000000001'),
  'Alexander Okonkwo',
  'while the name on file is exactly where it was'
);

-- Clearing it puts everybody back on the name on file, without asking anybody.
select is(
  public.request_employee_preferred_name_service(
    '24000000-0000-4000-8000-000000000001',
    (select workspace_id from called_target),
    '25000000-0000-4000-8000-000000000001',
    ''
  ),
  'cleared',
  'and taking it back needs no answer from anybody'
);

select is(
  (select concat_ws(' ', coalesce(nullif(preferred_name, ''), first_name), last_name)
   from public.employee_profiles where id = '25000000-0000-4000-8000-000000000001'),
  'Alexander Okonkwo',
  'after which the schedule uses the name on file again'
);

select * from finish();
rollback;
