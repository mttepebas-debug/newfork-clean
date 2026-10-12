-- BL-1045: an Employees, Jobs or Locations write refused with PT409 now says
-- which kind of refusal in its hint, the machine key the API passes on as
-- `reason` (and supabase-js hands to the Settings catalog writes). One code
-- used to mean both "someone changed or deleted this meanwhile, reload" and a
-- standing "this cannot happen", so the job drawer offered Reload for every
-- error. Only the hints are added; every sentence, code and check stays as it
-- was. The same method as BL-1028 (20261011221500).
--   job.changed                    the job's details moved on: reload
--   employee.revision_conflict     a person's record moved on (job assignments): reload
--   employee.archived              a person was archived meanwhile: reload the employee list
--   job.deleted                    the job was deleted meanwhile: reload jobs
--   department.deleted             the department was deleted meanwhile: reload departments
--   location.deleted               the location was deleted meanwhile: reload locations
--   catalog.deleted                a department, location, shift type or label was deleted meanwhile: reload
--   employee.create_request_reused a create request key replayed with other details; nothing to reload
--
-- The functions change on the definitions the database holds
-- (pg_get_functiondef): each anchor must be found exactly as often as
-- expected, or nothing changes.

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  -- [anchor, replacement, expected count] triples.
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception 'refusals say why: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('app_private.guard_assignment_deleted_job()', array[
  '''This job was deleted. Reload jobs before assigning it.'' using errcode=''PT409''',
  '''This job was deleted. Reload jobs before assigning it.'' using errcode=''PT409'',hint=''job.deleted''', '1'
]);

select pg_temp.patch('app_private.guard_catalog_deletion_state()', array[
  '''This item was deleted. Reload the catalog.'' using errcode=''PT409''',
  '''This item was deleted. Reload the catalog.'' using errcode=''PT409'',hint=''catalog.deleted''', '1'
]);

select pg_temp.patch('app_private.guard_deleted_department_job()', array[
  '''This department was deleted. Reload departments.'' using errcode=''PT409''',
  '''This department was deleted. Reload departments.'' using errcode=''PT409'',hint=''department.deleted''', '1'
]);

select pg_temp.patch('app_private.guard_deleted_location_assignment()', array[
  '''This location was deleted. Reload locations.'' using errcode=''PT409''',
  '''This location was deleted. Reload locations.'' using errcode=''PT409'',hint=''location.deleted''', '1'
]);

select pg_temp.patch('public.create_employee_command_service(uuid,uuid,uuid,jsonb,uuid)', array[
  '''idempotency key belongs to different employee details'' using errcode = ''PT409''',
  '''idempotency key belongs to different employee details'' using errcode = ''PT409'', hint = ''employee.create_request_reused''', '1'
]);

select pg_temp.patch('public.update_job_assignments_service(uuid,uuid,uuid,jsonb)', array[
  '''An employee was archived. Reload the employee list.'' using errcode=''PT409''',
  '''An employee was archived. Reload the employee list.'' using errcode=''PT409'',hint=''employee.archived''', '1',
  '''Employee % changed. Reload employees and review your pending changes.'',employee.employee_code using errcode=''PT409''',
  '''Employee % changed. Reload employees and review your pending changes.'',employee.employee_code using errcode=''PT409'',hint=''employee.revision_conflict''', '1'
]);

select pg_temp.patch('public.update_job_details_and_assignments_service(uuid,uuid,uuid,jsonb,jsonb,jsonb)', array[
  '''Job details changed. Reload the latest job and review your draft.'' using errcode = ''PT409''',
  '''Job details changed. Reload the latest job and review your draft.'' using errcode = ''PT409'', hint = ''job.changed''', '1'
]);
