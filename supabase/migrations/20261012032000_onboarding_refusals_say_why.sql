-- BL-1046: an onboarding write refused with PT409 now says which kind of
-- refusal in its hint, the machine key the API passes on as `reason`, the way
-- documents and availability do (BL-1028). The welcome steps, the manager's
-- review and the owner's setup showed the database's own sentence instead.
-- Only the hints are added; every sentence, code and check stays as it was.
--   onboarding.changed              the employee's onboarding moved on (another tab, a review): reload
--   onboarding.review_in_documents  a document is reviewed in Documents, not from the onboarding review
--   workspace.onboarding_changed    the owner's setup moved on (another tab): reload
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
      raise exception 'onboarding refusals say why: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('app_private.apply_owner_onboarding_update(uuid,uuid,text,smallint,boolean,integer,text,text,text)', array[
  '''owner onboarding revision conflict'' using errcode = ''PT409''',
  '''owner onboarding revision conflict'' using errcode = ''PT409'', hint = ''workspace.onboarding_changed''', '1'
]);

select pg_temp.patch('public.leave_employee_onboarding_service(uuid,integer,uuid)', array[
  '''onboarding changed; refresh required'' using errcode = ''PT409''',
  '''onboarding changed; refresh required'' using errcode = ''PT409'', hint = ''onboarding.changed''', '1'
]);

select pg_temp.patch('public.review_employee_onboarding_before_availability_service(uuid,uuid,uuid,text,uuid,text,integer,boolean)', array[
  '''onboarding changed; refresh required'' using errcode = ''PT409''',
  '''onboarding changed; refresh required'' using errcode = ''PT409'', hint = ''onboarding.changed''', '1'
]);

select pg_temp.patch('public.review_employee_onboarding_service(uuid,uuid,uuid,text,uuid,text,integer,boolean)', array[
  '''Review the submitted document version in Documents'' using errcode=''PT409''',
  '''Review the submitted document version in Documents'' using errcode=''PT409'',hint=''onboarding.review_in_documents''', '1'
]);

select pg_temp.patch('public.save_employee_onboarding_profile_service(uuid,jsonb,integer,uuid)', array[
  '''onboarding changed; refresh required'' using errcode = ''PT409''',
  '''onboarding changed; refresh required'' using errcode = ''PT409'', hint = ''onboarding.changed''', '1'
]);

select pg_temp.patch('public.submit_employee_onboarding_service(uuid,integer,uuid)', array[
  '''onboarding changed; refresh required'' using errcode = ''PT409''',
  '''onboarding changed; refresh required'' using errcode = ''PT409'', hint = ''onboarding.changed''', '1'
]);
