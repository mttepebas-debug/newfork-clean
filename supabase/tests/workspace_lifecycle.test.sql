begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lifecycle-owner@example.test', '', '{}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lifecycle-member@example.test', '', '{}', '{}', now(), now());

-- A workspace is born as a draft, because create_owner_workspace writes its
-- setup row and the trigger reads it.
create temporary table lifecycle_target on commit drop as
select public.create_owner_workspace_service(
  '11000000-0000-4000-8000-000000000001',
  'Lifecycle Test Co'
) as workspace_id;

select is(
  (select lifecycle_status::text from public.workspaces where id = (select workspace_id from lifecycle_target)),
  'draft',
  'a workspace created by owner setup starts as a draft'
);
select ok(
  not app_private.workspace_allows_interactive_access((select workspace_id from lifecycle_target)),
  'a draft workspace cannot be opened'
);

update public.workspace_onboarding
set status = 'complete', completed_at = now(), current_step = 4
where workspace_id = (select workspace_id from lifecycle_target);

select is(
  (select lifecycle_status::text from public.workspaces where id = (select workspace_id from lifecycle_target)),
  'active',
  'finishing setup makes the workspace active'
);
select ok(
  app_private.workspace_allows_interactive_access((select workspace_id from lifecycle_target)),
  'an active workspace can be opened'
);

-- Starting over returns it to a draft, so the gate closes again.
update public.workspace_onboarding
set status = 'incomplete', completed_at = null, current_step = 1
where workspace_id = (select workspace_id from lifecycle_target);

select is(
  (select lifecycle_status::text from public.workspaces where id = (select workspace_id from lifecycle_target)),
  'draft',
  'starting setup over returns the workspace to a draft'
);

-- A workspace on hold is not brought back by its setup row.
update public.workspaces set lifecycle_status = 'suspended'
where id = (select workspace_id from lifecycle_target);
update public.workspace_onboarding
set status = 'complete', completed_at = now(), current_step = 4
where workspace_id = (select workspace_id from lifecycle_target);

select is(
  (select lifecycle_status::text from public.workspaces where id = (select workspace_id from lifecycle_target)),
  'suspended',
  'finishing setup does not lift a hold'
);
select ok(
  not app_private.workspace_allows_interactive_access((select workspace_id from lifecycle_target)),
  'a suspended workspace cannot be opened'
);

-- Closure: scheduled in the future still opens, past does not, and the state a
-- closed workspace ends in is 'deleted' (the plan calls it closed).
update public.workspaces
set lifecycle_status = 'closure_scheduled',
    closure_scheduled_at = now(),
    closure_effective_at = now() + interval '7 days'
where id = (select workspace_id from lifecycle_target);
select ok(
  app_private.workspace_allows_interactive_access((select workspace_id from lifecycle_target)),
  'a workspace scheduled to close still opens until the date'
);

update public.workspaces
set closure_effective_at = now() - interval '1 day'
where id = (select workspace_id from lifecycle_target);
select ok(
  not app_private.workspace_allows_interactive_access((select workspace_id from lifecycle_target)),
  'a workspace past its closure date cannot be opened'
);

update public.workspaces
set lifecycle_status = 'deleted',
    closure_scheduled_at = null,
    closure_effective_at = null,
    closed_at = now(),
    closed_by = '11000000-0000-4000-8000-000000000001'
where id = (select workspace_id from lifecycle_target);
select ok(
  not app_private.workspace_allows_interactive_access((select workspace_id from lifecycle_target)),
  'a closed workspace cannot be opened'
);

-- The setup escape hatch still works, so the owner can finish a draft.
update public.workspaces
set lifecycle_status = 'draft', closed_at = null, closed_by = null
where id = (select workspace_id from lifecycle_target);
select set_config('app.allow_incomplete_workspace_context', 'on', true);
select ok(
  app_private.workspace_allows_interactive_access((select workspace_id from lifecycle_target)),
  'a draft opens for the setup wizard that is finishing it'
);
select set_config('app.allow_incomplete_workspace_context', 'off', true);

update public.workspaces set lifecycle_status = 'active'
where id = (select workspace_id from lifecycle_target);

-- A membership remembers when it was last opened and which record it is.
-- The owner adds it, because a membership row is not something an anonymous
-- session may write.
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.employee_profiles (id, workspace_id, employee_code, first_name, last_name, created_by)
values ('13000000-0000-4000-8000-000000000001', (select workspace_id from lifecycle_target), 'E-9001', 'Lif', 'Cycle', '11000000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (id, workspace_id, user_id, status, last_used_at, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, legacy.last_used_at::timestamptz, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('12000000-0000-4000-8000-000000000001', (select workspace_id from lifecycle_target), '11000000-0000-4000-8000-000000000002', 'employee', 'active', now())) as legacy(id, workspace_id, user_id, role, status, last_used_at);

select set_config('request.jwt.claims', '', true);

select ok(
  (select last_used_at is not null from public.workspace_memberships where id = '12000000-0000-4000-8000-000000000001'),
  'a membership records when it was last opened'
);

-- The owner keeps building inside a draft workspace, straight from the browser.
-- Everybody else still waits outside until setup is finished. The closure above
-- revoked both memberships, so they come back first.
update public.workspace_memberships set status = 'active'
where workspace_id = (select workspace_id from lifecycle_target);
update public.workspaces set lifecycle_status = 'draft'
where id = (select workspace_id from lifecycle_target);
-- auth.uid() reads request.jwt.claim.sub first, and the service calls above
-- left the owner in it, so both settings name the account being tested.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(
  app_private.is_workspace_member((select workspace_id from lifecycle_target)),
  'the owner setting a workspace up still reads what they are building'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(
  not app_private.is_workspace_member((select workspace_id from lifecycle_target)),
  'a member who is not the owner cannot read a workspace that is still a draft'
);
-- The role lookup has to agree, because workspace_onboarding_update_owner reads
-- it: without a role the owner cannot write the very setup row the wizard is
-- filling in.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  app_private.workspace_role_for((select workspace_id from lifecycle_target)),
  'owner'::public.workspace_role,
  'the owner still holds their role inside a draft they are setting up'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(
  app_private.workspace_role_for((select workspace_id from lifecycle_target)) is null,
  'a member who is not the owner holds no role inside a draft'
);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
update public.workspaces set lifecycle_status = 'active'
where id = (select workspace_id from lifecycle_target);

-- Removal is its own state now, not a suspension wearing the wrong name.
update public.workspace_memberships set status = 'removed'
where id = '12000000-0000-4000-8000-000000000001';
select is(
  (select status::text from public.workspace_memberships where id = '12000000-0000-4000-8000-000000000001'),
  'removed',
  'a membership can say it was removed'
);

-- Two labels are kept only so 72 functions keep compiling. Nothing writes them.
select is(
  (select count(*) from public.workspace_memberships where status = 'invited'),
  0::bigint,
  'no membership uses the retired invited status'
);

-- Losing the employee record does not lose the membership.
delete from public.employee_profiles where id = '13000000-0000-4000-8000-000000000001';
select ok(
  exists (select 1 from public.workspace_memberships where id = '12000000-0000-4000-8000-000000000001'),
  'the membership survives its employee record'
);

select * from finish();
rollback;
