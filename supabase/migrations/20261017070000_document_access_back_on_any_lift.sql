-- BILDIRIM-U5 follow-up (KARARLAR S-127; review of 20261017050000_document_notices.sql): "Your access is back"
-- also when the person's last block lifts without a suspension of its own. A document past its date blocks
-- the person before the daily check suspends it (document_obligation_blocked); excusing it, or taking its
-- type down, lifted the block but changed no suspension, so the trigger never ran and a person told
-- "restricted" earlier was never told it was over. The trigger now runs on any write to a row that was
-- blocking (suspended, or past its date), and says "back" when that row no longer blocks and nothing else
-- of the person's does: the same "still blocked?" rule as before. "Back" follows a "restricted" only: the
-- person's case keeps when restricted was told (document_restriction_told_at), set when it is told and
-- cleared when back is told, so nobody hears their access is back who never heard it was restricted (a
-- document past due and excused before the daily check). The cases suspended today were told restricted.

alter table public.employee_onboarding_cases add column document_restriction_told_at timestamptz;
update public.employee_onboarding_cases c set document_restriction_told_at = now()
where exists (select 1 from public.employee_onboarding_requirements r
              where r.case_id = c.id and r.document_suspended_at is not null);

create or replace function app_private.document_access_told()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  place text;
  told timestamptz;
  restricted boolean := old.document_suspended_at is null and new.document_suspended_at is not null;
  lifted boolean := false;
begin
  if not restricted then
    -- This row blocked the person and no longer does: a suspension cleared, an exemption, a type taken down.
    lifted := app_private.document_obligation_blocked(old, now()) and not app_private.document_obligation_blocked(new, now());
    if not lifted then
      return null;
    end if;
  end if;
  select e.user_id into person from public.employee_profiles e where e.id = new.employee_id and e.workspace_id = new.workspace_id;
  if person is null then
    return null;
  end if;
  select c.document_restriction_told_at into told from public.employee_onboarding_cases c where c.id = new.case_id;
  if restricted then
    -- Already told restricted, by an earlier suspension: nothing new to tell.
    if told is not null then
      return null;
    end if;
    select w.name into place from public.workspaces w where w.id = new.workspace_id;
    -- The suspension stands whatever its notice does: a failure is logged (domain_work_outlives_notifications).
    begin
      perform app_private.notify('documents.access_changed', new.workspace_id, array[person],
        'doc_access:' || new.employee_id::text || ':restricted:' || new.document_suspended_at::text,
        'Upload your documents to use ' || place || ' again', 'A required document is past its due date.',
        '/account/documents?workspace=' || new.workspace_id::text, null, 'employee_documents', new.employee_id,
        jsonb_build_object('state', 'restricted'));
      update public.employee_onboarding_cases set document_restriction_told_at = now() where id = new.case_id;
    exception when others then
      raise warning 'document_access_told: restricted notice for % skipped: % (%)', new.employee_id, sqlerrm, sqlstate;
    end;
  else
    -- Back only after restricted was told, and only when nothing blocks the person any more, by the rule
    -- that blocks them (document_obligation_blocked): another suspension, or a document past due the daily
    -- check has not reached yet.
    if told is null or exists (select 1 from public.employee_onboarding_requirements x
               where x.case_id = new.case_id and app_private.document_obligation_blocked(x, now())) then
      return null;
    end if;
    begin
      perform app_private.notify('documents.access_changed', new.workspace_id, array[person],
        'doc_access:' || new.employee_id::text || ':restored:' || txid_current()::text,
        'Your access is back', 'Your documents are in order.',
        '/account/documents?workspace=' || new.workspace_id::text, null, 'employee_documents', new.employee_id,
        jsonb_build_object('state', 'restored'));
      update public.employee_onboarding_cases set document_restriction_told_at = null where id = new.case_id;
    exception when others then
      raise warning 'document_access_told: restored notice for % skipped: % (%)', new.employee_id, sqlerrm, sqlstate;
    end;
  end if;
  return null;
end;
$$;

revoke all on function app_private.document_access_told() from public;

-- Any write to a row that was blocking (suspended, or past its date) or that suspends it; other rows never
-- reach the function.
drop trigger document_access_told on public.employee_onboarding_requirements;
create trigger document_access_told
after update on public.employee_onboarding_requirements
for each row when (old.document_suspended_at is distinct from new.document_suspended_at
                   or old.document_suspended_at is not null or old.deadline_at <= now())
execute function app_private.document_access_told();
