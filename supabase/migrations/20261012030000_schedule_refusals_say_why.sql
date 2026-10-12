-- BL-1044: a Schedule write refused with PT409 now says which kind of refusal
-- in its hint, the machine key the API passes on as `reason`. The edit session
-- refusals already carried one (schedule.edit_session_closed / _stale,
-- schedule.edit_lease_expired); the rest raised a bare PT409, so the API told
-- the availability review apart by its English sentence and the screens read
-- auto-fill's and the templates' refusals by sentence or by status alone. Only
-- the hints are added; every sentence, code and check stays as it was.
--   schedule.auto_fill_stale              the edit or the shifts moved on since the auto-fill review: review again
--   schedule.default_hours_stale          defaults, shifts or conflicts moved on since the default-hours review: review again
--   schedule.request_key_reused           a retry key replayed with other content (default hours, pasted batch)
--   schedule.template_changed             the template was renamed or deleted meanwhile: reload
--   schedule.reference_hours_changed      a shift's reference hours or its type's defaults moved on: reload
--   schedule.availability_review_required the availability assessment moved on: review it again before saving
--   schedule.publication_changed          the publish or unpublish preview no longer matches: review again
--   schedule.edit_session_stale           (save) the edit moved on under a concurrent write: reload
--   schedule.rules_changed                the conflict rules moved on (Settings > Conflict handling): reload
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
      raise exception 'schedule refusals say why: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.apply_schedule_auto_fill_service(uuid,uuid,uuid,integer,text,jsonb)', array[
  '''stale auto-fill preview'' using errcode = ''PT409''',
  '''stale auto-fill preview'' using errcode = ''PT409'', hint = ''schedule.auto_fill_stale''', '2'
]);

select pg_temp.patch('public.apply_schedule_default_hours_service(uuid,uuid,uuid,jsonb)', array[
  '''Retry key was already used for a different review'' using errcode = ''PT409''',
  '''Retry key was already used for a different review'' using errcode = ''PT409'', hint = ''schedule.request_key_reused''', '1',
  '''Defaults, shifts or conflicts changed; review again'' using errcode = ''PT409''',
  '''Defaults, shifts or conflicts changed; review again'' using errcode = ''PT409'', hint = ''schedule.default_hours_stale''', '1'
]);

select pg_temp.patch('public.preview_schedule_default_hours_service(uuid,uuid,uuid,jsonb)', array[
  '''Selected shifts changed or are outside these dates'' using errcode = ''PT409''',
  '''Selected shifts changed or are outside these dates'' using errcode = ''PT409'', hint = ''schedule.default_hours_stale''', '1'
]);

select pg_temp.patch('public.create_schedule_shifts_batch_service(uuid,uuid,uuid,integer,jsonb,uuid)', array[
  '''Request key already used for a different batch'' using errcode = ''PT409''',
  '''Request key already used for a different batch'' using errcode = ''PT409'', hint = ''schedule.request_key_reused''', '1'
]);

select pg_temp.patch('public.delete_schedule_template_service(uuid,uuid,uuid,integer)', array[
  '''schedule template revision stale'' using errcode = ''PT409''',
  '''schedule template revision stale'' using errcode = ''PT409'', hint = ''schedule.template_changed''', '1'
]);

select pg_temp.patch('public.rename_schedule_template_service(uuid,uuid,uuid,text,integer)', array[
  '''schedule template revision stale'' using errcode = ''PT409''',
  '''schedule template revision stale'' using errcode = ''PT409'', hint = ''schedule.template_changed''', '1'
]);

select pg_temp.patch('public.normalize_schedule_time_source(uuid,jsonb,jsonb,boolean)', array[
  '''Refresh the schedule before changing reference hours'' using errcode = ''PT409''',
  '''Refresh the schedule before changing reference hours'' using errcode = ''PT409'', hint = ''schedule.reference_hours_changed''', '1',
  '''Shift default hours changed; refresh the reference before saving'' using errcode = ''PT409''',
  '''Shift default hours changed; refresh the reference before saving'' using errcode = ''PT409'', hint = ''schedule.reference_hours_changed''', '1'
]);

select pg_temp.patch('public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)', array[
  '''Review the current availability assessment before saving'' using errcode=''PT409''',
  '''Review the current availability assessment before saving'' using errcode=''PT409'', hint=''schedule.availability_review_required''', '2'
]);

select pg_temp.patch('public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,uuid[])', array[
  'raise exception ''%'',SQLERRM using errcode=''PT409''',
  'raise exception ''%'',SQLERRM using errcode=''PT409'', hint=''schedule.publication_changed''', '1'
]);

select pg_temp.patch('public.unpublish_schedule_service(uuid,uuid,date,uuid[],text)', array[
  'raise exception ''%'',SQLERRM using errcode=''PT409''',
  'raise exception ''%'',SQLERRM using errcode=''PT409'', hint=''schedule.publication_changed''', '1'
]);

select pg_temp.patch('public.save_schedule_edit_session_service(uuid,uuid,uuid,integer,text,uuid,integer,boolean)', array[
  'raise exception ''%'',SQLERRM using errcode=''PT409''',
  'raise exception ''%'',SQLERRM using errcode=''PT409'', hint=''schedule.edit_session_stale''', '1'
]);

select pg_temp.patch('public.update_scheduling_settings_service(uuid,uuid,jsonb)', array[
  '''Conflict rules changed. Reload the current rules before saving.'' using errcode=''PT409''',
  '''Conflict rules changed. Reload the current rules before saving.'' using errcode=''PT409'', hint=''schedule.rules_changed''', '1'
]);
