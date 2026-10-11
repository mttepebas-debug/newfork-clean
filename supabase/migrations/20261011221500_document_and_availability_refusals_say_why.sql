-- BL-1028: a document or availability write refused with PT409 now says which
-- kind of refusal in its hint, the machine key the API passes on as `reason`.
-- One code used to mean both "someone changed this meanwhile, reload" and a
-- standing "this cannot happen", so the document drawer had to reload to guess
-- which one it got. Only the hints are added; every sentence, code and check
-- stays as it was.
--   document.changed              the document, policy, submission or publication moved on: reload
--   employee.revision_conflict    the person's record moved on (document time zone): reload
--   availability.changed          the week, the availability settings or the shift types moved on: reload
--   document.paused               the document is unpublished; nothing to reload
--   document.published_locked     a published document's content cannot be edited
--   document.archived             an archived document cannot be published
--   document.acknowledgement_request_reused  a signing request key replayed with other content
--   schedule.busy                 the schedule is being published; retry
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

select pg_temp.patch('app_private.apply_lifecycle_definition(uuid,uuid,uuid,integer,text,text,text)', array[
  '''document impact changed; refresh preview'' using errcode=''PT409''',
  '''document impact changed; refresh preview'' using errcode=''PT409'',hint=''document.changed''', '1',
  '''document type changed; refresh required'' using errcode=''PT409''',
  '''document type changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('app_private.assert_document_published(public.employee_onboarding_requirements)', array[
  '''Document is unpublished; changes are paused'' using errcode=''PT409''',
  '''Document is unpublished; changes are paused'' using errcode=''PT409'',hint=''document.paused''', '1'
]);

select pg_temp.patch('app_private.guard_document_definition_edit()', array[
  '''Published documents cannot be edited; unpublish first'' using errcode=''PT409''',
  '''Published documents cannot be edited; unpublish first'' using errcode=''PT409'',hint=''document.published_locked''', '1'
]);

select pg_temp.patch('app_private.set_document_exemption(public.employee_onboarding_requirements,uuid,boolean,text,integer)', array[
  '''document changed; refresh required'' using errcode=''PT409''',
  '''document changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.acknowledge_document_lifecycle_service(uuid,uuid,uuid,integer,text,text,timestamp with time zone,uuid)', array[
  '''acknowledgement was withdrawn; use a new request'' using errcode=''PT409''',
  '''acknowledgement was withdrawn; use a new request'' using errcode=''PT409'',hint=''document.acknowledgement_request_reused''', '1',
  '''policy changed; refresh required'' using errcode=''PT409''',
  '''policy changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1',
  '''acknowledgement request changed'' using errcode=''PT409''',
  '''acknowledgement request changed'' using errcode=''PT409'',hint=''document.acknowledgement_request_reused''', '1',
  '''policy already acknowledged; refresh required'' using errcode=''PT409''',
  '''policy already acknowledged; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.defer_initial_employee_document_service(uuid,uuid,integer,text)', array[
  '''document changed; refresh required'' using errcode=''PT409''',
  '''document changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.extend_employee_document_deadline_service(uuid,uuid,uuid,integer,integer,text)', array[
  '''document changed; refresh required'' using errcode=''PT409''',
  '''document changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.preview_document_publication_service(uuid,uuid,uuid)', array[
  '''Archived documents cannot be published; restore first'' using errcode=''PT409''',
  '''Archived documents cannot be published; restore first'' using errcode=''PT409'',hint=''document.archived''', '1'
]);

select pg_temp.patch('public.remove_employee_document_draft_file_service(uuid,uuid,uuid,integer,uuid,uuid)', array[
  '''draft unavailable'' using errcode=''PT409''',
  '''draft unavailable'' using errcode=''PT409'',hint=''document.changed''', '1',
  '''document changed; refresh required'' using errcode=''PT409''',
  '''document changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb)', array[
  '''submission changed; refresh required'' using errcode=''PT409''',
  '''submission changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1',
  '''document changed; refresh required'' using errcode=''PT409''',
  '''document changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.save_document_type_lifecycle_service(uuid,uuid,uuid,integer,jsonb)', array[
  '''document type changed; refresh required'' using errcode=''PT409''',
  '''document type changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.save_employee_document_draft_file_service(uuid,uuid,integer,text,text,text,bigint)', array[
  '''document changed; refresh required'' using errcode=''PT409''',
  '''document changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.save_policy_lifecycle_service(uuid,uuid,uuid,jsonb)', array[
  '''policy draft changed; refresh required'' using errcode=''PT409''',
  '''policy draft changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.set_document_publication_service(uuid,uuid,uuid,integer,integer,text,text,text)', array[
  '''Document publication changed; refresh required'' using errcode=''PT409''',
  '''Document publication changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1',
  '''Document publication impact changed; refresh preview'' using errcode=''PT409''',
  '''Document publication impact changed; refresh preview'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.set_employee_document_timezone_service(uuid,uuid,uuid,integer,text)', array[
  '''employee changed; refresh required'' using errcode=''PT409''',
  '''employee changed; refresh required'' using errcode=''PT409'',hint=''employee.revision_conflict''', '1'
]);

select pg_temp.patch('public.submit_employee_document_lifecycle_service(uuid,uuid,integer,uuid,date,jsonb)', array[
  '''document changed; refresh required'' using errcode=''PT409''',
  '''document changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.withdraw_document_acknowledgement_service(uuid,uuid,uuid,integer)', array[
  '''policy changed; refresh required'' using errcode=''PT409''',
  '''policy changed; refresh required'' using errcode=''PT409'',hint=''document.changed''', '1',
  '''current acknowledgement unavailable'' using errcode=''PT409''',
  '''current acknowledgement unavailable'' using errcode=''PT409'',hint=''document.changed''', '1'
]);

select pg_temp.patch('public.guard_schedule_availability_input_write()', array[
  '''The schedule is being updated. Your changes were not saved; review and retry.'' using errcode=''PT409''',
  '''The schedule is being updated. Your changes were not saved; review and retry.'' using errcode=''PT409'',hint=''schedule.busy''', '1'
]);

select pg_temp.patch('public.validate_weekly_preference_command(uuid,uuid,jsonb)', array[
  '''Availability changed. Reload before saving; your draft has not been saved.'' using errcode=''PT409''',
  '''Availability changed. Reload before saving; your draft has not been saved.'' using errcode=''PT409'',hint=''availability.changed''', '1',
  '''A selected shift type is no longer available. Reload before saving.'' using errcode=''PT409''',
  '''A selected shift type is no longer available. Reload before saving.'' using errcode=''PT409'',hint=''availability.changed''', '1',
  '''Use the current organization entry mode'' using errcode=''PT409''',
  '''Use the current organization entry mode'' using errcode=''PT409'',hint=''availability.changed''', '1',
  '''Employee preferences changed. Copy the latest saved week again.'' using errcode=''PT409''',
  '''Employee preferences changed. Copy the latest saved week again.'' using errcode=''PT409'',hint=''availability.changed''', '1',
  '''Availability settings changed. Reload before saving.'' using errcode=''PT409''',
  '''Availability settings changed. Reload before saving.'' using errcode=''PT409'',hint=''availability.changed''', '1'
]);

select pg_temp.patch('public.weekly_preference_settings_save_service(uuid,uuid,jsonb,uuid)', array[
  '''Availability settings changed. Reload the latest settings before saving.'' using errcode = ''PT409''',
  '''Availability settings changed. Reload the latest settings before saving.'' using errcode = ''PT409'',hint=''availability.changed''', '1'
]);
