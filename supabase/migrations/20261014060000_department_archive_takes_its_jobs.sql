-- Settings > Jobs (Mert, 2026-10-13, Jobs decision 6): archiving a department
-- takes its active jobs to the archive with it, in the same write. The old
-- guard that refused the archive until every job was archived first goes.
-- Restoring a department brings it back with no jobs; restoring a job brings
-- it back under its department when that department is active, otherwise
-- under No department. A department that is archived takes no active job:
-- neither a new one nor one moved into it.
--
-- Both triggers run with the writer's rights, so the browser's own RLS on
-- jobs decides what the archive may touch. The job guard fires after
-- deleted_department_job_guard (trigger names run in order), so a department
-- deleted meanwhile still answers PT409 department.deleted first.

drop trigger departments_archive_guard_trigger on public.departments;
drop function public.prevent_department_archive_with_active_jobs();

create function app_private.department_archive_takes_its_jobs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    update public.jobs set archived_at = new.archived_at, updated_at = now()
    where workspace_id = new.workspace_id and department_id = new.id
      and archived_at is null and deleted_at is null;
  end if;
  return null;
end;
$$;

create function app_private.keep_jobs_out_of_archived_departments()
returns trigger
language plpgsql
set search_path = ''
as $$
declare department_archived_at timestamptz;
begin
  if new.archived_at is not null or new.department_id is null then return new; end if;
  -- Shares the department's row so an archive running at the same moment
  -- either waits for this job or is seen by it.
  select department.archived_at into department_archived_at
  from public.departments department
  where department.id = new.department_id and department.workspace_id = new.workspace_id
  for share;
  if department_archived_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.archived_at is not null then
    new.department_id := null;
    return new;
  end if;
  if tg_op = 'INSERT' or new.department_id is distinct from old.department_id then
    raise exception 'Restore the department before adding jobs'
      using errcode = '22023', hint = 'department.archived';
  end if;
  return new;
end;
$$;

revoke all on function app_private.department_archive_takes_its_jobs() from public, anon, authenticated;
revoke all on function app_private.keep_jobs_out_of_archived_departments() from public, anon, authenticated;

create trigger department_archive_takes_its_jobs
after update of archived_at on public.departments
for each row execute function app_private.department_archive_takes_its_jobs();

create trigger jobs_stay_out_of_archived_departments
before insert or update of department_id, archived_at on public.jobs
for each row execute function app_private.keep_jobs_out_of_archived_departments();

-- An active job already under an archived department (a job restored there
-- before this rule) moves to No department, as a restore now does.
update public.jobs job set department_id = null, updated_at = now()
from public.departments department
where department.id = job.department_id and department.workspace_id = job.workspace_id
  and department.archived_at is not null
  and job.archived_at is null and job.deleted_at is null;
